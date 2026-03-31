#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { appendFileSync } from "fs";
import { resolve } from "path";
import { FileWatcher, type ChangeEvent } from "./watcher.js";
import type { CanvasNode, CanvasData } from "./canvas-types.js";

const HOME = process.env.HOME || "/tmp";
const LOG = `${HOME}/.prefix/logs/file-watcher.log`;
function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG, `[${ts}] ${msg}\n`);
}

log("=== channel server starting ===");

const changeBuffer: ChangeEvent[] = [];

const MAX_LABEL = 30;

function truncate(s: string, n: number): string {
  s = s.replace(/\n/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
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
  // Content fields depend on type
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

function canvasDiff(prevJson: string, currJson: string): string | null {
  let prev: CanvasData, curr: CanvasData;
  try {
    prev = JSON.parse(prevJson);
    curr = JSON.parse(currJson);
  } catch {
    return null; // not valid JSON, fall back to normal diff
  }
  if (!prev.nodes || !curr.nodes) return null;

  const prevMap = new Map(prev.nodes.map(n => [n.id, n]));
  const currMap = new Map(curr.nodes.map(n => [n.id, n]));

  const lines: string[] = [];

  // Added nodes
  for (const [id, n] of currMap) {
    if (!prevMap.has(id)) {
      lines.push(`A id=${id} ${n.type ?? ""} "${nodeLabel(n)}"`);
    }
  }

  // Deleted nodes
  for (const [id, n] of prevMap) {
    if (!currMap.has(id)) {
      lines.push(`D id=${id} ${n.type ?? ""} "${nodeLabel(n)}"`);
    }
  }

  // Modified nodes
  for (const [id, curr_n] of currMap) {
    const prev_n = prevMap.get(id);
    if (!prev_n) continue;
    const change = describeNodeChange(prev_n, curr_n);
    if (change) {
      if (change.hasContent) {
        lines.push(`M id=${id} ${change.fields.join(",")} "${nodeLabel(curr_n)}"`);
      } else {
        lines.push(`M id=${id} ${change.fields.join(",")}`);
      }
    }
  }

  // Edge changes (just count)
  const prevEdges = new Set((prev.edges ?? []).map(e => e.id));
  const currEdges = new Set((curr.edges ?? []).map(e => e.id));
  const addedEdges = [...currEdges].filter(id => !prevEdges.has(id)).length;
  const removedEdges = [...prevEdges].filter(id => !currEdges.has(id)).length;
  if (addedEdges) lines.push(`A ${addedEdges} edge(s)`);
  if (removedEdges) lines.push(`D ${removedEdges} edge(s)`);

  if (lines.length === 0) return null;
  return lines.map(l => "  " + l).join("\n");
}

// Track previous canvas content for semantic diffing
const prevCanvasContent = new Map<string, string>();

const mcp = new Server(
  { name: "file-watcher", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: [
      'File change events arrive as <channel source="file-watcher" type="A|M|D" path="..." location="line:char">.',
      "type A = file added, M = modified, D = deleted.",
      "location points to where the change is in the current file (after the edit), so you can Read at that offset.",
      "detail contains an inline diff if small, or a summary like +N -N chars if large.",
      "Use the watch and unwatch tools to control which files are monitored.",
      "Use list_watched to see what is currently being watched.",
      "Call ping first to test if channels are active. If you see a pong channel tag, changes will be pushed to you automatically.",
      "If channels are not active, use get_changes to poll for buffered events.",
    ].join(" "),
  }
);

const watcher = new FileWatcher({
  threshold: 200,
  debounce: 500,
  onChange: async (event) => {
    log(`change: ${event.type} ${event.filePath} ${event.detail}`);
    changeBuffer.push(event);

    const meta: Record<string, string> = {
      type: event.type,
      path: event.relPath,
    };
    if (event.location) meta.location = event.location;

    // Canvas-aware diffing: use semantic node diff for .canvas files
    let content = event.detail || `${event.type} ${event.relPath}`;
    if (event.filePath.endsWith(".canvas") && event.type === "M") {
      const prevContent = prevCanvasContent.get(event.filePath);
      try {
        const currContent = await Bun.file(event.filePath).text();
        if (prevContent) {
          const diff = canvasDiff(prevContent, currContent);
          if (diff) {
            content = `${event.relPath}\n${diff}`;
            meta.format = "canvas";
          }
        }
        prevCanvasContent.set(event.filePath, currContent);
      } catch {
        // file read failed, use default detail
      }
    } else if (event.filePath.endsWith(".canvas") && event.type === "A") {
      try {
        prevCanvasContent.set(event.filePath, await Bun.file(event.filePath).text());
      } catch {}
    }

    try {
      await mcp.notification({
        method: "notifications/claude/channel",
        params: { content, meta },
      });
      log(`notification sent: ${event.type} ${event.relPath} | ${content.slice(0, 120)}`);
    } catch (err) {
      log(`notification FAILED: ${err}`);
    }
  },
});

// --- Tools ---

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "watch",
      description: "Start watching a file or directory for changes. Accepts absolute or relative paths. Files that don't exist yet will be watched for creation. Directories are watched for file additions, modifications, and deletions.",
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
      description: "Test whether channel notifications are active. Sends a channel notification and returns a tool result. If you see a <channel source=\"file-watcher\" type=\"pong\"> tag alongside this tool result, channels are active and file change events will be pushed to you automatically. If you only see this tool result, channels are not active and you should poll for changes using get_changes instead.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "get_changes",
      description: "Get buffered file change events since the last call. Use this to poll for changes when channel notifications are not active.",
      inputSchema: {
        type: "object" as const,
        properties: {},
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
      log(`tool:watch result: ${JSON.stringify(result)}`);
      // Seed canvas content for semantic diffing
      if (result.ok && watchPath.endsWith(".canvas")) {
        try {
          const absPath = resolve(watchPath);
          prevCanvasContent.set(absPath, await Bun.file(absPath).text());
        } catch {}
      }
      return {
        content: [
          {
            type: "text" as const,
            text: result.ok ? `Watching ${watchPath}` : `Error: ${result.error}`,
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
        params: {
          content: "pong",
          meta: { type: "pong" },
        },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: "Ping sent. If you see a <channel source=\"file-watcher\" type=\"pong\"> tag, channels are active. If not, use get_changes to poll.",
          },
        ],
      };
    }
    case "get_changes": {
      const events = changeBuffer.splice(0);
      if (events.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No changes since last poll." }],
        };
      }
      const lines = events.map((e) => {
        const path = e.location ? `${e.relPath}:${e.location}` : e.relPath;
        return `${e.type}  ${path}  ${e.detail}`.trimEnd();
      });
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Cleanup on exit
process.on("SIGINT", () => {
  watcher.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  watcher.close();
  process.exit(0);
});

await mcp.connect(new StdioServerTransport());
