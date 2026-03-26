import { appendFileSync } from "fs";
import type { CanvasData } from "./canvas-types";
import type { NodeGeometry } from "./triage";

const LOG = "/tmp/smart-file-watcher.log";
function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG, `[${ts}] [editor] ${msg}\n`);
}

// --- Canvas editing (pure Bun, no jq) ---

/**
 * Read, parse, modify, and write back a canvas file in one in-place write.
 * No temp files, no mv, no extra inode changes — single writeFileSync
 * so Obsidian sees exactly one change event.
 */
async function editCanvas(
  filePath: string,
  mutate: (canvas: CanvasData) => void
): Promise<boolean> {
  try {
    const raw = await Bun.file(filePath).text();
    const canvas: CanvasData = JSON.parse(raw);
    mutate(canvas);
    await Bun.write(filePath, JSON.stringify(canvas, null, 2) + "\n");
    return true;
  } catch (err) {
    log(`canvas edit error: ${err}`);
    return false;
  }
}

/**
 * Add a text node to a canvas file.
 * Placed directly below the anchor node (the node the user just edited),
 * or below the lowest existing node as fallback. Anchor geometry is captured
 * at diff time so this adds no extra file reads for positioning.
 */
export async function canvasAddNode(
  filePath: string,
  text: string,
  opts?: { anchor?: NodeGeometry; color?: string }
): Promise<boolean> {
  const nodeId = crypto.randomUUID().slice(0, 16).replace(/-/g, "");

  let x = 0;
  let y = 400;
  if (opts?.anchor) {
    x = opts.anchor.x;
    y = opts.anchor.y + opts.anchor.height + 20;
  }
  // If no anchor, we'll compute position inside editCanvas from existing nodes

  const ok = await editCanvas(filePath, (canvas) => {
    if (!canvas.nodes) canvas.nodes = [];

    // Fallback positioning if no anchor was provided
    if (!opts?.anchor && canvas.nodes.length > 0) {
      let maxY = -Infinity;
      for (const n of canvas.nodes) {
        const bottom = n.y + n.height;
        if (bottom > maxY) {
          maxY = bottom;
          x = n.x;
        }
      }
      y = maxY + 40;
    }

    const node: Record<string, unknown> = {
      id: nodeId,
      type: "text",
      text,
      x,
      y,
      width: 260,
      height: 60,
    };
    if (opts?.color) node.color = opts.color;
    canvas.nodes.push(node as any);
  });

  if (ok) log(`canvas: added node ${nodeId} "${text.slice(0, 40)}"`);
  return ok;
}

/**
 * Update the text of an existing canvas node by ID.
 */
export async function canvasUpdateNode(
  filePath: string,
  nodeId: string,
  newText: string
): Promise<boolean> {
  const ok = await editCanvas(filePath, (canvas) => {
    const node = canvas.nodes?.find((n) => n.id === nodeId);
    if (node && node.type === "text") {
      node.text = newText;
    }
  });

  if (ok) log(`canvas: updated node ${nodeId}`);
  return ok;
}

// --- Markdown editing ---

/**
 * Append a response to a markdown file.
 */
export async function markdownAppend(
  filePath: string,
  text: string
): Promise<boolean> {
  try {
    const content = await Bun.file(filePath).text();
    const trimmed = content.replace(/\n+$/, "");
    await Bun.write(filePath, `${trimmed}\n\n${text}\n`);
    log(`markdown: appended "${text.slice(0, 60)}"`);
    return true;
  } catch (err) {
    log(`markdown append error: ${err}`);
    return false;
  }
}

/**
 * Insert a response below a specific line pattern in a markdown file.
 */
export async function markdownInsertAfter(
  filePath: string,
  afterPattern: string,
  text: string
): Promise<boolean> {
  try {
    const content = await Bun.file(filePath).text();
    const lines = content.split("\n");
    let insertIdx = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(afterPattern)) {
        insertIdx = i + 1;
        break;
      }
    }

    if (insertIdx === -1) {
      return markdownAppend(filePath, text);
    }

    lines.splice(insertIdx, 0, "", text);
    await Bun.write(filePath, lines.join("\n"));
    log(`markdown: inserted after "${afterPattern.slice(0, 40)}"`);
    return true;
  } catch (err) {
    log(`markdown insert error: ${err}`);
    return false;
  }
}
