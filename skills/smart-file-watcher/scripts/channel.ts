#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { appendFileSync, readFileSync } from "fs";
import { resolve, relative, basename, extname } from "path";
import { FileWatcher, type ChangeEvent } from "./watcher";
import type { CanvasNode, CanvasData } from "./canvas-types";
import { triage, type EventBatch, type TriageResult, type NodeGeometry } from "./triage";
import { triageLive, getLastStats, closeLiveSession, sendToSession, connectSession, setHandler, clearHandler } from "./triage-live";
import {
  canvasAddNode,
  canvasUpdateNode,
  markdownAppend,
} from "./file-editor";

const LOG = "/tmp/smart-file-watcher.log";
function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG, `[${ts}] [channel] ${msg}\n`);
}

log("=== smart-file-watcher channel server starting ===");

// --- Configuration ---

/** Low debounce on the raw watcher — we do smart batching on top */
const RAW_DEBOUNCE_MS = 150;
/** How long to wait after the last event before processing a batch */
const SETTLE_MS = 800;
/** Maximum batch age before forcing processing even if events keep coming */
const MAX_BATCH_AGE_MS = 5000;
/** Model to use for triage (request/response mode) */
const TRIAGE_MODEL = process.env.TRIAGE_MODEL || "gemini-3.1-flash-lite-preview";
/** Model to use for live/realtime mode */
const LIVE_MODEL = process.env.LIVE_MODEL || "gemini-3.1-flash-live-preview";
/** Triage mode: "request" (per-event HTTP) or "live" (persistent WebSocket session) */
let triageMode: "request" | "live" = (process.env.TRIAGE_MODE || "request") as "request" | "live";

/** Latest anchor node geometry — updated on each live batch so the handler can position responses */
let latestAnchor: NodeGeometry | undefined;
/** Latest file path being triaged in live mode */
let latestFilePath: string | undefined;
/** Latest relative path being triaged in live mode */
let latestRelPath: string | undefined;
/** Latest file type being triaged in live mode */
let latestFileType: "canvas" | "markdown" | "other" | undefined;

// --- Canvas diffing (reused from file-watcher) ---

const MAX_LABEL = 30;

function truncate(s: string, n: number): string {
  s = s.replace(/\n/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n - 1) + "\u2026";
}

function nodeLabel(n: CanvasNode): string {
  switch (n.type) {
    case "text": return truncate(n.text, MAX_LABEL);
    case "file": return truncate(n.file, MAX_LABEL);
    case "link": return truncate(n.url, MAX_LABEL);
    case "group": return n.label ? truncate(n.label, MAX_LABEL) : "group";
  }
}

interface NodeChange {
  fields: string[];
  hasContent: boolean;
}

function describeNodeChange(prev: CanvasNode, curr: CanvasNode): NodeChange | null {
  const fields: string[] = [];
  let hasContent = false;
  if (prev.type !== curr.type) { fields.push(`type=${curr.type}`); hasContent = true; }
  if (prev.color !== curr.color) { fields.push(`color=${curr.color}`); hasContent = true; }
  const prevText = prev.type === "text" ? prev.text : undefined;
  const currText = curr.type === "text" ? curr.text : undefined;
  if (prevText !== currText) { fields.push("text"); hasContent = true; }
  const prevFile = prev.type === "file" ? prev.file : undefined;
  const currFile = curr.type === "file" ? curr.file : undefined;
  if (prevFile !== currFile) { fields.push("file"); hasContent = true; }
  if (prev.x !== curr.x || prev.y !== curr.y) fields.push("pos");
  if (prev.width !== curr.width || prev.height !== curr.height) fields.push("size");
  if (fields.length === 0) return null;
  return { fields, hasContent };
}

interface CanvasDiffResult {
  text: string;
  changedNodes: NodeGeometry[];
}

function canvasDiff(prevJson: string, currJson: string): CanvasDiffResult | null {
  let prev: CanvasData, curr: CanvasData;
  try {
    prev = JSON.parse(prevJson);
    curr = JSON.parse(currJson);
  } catch { return null; }
  if (!prev.nodes || !curr.nodes) return null;

  const prevMap = new Map(prev.nodes.map(n => [n.id, n]));
  const currMap = new Map(curr.nodes.map(n => [n.id, n]));
  const lines: string[] = [];
  const changedNodes: NodeGeometry[] = [];

  for (const [id, n] of currMap) {
    if (!prevMap.has(id)) {
      lines.push(`A id=${id} ${n.type ?? ""} "${nodeLabel(n)}"`);
      changedNodes.push({ id, x: n.x, y: n.y, width: n.width, height: n.height });
    }
  }
  for (const [id, n] of prevMap) {
    if (!currMap.has(id)) {
      lines.push(`D id=${id} ${n.type ?? ""} "${nodeLabel(n)}"`);
    }
  }
  for (const [id, curr_n] of currMap) {
    const prev_n = prevMap.get(id);
    if (!prev_n) continue;
    const change = describeNodeChange(prev_n, curr_n);
    if (change) {
      if (change.hasContent) {
        lines.push(`M id=${id} ${change.fields.join(",")} "${nodeLabel(curr_n)}"`);
        changedNodes.push({ id, x: curr_n.x, y: curr_n.y, width: curr_n.width, height: curr_n.height });
      } else {
        lines.push(`M id=${id} ${change.fields.join(",")}`);
      }
    }
  }

  const prevEdges = new Set((prev.edges ?? []).map(e => e.id));
  const currEdges = new Set((curr.edges ?? []).map(e => e.id));
  const addedEdges = [...currEdges].filter(id => !prevEdges.has(id)).length;
  const removedEdges = [...prevEdges].filter(id => !currEdges.has(id)).length;
  if (addedEdges) lines.push(`A ${addedEdges} edge(s)`);
  if (removedEdges) lines.push(`D ${removedEdges} edge(s)`);

  if (lines.length === 0) return null;
  return { text: lines.map(l => "  " + l).join("\n"), changedNodes };
}

// --- Rich triage context for canvas files ---

function clipMiddle(s: string, max: number): string {
  s = s.replace(/\n/g, " ").trim();
  if (s.length <= max) return s;
  const half = Math.floor((max - 3) / 2);
  return s.slice(0, half) + "..." + s.slice(-half);
}

function nodeSnippet(n: CanvasNode): string {
  switch (n.type) {
    case "text": return clipMiddle(n.text, 40);
    case "file": return clipMiddle(n.file, 40);
    case "link": return clipMiddle(n.url, 40);
    case "group": return n.label ? clipMiddle(n.label, 40) : "group";
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

const MAX_NODE_CONTENT = 300;

/**
 * Build a rich diff for the triage model. For each changed node:
 * - Node content (capped at MAX_NODE_CONTENT chars, clipped around change)
 * - Nearest neighbors with id/type/brief snippet
 */
function buildTriageDiff(
  changedNodeIds: string[],
  filePath: string
): string | null {
  let canvas: CanvasData;
  try {
    canvas = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch { return null; }
  if (!canvas.nodes) return null;

  const nodeMap = new Map(canvas.nodes.map(n => [n.id, n]));
  const lines: string[] = [];

  for (const id of changedNodeIds) {
    const node = nodeMap.get(id);
    if (!node) continue;

    // Content of the changed node, capped
    const raw = node.type === "text" ? node.text
      : node.type === "file" ? node.file
      : node.type === "link" ? node.url
      : node.label ?? "group";
    const content = raw.length <= MAX_NODE_CONTENT
      ? raw
      : clipMiddle(raw, MAX_NODE_CONTENT);
    lines.push(`[${node.type}] id=${id}: ${content}`);

    // Find nearest neighbors (up to 4, within 500px)
    const nearby = canvas.nodes
      .filter(n => n.id !== id)
      .map(n => ({ n, d: distance(node, n) }))
      .filter(({ d }) => d < 500)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);

    if (nearby.length > 0) {
      lines.push("  nearby:");
      for (const { n } of nearby) {
        lines.push(`    ${n.type} id=${n.id} "${nodeSnippet(n)}"`);
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

// --- Batch accumulator ---

interface PendingBatch {
  filePath: string;
  relPath: string;
  fileType: "canvas" | "markdown" | "other";
  diffs: string[];
  timestamps: number[];
  changedNodes: NodeGeometry[];
  settleTimer: Timer | null;
  firstEventTime: number;
}

const pendingBatches = new Map<string, PendingBatch>();
const prevCanvasContent = new Map<string, string>();
let settleMs = SETTLE_MS;

/** Track files that we ourselves just edited, so we can suppress our own events */
const selfEditPaths = new Set<string>();
const SELF_EDIT_COOLDOWN_MS = 3000;

function fileType(filePath: string): "canvas" | "markdown" | "other" {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".canvas") return "canvas";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  return "other";
}

interface DiffResult {
  text: string;
  changedNodes?: NodeGeometry[];
}

function buildDiff(event: ChangeEvent, filePath: string): DiffResult {
  // For canvas files, compute semantic diff
  if (filePath.endsWith(".canvas") && event.type === "M") {
    const prevContent = prevCanvasContent.get(filePath);
    try {
      const currContent = readFileSync(filePath, "utf-8");
      if (prevContent) {
        const diff = canvasDiff(prevContent, currContent);
        if (diff) {
          prevCanvasContent.set(filePath, currContent);
          return { text: `${event.relPath}\n${diff.text}`, changedNodes: diff.changedNodes };
        }
      }
      prevCanvasContent.set(filePath, currContent);
    } catch {}
  } else if (filePath.endsWith(".canvas") && event.type === "A") {
    try {
      prevCanvasContent.set(filePath, readFileSync(filePath, "utf-8"));
    } catch {}
  }

  // Default: use the watcher's detail
  return { text: `${event.type} ${event.relPath}${event.location ? `:${event.location}` : ""} ${event.detail}`.trim() };
}

function onRawEvent(event: ChangeEvent) {
  const absPath = resolve(event.filePath);

  // Suppress events from our own edits
  if (selfEditPaths.has(absPath)) {
    log(`suppressing self-edit event: ${event.relPath}`);
    return;
  }

  const diff = buildDiff(event, absPath);
  const now = Date.now();

  let batch = pendingBatches.get(absPath);
  if (!batch) {
    batch = {
      filePath: absPath,
      relPath: event.relPath,
      fileType: fileType(absPath),
      diffs: [],
      timestamps: [],
      changedNodes: [],
      settleTimer: null,
      firstEventTime: now,
    };
    pendingBatches.set(absPath, batch);
  }

  batch.diffs.push(diff.text);
  if (diff.changedNodes) batch.changedNodes.push(...diff.changedNodes);
  batch.timestamps.push(now);

  // Reset settle timer
  if (batch.settleTimer) clearTimeout(batch.settleTimer);

  // Force-flush if batch is too old (user has been editing continuously)
  const batchAge = now - batch.firstEventTime;
  if (batchAge >= MAX_BATCH_AGE_MS) {
    log(`force-flushing batch for ${event.relPath} (age: ${batchAge}ms)`);
    processBatch(absPath);
    return;
  }

  // Otherwise, wait for settle
  batch.settleTimer = setTimeout(() => {
    processBatch(absPath);
  }, settleMs);
}

async function processBatch(absPath: string) {
  const batch = pendingBatches.get(absPath);
  if (!batch || batch.diffs.length === 0) return;
  pendingBatches.delete(absPath);

  if (batch.settleTimer) clearTimeout(batch.settleTimer);

  // Read current file content for context
  let currentContent: string | undefined;
  try {
    currentContent = readFileSync(absPath, "utf-8");
  } catch {}

  const eventBatch: EventBatch = {
    filePath: absPath,
    relPath: batch.relPath,
    fileType: batch.fileType,
    diffs: batch.diffs,
    timestamps: batch.timestamps,
    currentContent,
    changedNodes: batch.changedNodes.length > 0 ? batch.changedNodes : undefined,
  };

  log(`processing batch: ${batch.relPath} (${batch.diffs.length} events, mode=${triageMode})`);
  const anchor = batch.changedNodes?.[batch.changedNodes.length - 1];

  // For live mode canvas files, build a richer diff with full node content + neighbors
  if (triageMode === "live" && batch.fileType === "canvas" && batch.changedNodes.length > 0) {
    const richDiff = buildTriageDiff(
      batch.changedNodes.map(n => n.id),
      absPath
    );
    if (richDiff) {
      eventBatch.diffs = [`${batch.relPath}\n${richDiff}`];
    } else {
      log(`buildTriageDiff returned null for ${absPath} (nodes: ${batch.changedNodes.map(n => n.id).join(",")})`);
    }
  }

  try {
    const triageStart = Date.now();

    if (triageMode === "live") {
      // Update module-level state so the persistent handler knows where to write
      latestAnchor = anchor;
      latestFilePath = eventBatch.filePath;
      latestRelPath = eventBatch.relPath;
      latestFileType = eventBatch.fileType;

      // Fire-and-forget — tool calls handled by persistent handler
      triageLive(eventBatch, LIVE_MODEL);
    } else {
      const result = await triage(eventBatch, TRIAGE_MODEL);
      const triageMs = Date.now() - triageStart;
      await handleRequestResult(result, eventBatch, anchor, triageMs);
    }
  } catch (err) {
    log(`triage failed: ${err}`);
    await delegateToChannel(batch.diffs.join("\n"), batch.relPath, batch.fileType);
  }
}

// --- Handle triage decisions ---

/** Handle request mode result — single TriageResult from the HTTP API */
async function handleRequestResult(
  result: TriageResult,
  batch: EventBatch,
  anchor: NodeGeometry | undefined,
  triageMs: number
) {
  log(`request triage: ${result.action} (${triageMs}ms) — ${result.reason}`);

  switch (result.action) {
    case "ignore":
      break;

    case "acknowledge":
    case "respond":
      if (result.response_text) {
        await writeResponse(batch.filePath, batch.fileType, result.response_text, anchor);
      }
      break;

    case "delegate": {
      const ack = result.response_text || "Working on it...";
      await writeResponse(batch.filePath, batch.fileType, ack, anchor);
      const summary = result.delegation_summary || batch.diffs.join("\n");
      const enriched = [
        summary,
        `[Triage agent already wrote "${ack}" to the file.]`,
        `[Triage: request, ${triageMs}ms]`,
      ].join("\n");
      await delegateToChannel(enriched, batch.relPath, batch.fileType);
      break;
    }
  }
}

async function writeResponse(
  filePath: string,
  ft: "canvas" | "markdown" | "other",
  text: string,
  anchor?: NodeGeometry
) {
  // Mark as self-edit so we don't re-trigger on our own write
  selfEditPaths.add(filePath);
  setTimeout(() => selfEditPaths.delete(filePath), SELF_EDIT_COOLDOWN_MS);

  let ok = false;
  if (ft === "canvas") {
    ok = await canvasAddNode(filePath, text, { anchor, color: "4" }); // color 4 = blue-ish
  } else if (ft === "markdown") {
    ok = await markdownAppend(filePath, `> ${text}`);
  } else {
    log(`writeResponse: unsupported file type for ${filePath}`);
  }

  if (ok) {
    log(`wrote response to ${filePath}: "${text.slice(0, 60)}"`);
  }
}

async function delegateToChannel(
  summary: string,
  relPath: string,
  ft: string
) {
  const meta: Record<string, string> = {
    type: "delegate",
    path: relPath,
    source: "triage",
  };
  if (ft === "canvas") meta.format = "canvas";

  try {
    await mcp.notification({
      method: "notifications/claude/channel",
      params: { content: summary, meta },
    });
    log(`delegated to channel: ${relPath}`);
  } catch (err) {
    log(`delegation failed: ${err}`);
    changeBuffer.push({ summary, relPath, ft, ts: Date.now() });
  }
}

// --- MCP Server ---

const changeBuffer: Array<{ summary: string; relPath: string; ft: string; ts: number }> = [];

const mcp = new Server(
  { name: "smart-file-watcher", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: [
      "Smart File Watcher: a triage layer between file system events and you.",
      "A lightweight LLM (Gemini Flash Lite) monitors file changes in real time.",
      "It handles immediate responses (acknowledgments, status updates) autonomously.",
      "It only notifies you when real work is needed — the events you receive are pre-filtered and enriched.",
      'Events arrive as <channel source="smart-file-watcher" type="delegate" path="..." source="triage">.',
      "These are events the triage agent decided need your attention.",
      "The triage agent may have already acknowledged the user in the file.",
      "Use the watch/unwatch tools to control which files are monitored.",
    ].join(" "),
  }
);

const watcher = new FileWatcher({
  threshold: 200,
  debounce: RAW_DEBOUNCE_MS,
  onChange: onRawEvent,
});

// --- Tools ---

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "watch",
      description:
        "Start smart-watching a file. Changes are triaged by a lightweight LLM. Simple responses are handled automatically; complex tasks are delegated to you.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Path to the file to watch" },
        },
        required: ["path"],
      },
    },
    {
      name: "unwatch",
      description: "Stop watching a file.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Path to the file to stop watching" },
        },
        required: ["path"],
      },
    },
    {
      name: "list_watched",
      description: "List all files currently being watched.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "ping",
      description:
        'Test whether channel notifications are active. If you see a <channel source="smart-file-watcher" type="pong"> tag alongside this tool result, channels are active.',
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "get_changes",
      description:
        "Get buffered delegated events since the last call. Use this when channels are not active.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "set_settle_time",
      description:
        "Adjust how long to wait (in ms) after the last file event before the triage agent processes a batch. Lower = faster response, higher = better batching of multi-step edits. Default: 800ms.",
      inputSchema: {
        type: "object" as const,
        properties: {
          ms: {
            type: "number",
            description: "Settle time in milliseconds (100-5000)",
          },
        },
        required: ["ms"],
      },
    },
    {
      name: "set_mode",
      description:
        'Switch triage mode. "request" uses per-event HTTP calls (Gemini Flash Lite). "live" uses a persistent WebSocket session (Gemini Live) for lower latency — the session stays warm so subsequent triage calls skip connection overhead.',
      inputSchema: {
        type: "object" as const,
        properties: {
          mode: {
            type: "string",
            enum: ["request", "live"],
            description: 'Triage mode: "request" or "live"',
          },
        },
        required: ["mode"],
      },
    },
    {
      name: "send_to_triage",
      description:
        "Send a message to the triage agent's live session (only works in live mode). Use this to give the triage agent context, corrections, or instructions that persist in its session.",
      inputSchema: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description: "Message to send to the triage agent",
          },
        },
        required: ["message"],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  switch (name) {
    case "watch": {
      const { path: watchPath } = args as { path: string };
      log(`tool:watch ${watchPath}`);
      const result = watcher.watch(watchPath);
      if (result.ok && watchPath.endsWith(".canvas")) {
        try {
          const absPath = resolve(watchPath);
          prevCanvasContent.set(absPath, readFileSync(absPath, "utf-8"));
        } catch {}
      }
      return {
        content: [
          {
            type: "text" as const,
            text: result.ok
              ? `Smart-watching ${watchPath} (mode: ${triageMode}, model: ${triageMode === "live" ? LIVE_MODEL : TRIAGE_MODEL}, settle: ${settleMs}ms)`
              : `Error: ${result.error}`,
          },
        ],
      };
    }
    case "unwatch": {
      const { path } = args as { path: string };
      const result = watcher.unwatch(path);
      return {
        content: [
          {
            type: "text" as const,
            text: result.ok ? `Stopped watching ${path}` : `Error: ${result.error}`,
          },
        ],
      };
    }
    case "list_watched": {
      const files = watcher.getWatchedFiles();
      return {
        content: [
          {
            type: "text" as const,
            text: files.length > 0 ? files.join("\n") : "No files being watched.",
          },
        ],
      };
    }
    case "ping": {
      log("tool:ping");
      await mcp.notification({
        method: "notifications/claude/channel",
        params: { content: "pong", meta: { type: "pong" } },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: 'Ping sent. If you see a <channel source="smart-file-watcher" type="pong"> tag, channels are active.',
          },
        ],
      };
    }
    case "get_changes": {
      const events = changeBuffer.splice(0);
      if (events.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No delegated events since last poll." }],
        };
      }
      const lines = events.map(
        (e) => `[delegate] ${e.relPath}\n${e.summary}`
      );
      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    }
    case "set_settle_time": {
      const { ms } = args as { ms: number };
      const clamped = Math.max(100, Math.min(5000, ms));
      settleMs = clamped;
      // Note: this only affects new batches. We use the module-level SETTLE_MS
      // in the timer, so we need to update the constant used in onRawEvent.
      // Since SETTLE_MS is const, we use settleMs and reference it in the closure.
      log(`settle time updated to ${clamped}ms`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Settle time set to ${clamped}ms`,
          },
        ],
      };
    }
    case "set_mode": {
      const { mode } = args as { mode: "request" | "live" };
      const prev = triageMode;
      triageMode = mode;
      if (prev === "live" && mode === "request") {
        clearHandler();
        closeLiveSession();
      }
      // Eagerly connect and wire persistent handler when switching to live mode
      let connectStatus = "";
      if (mode === "live") {
        // Set up persistent handler for all tool calls
        let ackText: string | undefined;
        setHandler(async (action) => {
          const stats = getLastStats();
          const fp = latestFilePath;
          const ft = latestFileType;
          if (!fp || !ft) {
            log(`live handler: no file context, ignoring ${action.type}`);
            return;
          }
          if (action.type === "acknowledge") {
            ackText = action.text;
            log(`live: acknowledge "${action.text}" (latency=${stats.latency}ms)`);
            await writeResponse(fp, ft, action.text, latestAnchor);
          } else if (action.type === "delegate") {
            log(`live: delegate (latency=${stats.latency}ms)`);
            const relPath = latestRelPath ?? fp;
            const parts = [action.summary];
            if (ackText) parts.push(`[Triage agent wrote "${ackText}" to the file.]`);
            parts.push(`[Triage: live, latency=${stats.latency}ms, session age=${Math.round(stats.sessionAge / 1000)}s]`);
            await delegateToChannel(parts.join("\n"), relPath, ft);
            ackText = undefined; // Reset for next event
          }
        });

        const ok = await connectSession(LIVE_MODEL);
        connectStatus = ok ? " — session connected" : " — session failed to connect, will retry on first event";
      }
      log(`mode switched: ${prev} → ${mode}`);
      const modelName = mode === "live" ? LIVE_MODEL : TRIAGE_MODEL;
      return {
        content: [
          {
            type: "text" as const,
            text: `Triage mode: ${mode} (model: ${modelName})${connectStatus}`,
          },
        ],
      };
    }
    case "send_to_triage": {
      const { message } = args as { message: string };
      if (triageMode !== "live") {
        return {
          content: [
            {
              type: "text" as const,
              text: 'send_to_triage only works in live mode. Use set_mode to switch first.',
            },
          ],
        };
      }
      const sent = await sendToSession(message, LIVE_MODEL);
      return {
        content: [
          {
            type: "text" as const,
            text: sent ? `Sent to triage session: "${message}"` : "Failed — no active live session.",
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Cleanup
process.on("SIGINT", () => { watcher.close(); closeLiveSession(); process.exit(0); });
process.on("SIGTERM", () => { watcher.close(); closeLiveSession(); process.exit(0); });

await mcp.connect(new StdioServerTransport());
