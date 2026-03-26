import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { appendFileSync } from "fs";
import type { EventBatch } from "./triage";

const LOG = "/tmp/smart-file-watcher.log";
function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG, `[${ts}] [triage-live] ${msg}\n`);
}

// --- Types ---

export interface AcknowledgeAction {
  type: "acknowledge";
  text: string;
}

export interface DelegateAction {
  type: "delegate";
  summary: string;
}

export type TriageAction = AcknowledgeAction | DelegateAction;

/** Callback fired for each tool call as it arrives */
export type OnAction = (action: TriageAction) => void;

// --- System prompt ---

const SYSTEM_PROMPT = `You triage file-change events from a real-time file watcher (usually Obsidian).

When you receive diffs, decide what to do using the available tools:

- **acknowledge_user**: Write a short message to the file so the user sees you noticed. Use for greetings ("hello"), confirmations ("thanks"), or as a quick ack before delegating ("On it...").
- **delegate_task**: Hand off work to the main AI agent. Use when the user wants something DONE — generation, editing, creative work, analysis, style changes, etc. Include a clear summary of what the user wants.

You can call BOTH tools on one event — e.g. acknowledge first ("Generating..."), then delegate the actual work. Or call neither to silently ignore noise.

WHEN TO IGNORE (call no tools):
- Position-only moves, resize, reformatting
- Auto-saves with no meaningful content change
- Changes from programmatic edits (multiple nodes added/removed at once)

WHEN TO DELEGATE (always):
- Any request for work, creation, generation, editing
- Style/color feedback on previous output
- New connections between nodes

CANVAS: Italic text (*...*) = user instruction. Color changes = feedback. Position-only = noise.
MARKDOWN: Italic, blockquotes, HTML comments = instructions. Normal prose = user working, ignore.

When in doubt, delegate rather than ignore.`;

// --- Tool declarations ---

import type { FunctionDeclaration } from "@google/genai";
import TOOLS_RAW from "./tools.json";
const TOOLS = TOOLS_RAW as unknown as FunctionDeclaration[];

// --- Live session ---

const SESSION_MAX_MS = 9 * 60 * 1000;

let ai: GoogleGenAI | null = null;
let session: Session | null = null;
let sessionStartTime = 0;
let sessionModel = "";
let resumptionHandle: string | undefined;
let connecting = false;

/** Callback for the current active triage request. Null when idle. */
let onAction: OnAction | null = null;

function getClient(): GoogleGenAI {
  if (ai) return ai;
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY");
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

/**
 * Send text via sendRealtimeInput. Native-audio models reject sendClientContent
 * with text, but accept text through the realtime input path.
 */
function sendText(sess: Session, text: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK types don't expose text on sendRealtimeInput yet
  (sess as any).sendRealtimeInput({ text });
}

function sendToolResponse(fcId: string, fcName: string, response: Record<string, unknown> = { result: "ok" }) {
  if (!session) return;
  try {
    session.sendToolResponse({
      functionResponses: [{
        id: fcId,
        name: fcName,
        response,
      }],
    });
  } catch (err) {
    log(`tool response error: ${err}`);
  }
}


function onMessage(message: LiveServerMessage) {
  // Tool calls — process each one immediately
  if (message.toolCall?.functionCalls) {
    for (const fc of message.toolCall.functionCalls) {
      const args = fc.args as Record<string, string>;
      const id = fc.id ?? "";
      const name = fc.name ?? "";

      // Always respond to keep session unblocked
      sendToolResponse(id, name);

      if (!onAction) {
        log(`stray tool call: ${name}(${JSON.stringify(args)})`);
        continue;
      }

      log(`tool call: ${name}(${JSON.stringify(args)})`);
      if (name === "acknowledge_user") {
        onAction({ type: "acknowledge", text: args.text || "" });
      } else if (name === "delegate_task") {
        onAction({ type: "delegate", summary: args.summary || "" });
      }
    }
  }

  // Log if model sends audio or text instead of tool calls
  const parts = message.serverContent?.modelTurn?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.text) log(`model text: ${part.text.slice(0, 100)}`);
      if ((part as any).inlineData) log(`model audio chunk`);
    }
  }
  if (message.serverContent?.turnComplete) {
    log(`turn complete`);
  }

  // Session resumption
  if (message.sessionResumptionUpdate?.newHandle) {
    resumptionHandle = message.sessionResumptionUpdate.newHandle;
  }

  // GoAway
  if (message.goAway) {
    log(`goAway received, timeLeft: ${message.goAway.timeLeft}`);
  }
}

// --- Connection management ---

export async function connectSession(model: string): Promise<boolean> {
  if (connecting) return false;
  const now = Date.now();

  if (session && sessionModel === model && (now - sessionStartTime < SESSION_MAX_MS)) {
    return true;
  }

  if (session) {
    try { session.close(); } catch {}
    session = null;
  }

  connecting = true;
  const client = getClient();
  log(`connecting live session: ${model}`);

  try {
    session = await client.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools: [{ functionDeclarations: TOOLS }],
        contextWindowCompression: {
          triggerTokens: "25000",
          slidingWindow: { targetTokens: "12000" },
        },
        sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
      },
      callbacks: {
        onopen: () => log("live session opened"),
        onmessage: onMessage,
        onerror: (e: ErrorEvent) => {
          log(`live session error: ${e.message}`);
          onAction = null;
        },
        onclose: (e: CloseEvent) => {
          log(`live session closed: code=${e.code} reason=${e.reason}`);
          session = null;
          connecting = false;
          onAction = null;
        },
      },
    });
    sessionStartTime = now;
    sessionModel = model;
    connecting = false;
    log(`live session connected`);
    return true;
  } catch (err) {
    connecting = false;
    log(`connect error: ${err}`);
    return false;
  }
}

async function ensureSession(model: string): Promise<Session> {
  if (!session || sessionModel !== model || (Date.now() - sessionStartTime > SESSION_MAX_MS)) {
    await connectSession(model);
  }
  if (!session) throw new Error("Failed to establish live session");
  return session;
}

// --- Public API ---

export interface LiveTriageStats {
  ttft: number;
  sessionAge: number;
}

let lastTtft = 0;
export function getLastStats(): LiveTriageStats {
  return { ttft: lastTtft, sessionAge: Date.now() - sessionStartTime };
}

/**
 * Send a file-change batch to the live triage session.
 * Calls `handler` for each tool call as it arrives — acknowledge first, then delegate.
 * Returns a promise that resolves after a timeout (for ignore cases where no tools are called).
 */
export async function triageLive(
  batch: EventBatch,
  handler: OnAction,
  model = "gemini-3.1-flash-live-preview",
  timeoutMs = 6000
): Promise<void> {
  const batchAge = Date.now() - batch.timestamps[0];
  const eventSpan = batch.timestamps[batch.timestamps.length - 1] - batch.timestamps[0];

  // For canvas files, the semantic diff is enough — don't send the full JSON,
  // it overwhelms the realtime model. For markdown, a short snippet is useful.
  let contextSnippet = "";
  if (batch.fileType === "markdown" && batch.currentContent) {
    contextSnippet = `\n--- FILE EXCERPT ---\n${batch.currentContent.slice(0, 1000)}`;
  }

  const userMessage = [
    `File: ${batch.relPath} (${batch.fileType})`,
    `Events: ${batch.diffs.length}, span: ${eventSpan}ms, age: ${batchAge}ms`,
    "",
    "--- DIFFS ---",
    ...batch.diffs,
    contextSnippet,
  ].filter(Boolean).join("\n");

  log(`triage input:\n${userMessage}`);

  const start = Date.now();
  lastTtft = 0;

  // Set callback — tool calls fire handler directly as they arrive
  onAction = (action) => {
    if (lastTtft === 0) lastTtft = Date.now() - start;
    handler(action);
  };

  try {
    const sess = await ensureSession(model);
    sendText(sess, userMessage);
  } catch (err) {
    log(`triage send error: ${err}`);
    onAction = null;
    handler({ type: "delegate", summary: `Triage error: ${err}\n${batch.diffs.join("\n")}` });
    return;
  }

  // Clear onAction after timeout so stale responses don't fire.
  // Don't block — return immediately so the next batch can be processed.
  setTimeout(() => {
    if (onAction) {
      log(`triage: no tool calls after ${timeoutMs}ms`);
      onAction = null;
    }
  }, timeoutMs);
}

/**
 * Send context to the live session (from the big model, etc.).
 */
export async function sendToSession(
  message: string,
  model = "gemini-3.1-flash-live-preview"
): Promise<boolean> {
  try {
    const sess = await ensureSession(model);
    sendText(sess, message);
    log(`sent to session: "${message.slice(0, 80)}"`);
    return true;
  } catch (err) {
    log(`sendToSession error: ${err}`);
    return false;
  }
}

export function closeLiveSession() {
  if (session) {
    try { session.close(); } catch {}
    session = null;
  }
}
