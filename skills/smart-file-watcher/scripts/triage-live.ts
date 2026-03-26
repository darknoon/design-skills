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

/** Result of a live triage — zero or more actions in order */
export interface LiveTriageResult {
  actions: TriageAction[];
}

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

const TOOLS = [
  {
    name: "acknowledge_user",
    description: "Write a brief message to the file so the user knows you saw their input. Keep it short — 1 sentence max.",
    parameters: {
      type: "object" as const,
      properties: {
        text: {
          type: "string" as const,
          description: "Short message to show the user (e.g. 'Got it!', 'On it — generating...', 'Noted.')",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "delegate_task",
    description: "Hand off a task to the main AI agent for complex work. Describe what the user wants clearly.",
    parameters: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string" as const,
          description: "What the user wants done, written for the main agent to act on",
        },
      },
      required: ["summary"],
    },
  },
];

// --- Live session manager ---

const SESSION_MAX_MS = 9 * 60 * 1000;
const RESPONSE_TIMEOUT_MS = 10_000;

let ai: GoogleGenAI | null = null;
let session: Session | null = null;
let sessionStartTime = 0;
let sessionModel = "";
let resumptionHandle: string | undefined;
let connecting = false;

// Per-request state
let pendingResolve: ((result: LiveTriageResult) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let responseTimer: Timer | null = null;
let ttftTimestamp = 0;
let requestStartTime = 0;
let pendingActions: TriageAction[] = [];
// Text fallback
let responseChunks: string[] = [];

function getClient(): GoogleGenAI {
  if (ai) return ai;
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable");
  }
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

function finishRequest() {
  if (responseTimer) clearTimeout(responseTimer);
  responseTimer = null;

  const elapsed = Date.now() - requestStartTime;
  const ttft = ttftTimestamp > 0 ? ttftTimestamp - requestStartTime : elapsed;
  log(`live timing: ttft=${ttft}ms e2e=${elapsed}ms actions=${pendingActions.length}`);

  if (!pendingResolve) return;
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingReject = null;

  const result: LiveTriageResult = { actions: [...pendingActions] };
  pendingActions = [];
  responseChunks = [];
  resolve(result);
}

function sendToolResponse(fcId: string) {
  if (session && fcId) {
    try {
      (session as any).sendToolResponse({
        functionResponses: [{
          id: fcId,
          response: { status: "ok" },
        }],
      });
    } catch (err) {
      log(`tool response error: ${err}`);
    }
  }
}

function onMessage(message: LiveServerMessage) {
  // Handle tool calls
  const toolCall = (message as any).toolCall;
  if (toolCall?.functionCalls) {
    if (ttftTimestamp === 0) ttftTimestamp = Date.now();

    for (const fc of toolCall.functionCalls) {
      const args = fc.args as Record<string, string>;
      log(`tool call: ${fc.name}(${JSON.stringify(args)})`);

      if (fc.name === "acknowledge_user") {
        pendingActions.push({ type: "acknowledge", text: args.text || "" });
        sendToolResponse(fc.id);
      } else if (fc.name === "delegate_task") {
        pendingActions.push({ type: "delegate", summary: args.summary || "" });
        sendToolResponse(fc.id);
      } else {
        log(`unknown tool call: ${fc.name}`);
        sendToolResponse(fc.id);
      }
    }
  }

  // Text fallback
  const parts = message.serverContent?.modelTurn?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.text) {
        if (ttftTimestamp === 0) ttftTimestamp = Date.now();
        responseChunks.push(part.text);
      }
    }
  }

  // Turn complete — resolve
  if (message.serverContent?.turnComplete) {
    // If model responded with text instead of tools, treat as ignore with a log
    if (responseChunks.length > 0 && pendingActions.length === 0) {
      const text = responseChunks.join("");
      log(`model responded with text (no tool calls): ${text.slice(0, 200)}`);
      // Try to parse as JSON fallback
      try {
        const parsed = JSON.parse(text);
        if (parsed.action === "delegate") {
          pendingActions.push({ type: "delegate", summary: parsed.delegation_summary || text });
        }
        if (parsed.response_text) {
          pendingActions.unshift({ type: "acknowledge", text: parsed.response_text });
        }
      } catch {
        // Not JSON, just ignore
      }
    }
    finishRequest();
  }

  // Session resumption
  const resumption = (message as any).sessionResumptionUpdate;
  if (resumption?.handle) {
    resumptionHandle = resumption.handle;
    log(`resumption handle updated`);
  }

  // GoAway
  const goAway = (message as any).goAway;
  if (goAway) {
    log(`goAway received, timeLeft: ${goAway.timeLeft}`);
  }
}

/**
 * Connect (or reconnect) the live session eagerly.
 */
export async function connectSession(model: string): Promise<boolean> {
  if (connecting) {
    log("connectSession: already connecting, skipping");
    return false;
  }

  const now = Date.now();

  if (session && sessionModel === model && (now - sessionStartTime < SESSION_MAX_MS)) {
    log("connectSession: session already active");
    return true;
  }

  if (session) {
    log("connectSession: closing stale session");
    try { session.close(); } catch {}
    session = null;
  }

  connecting = true;
  const client = getClient();
  log(`connecting live session: ${model}`);

  try {
    const connectConfig: any = {
      model,
      config: {
        responseModalities: [Modality.TEXT],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        tools: [{ functionDeclarations: TOOLS }],
        sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
      },
      callbacks: {
        onopen: () => log("live session opened"),
        onmessage: onMessage,
        onerror: (e: ErrorEvent) => {
          log(`live session error: ${e.message}`);
          if (pendingReject) {
            const reject = pendingReject;
            pendingResolve = null;
            pendingReject = null;
            reject(new Error(`Live session error: ${e.message}`));
          }
        },
        onclose: (e: CloseEvent) => {
          log(`live session closed: code=${e.code} reason=${e.reason}`);
          session = null;
          connecting = false;
          if (pendingReject) {
            const reject = pendingReject;
            pendingResolve = null;
            pendingReject = null;
            reject(new Error(`Live session closed: ${e.reason}`));
          }
        },
      },
    };

    if (resumptionHandle) {
      log(`resuming with handle: ${resumptionHandle.slice(0, 20)}...`);
    }

    session = await client.live.connect(connectConfig);
    sessionStartTime = now;
    sessionModel = model;
    connecting = false;
    log(`live session connected`);
    return true;
  } catch (err) {
    connecting = false;
    log(`live session connect error: ${err}`);
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
  e2e: number;
  sessionAge: number;
}

let lastStats: LiveTriageStats = { ttft: 0, e2e: 0, sessionAge: 0 };
export function getLastStats(): LiveTriageStats { return lastStats; }

export function isSessionActive(): boolean {
  return session !== null;
}

export async function triageLive(
  batch: EventBatch,
  model = "gemini-3.1-flash-live-preview"
): Promise<LiveTriageResult> {
  const batchAge = Date.now() - batch.timestamps[0];
  const eventSpan = batch.timestamps[batch.timestamps.length - 1] - batch.timestamps[0];

  const userMessage = [
    `File: ${batch.relPath} (${batch.fileType})`,
    `Events: ${batch.diffs.length}, span: ${eventSpan}ms, age: ${batchAge}ms`,
    "",
    "--- DIFFS ---",
    ...batch.diffs,
    "",
    batch.currentContent
      ? `--- CURRENT FILE CONTENT ---\n${batch.currentContent.slice(0, 4000)}`
      : "(file content unavailable)",
  ].join("\n");

  requestStartTime = Date.now();
  ttftTimestamp = 0;
  pendingActions = [];
  responseChunks = [];

  try {
    const sess = await ensureSession(model);

    const result = await new Promise<LiveTriageResult>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;

      responseTimer = setTimeout(() => {
        if (pendingResolve) {
          log(`live response timeout after ${RESPONSE_TIMEOUT_MS}ms`);
          finishRequest();
        }
      }, RESPONSE_TIMEOUT_MS);

      sess.sendClientContent({ turns: userMessage });
    });

    const elapsed = Date.now() - requestStartTime;
    const ttft = ttftTimestamp > 0 ? ttftTimestamp - requestStartTime : elapsed;
    lastStats = { ttft, e2e: elapsed, sessionAge: Date.now() - sessionStartTime };

    return result;
  } catch (err) {
    log(`live triage error: ${err}`);
    session = null;
    return {
      actions: [{
        type: "delegate",
        summary: `Live triage error: ${err}\n${batch.diffs.join("\n")}`,
      }],
    };
  }
}

/**
 * Send a message to the live session (context from the big model, etc.).
 */
export async function sendToSession(
  message: string,
  model = "gemini-3.1-flash-live-preview"
): Promise<boolean> {
  try {
    const sess = await ensureSession(model);
    sess.sendClientContent({ turns: message });
    log(`sent to session: "${message.slice(0, 80)}"`);
    return true;
  } catch (err) {
    log(`sendToSession error: ${err}`);
    return false;
  }
}

/** Close the live session */
export function closeLiveSession() {
  if (session) {
    try { session.close(); } catch {}
    session = null;
  }
}
