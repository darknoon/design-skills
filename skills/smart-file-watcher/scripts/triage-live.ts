import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { appendFileSync } from "fs";
import type { EventBatch } from "./triage";

const HOME = process.env.HOME || "/tmp";
const LOG = `${HOME}/.prefix/logs/smart-file-watcher.log`;
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

/** Persistent handler for tool calls — set once when live mode starts */
export type OnAction = (action: TriageAction) => void | Promise<void>;

// --- System prompt ---

const SYSTEM_PROMPT = `You triage file-change events from a real-time file watcher (usually Obsidian).

IMPORTANT: You MUST call at least one tool for every message you receive, unless it is ONLY position/size changes. Default to responding. Silence is the worst outcome.

Tools:
- **acknowledge_user**: Write a short message so the user sees you noticed. Use liberally — greetings, confirmations, acks before delegating.
- **delegate_task**: Hand off work to the main AI agent. Use when the user wants something DONE.

You can call BOTH tools — e.g. acknowledge ("On it...") then delegate the work.

ONLY IGNORE (no tools) when the diff is EXCLUSIVELY:
- Position-only moves (lines like "M id=xxx pos")
- Size-only changes
- No content fields changed at all

ALWAYS RESPOND (acknowledge and/or delegate) when you see:
- ANY text content change, addition, or deletion
- ANY new node (A id=...)
- ANY deleted node with content (D id=... text/file/link)
- Italic text (*...*) — this is a user instruction, ALWAYS delegate
- Color changes — delegate as feedback
- New edges — delegate
- New file nodes — acknowledge ("I see you added X")
- ANY content you're unsure about — acknowledge at minimum

CANVAS: Italic (*...*) = user instruction → delegate. Color change = feedback → delegate. New nodes = acknowledge. Position-only = ignore.
MARKDOWN: Italic, blockquotes, HTML comments = instructions → delegate. Normal prose additions = acknowledge.

When in doubt, ALWAYS call acknowledge_user at minimum. Never stay silent when content changed.`;

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

/** Persistent handler — set via setHandler(), fires for every tool call */
let handler: OnAction | null = null;

/** Timestamp of the last sendText call, used for latency tracking */
let lastSendTime = 0;

/** Last measured latency (ms from sendText to first tool call response) */
let lastLatency = 0;

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
  // SDK types don't expose text on sendRealtimeInput yet
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

      if (!handler) {
        log(`stray tool call (no handler): ${name}(${JSON.stringify(args)})`);
        continue;
      }

      // Track latency from last sendText to first tool call
      const latency = lastSendTime > 0 ? Date.now() - lastSendTime : 0;
      lastLatency = latency;
      log(`tool call: ${name}(${JSON.stringify(args)}) [${latency}ms]`);

      if (name === "acknowledge_user") {
        handler({ type: "acknowledge", text: args.text || "" });
      } else if (name === "delegate_task") {
        handler({ type: "delegate", summary: args.summary || "" });
      }
    }
  }

  // Log if model sends audio or text instead of tool calls
  const parts = message.serverContent?.modelTurn?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.text) log(`model text: ${part.text.slice(0, 100)}`);
      if (part.inlineData) log(`model audio chunk`);
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
        },
        onclose: (e: CloseEvent) => {
          log(`live session closed: code=${e.code} reason=${e.reason}`);
          session = null;
          connecting = false;
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

/**
 * Set the persistent handler for tool calls. Called once when live mode starts.
 * The handler fires for every tool call the model makes, regardless of which
 * sendText triggered it.
 */
export function setHandler(h: OnAction) {
  handler = h;
  log("handler set");
}

export function clearHandler() {
  handler = null;
  log("handler cleared");
}

export interface LiveTriageStats {
  latency: number;
  sessionAge: number;
}

export function getLastStats(): LiveTriageStats {
  return { latency: lastLatency, sessionAge: Date.now() - sessionStartTime };
}

/**
 * Send a file-change batch to the live triage session.
 * Fire-and-forget: builds the message and sends it. Tool call responses
 * are handled by the persistent handler set via setHandler().
 */
export function triageLive(
  batch: EventBatch,
  model = "gemini-3.1-flash-live-preview",
): void {
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

  // Fire-and-forget: ensure session then send
  ensureSession(model)
    .then((sess) => {
      try {
        sendText(sess, userMessage);
        lastSendTime = Date.now();
        log(`sendText ok (${userMessage.length} chars)`);
      } catch (err) {
        log(`triage send error: ${err}`);
      }
    })
    .catch((err) => {
      log(`triage session error: ${err}`);
    });
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
