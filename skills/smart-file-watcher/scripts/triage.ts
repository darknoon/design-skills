import { GoogleGenAI } from "@google/genai";
import { appendFileSync } from "fs";

const LOG = "/tmp/smart-file-watcher.log";
function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG, `[${ts}] [triage] ${msg}\n`);
}

// --- Types ---

export type TriageAction = "ignore" | "acknowledge" | "respond" | "delegate";

export interface TriageResult {
  action: TriageAction;
  reason: string;
  /** For acknowledge/respond: text to write into the file */
  response_text?: string;
  /** For delegate: enriched summary for the big model */
  delegation_summary?: string;
}

/** Position and size info for a canvas node, captured at diff time */
export interface NodeGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EventBatch {
  filePath: string;
  relPath: string;
  fileType: "canvas" | "markdown" | "other";
  /** Semantic diff (canvas) or text diff (markdown/other) */
  diffs: string[];
  /** Timestamps of individual events in this batch */
  timestamps: number[];
  /** Full current file content (for context) */
  currentContent?: string;
  /** Node IDs that were added or modified in canvas diffs (most recent last) */
  changedNodes?: NodeGeometry[];
}

// --- Triage prompt ---

const SYSTEM_PROMPT = `You triage file-change events from a real-time file watcher (usually Obsidian). Decide ONE action per batch.

ACTIONS (pick exactly one):
- IGNORE: noise. Position-only moves, reformatting, auto-saves, no meaningful content change.
- ACKNOWLEDGE: the user wrote a simple greeting, confirmation, or short message directed at you. Your response_text should be a brief, natural reply (1 sentence max). You are NOT doing any work — just confirming you saw it.
- DELEGATE: the user wants something DONE — generation, editing, creative work, analysis, style changes, feedback on previous work, or ANY request that requires action beyond a simple reply. This is the most common action for user instructions. Your response_text is a short acknowledgment shown while the big model works (e.g. "On it..." or "Generating..."). Your delegation_summary describes what the user wants done.

KEY RULE: If the user is asking for ANY work to be done, that is ALWAYS delegate, never acknowledge. Acknowledge is ONLY for messages that need no action — like "hello", "thanks", "ok". If you're unsure, delegate.

CANVAS files:
- Italic text (*...*) = instruction directed at you
- Color changes = feedback (green=good, red=bad, yellow=needs work) → delegate
- Position-only moves = ALWAYS ignore
- New edges = relationships → delegate

MARKDOWN files:
- Italic text, blockquotes (>), or HTML comments directed at you = instructions
- Normal prose editing = the user working, ignore

Be conservative. When in doubt between acknowledge and delegate, DELEGATE. When in doubt between ignore and anything else, IGNORE.

Respond with JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    action: {
      type: "string" as const,
      enum: ["ignore", "acknowledge", "respond", "delegate"],
    },
    reason: {
      type: "string" as const,
      description: "Brief explanation of why this action was chosen",
    },
    response_text: {
      type: "string" as const,
      description: "Text to write into the file (for acknowledge/respond actions only)",
    },
    delegation_summary: {
      type: "string" as const,
      description: "Enriched summary for the big model (for delegate action only)",
    },
  },
  required: ["action", "reason"] as const,
};

// --- Client ---

let ai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (ai) return ai;
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable"
    );
  }
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

export async function triage(
  batch: EventBatch,
  model = "gemini-3.1-flash-lite-preview"
): Promise<TriageResult> {
  const client = getClient();

  const batchAge = Date.now() - batch.timestamps[0];
  const eventSpan =
    batch.timestamps[batch.timestamps.length - 1] - batch.timestamps[0];

  const userMessage = [
    `File: ${batch.relPath} (${batch.fileType})`,
    `Events in batch: ${batch.diffs.length}`,
    `Time span: ${eventSpan}ms (batch age: ${batchAge}ms)`,
    "",
    "--- DIFFS ---",
    ...batch.diffs,
    "",
    batch.currentContent
      ? `--- CURRENT FILE CONTENT ---\n${batch.currentContent.slice(0, 4000)}`
      : "(file content unavailable)",
  ].join("\n");

  const inputChars = SYSTEM_PROMPT.length + userMessage.length;
  log(`triage request: ${batch.relPath} (${batch.diffs.length} events, ~${inputChars} input chars)`);
  const start = Date.now();
  let ttft = 0;

  try {
    const stream = await client.models.generateContentStream({
      model,
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 256,
      },
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      if (ttft === 0) ttft = Date.now() - start;
      if (chunk.text) chunks.push(chunk.text);
    }
    const e2e = Date.now() - start;
    const fullText = chunks.join("");
    const genTime = e2e - ttft;

    log(`triage timing: ttft=${ttft}ms gen=${genTime}ms e2e=${e2e}ms`);
    log(`triage response: ${fullText}`);

    const result: TriageResult = JSON.parse(fullText);
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    log(`triage error (${elapsed}ms, ttft=${ttft}ms): ${err}`);
    // On error, default to delegating so the big model can handle it
    return {
      action: "delegate",
      reason: `Triage error: ${err}`,
      delegation_summary: batch.diffs.join("\n"),
    };
  }
}
