#!/usr/bin/env bun

import { watch, existsSync, readFileSync, statSync } from "fs";
import { resolve, relative, dirname, basename } from "path";

// --- Arg parsing ---

const args = process.argv.slice(2);
let threshold = 200;
const filePaths: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--threshold" && args[i + 1]) {
    threshold = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith("--")) {
    filePaths.push(resolve(args[i]));
  }
}

if (filePaths.length === 0) {
  console.error("Usage: bun run watch.ts [--threshold N] <file1> [file2] ...");
  process.exit(1);
}

const cwd = process.cwd();

// --- State ---

interface FileState {
  exists: boolean;
  content: Buffer | null;
  size: number;
  isBinary: boolean;
}

const state = new Map<string, FileState>();

function isBinary(buf: Buffer): boolean {
  // Check first 8KB for null bytes — simple heuristic
  const check = buf.subarray(0, 8192);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function relPath(abs: string): string {
  return relative(cwd, abs);
}

function snapshot(filePath: string): FileState {
  if (!existsSync(filePath)) {
    return { exists: false, content: null, size: 0, isBinary: false };
  }
  const st = statSync(filePath);
  const content = readFileSync(filePath);
  return {
    exists: true,
    content,
    size: st.size,
    isBinary: isBinary(content),
  };
}

function emit(status: string, filePath: string, location: string = "", detail: string = "") {
  const path = location ? `${relPath(filePath)}:${location}` : relPath(filePath);
  const parts = [status, path];
  if (detail) parts.push(detail);
  // Write directly to stdout with newline, flush immediately
  process.stdout.write(parts.join("  ") + "\n");
}

// --- Diff logic ---

// Format a line:char location. Lines and chars are 1-indexed.
function loc(line: number, char: number): string {
  return `${line}:${char}`;
}

function computeDetail(
  prev: FileState,
  curr: FileState,
  filePath: string,
  eventType: "A" | "M"
): { location: string; detail: string } {
  // Binary
  if (curr.isBinary || prev.isBinary) {
    if (eventType === "A") return { location: "", detail: formatSize(curr.size) };
    return { location: "", detail: `binary ${formatSize(prev.size)} -> ${formatSize(curr.size)}` };
  }

  const currText = curr.content!.toString("utf-8");

  // Added file
  if (eventType === "A") {
    if (currText.length <= threshold) return { location: "1:1", detail: currText.replace(/\n/g, "\\n") };
    return { location: "", detail: formatSize(curr.size) };
  }

  // Modified — compute simple line diff
  const prevText = prev.content!.toString("utf-8");
  const prevLines = prevText.split("\n");
  const currLines = currText.split("\n");

  // Find changed lines, tracking positions in the *current* (after) file
  const changes: string[] = [];
  const maxLen = Math.max(prevLines.length, currLines.length);
  let addedChars = 0;
  let removedChars = 0;
  let firstChangedLine = -1;
  let lastChangedLine = -1;
  let firstChangedChar = -1; // char offset within the first changed line

  for (let i = 0; i < maxLen; i++) {
    const pl = prevLines[i];
    const cl = currLines[i];
    if (pl === cl) continue;

    // Track line range in the after file (1-indexed)
    const afterLine = i + 1;
    if (firstChangedLine === -1) {
      firstChangedLine = afterLine;
      // Find the first differing character in this line
      if (pl !== undefined && cl !== undefined) {
        let c = 0;
        while (c < pl.length && c < cl.length && pl[c] === cl[c]) c++;
        firstChangedChar = c + 1; // 1-indexed
      } else {
        firstChangedChar = 1;
      }
    }
    if (i < currLines.length) lastChangedLine = afterLine;

    if (pl !== undefined) removedChars += pl.length;
    if (cl !== undefined) addedChars += cl.length;
    // Build a compact representation of this line change
    if (pl !== undefined && cl !== undefined) {
      changes.push(`\`${pl.trim()}\` -> \`${cl.trim()}\``);
    } else if (cl !== undefined) {
      changes.push(`+ \`${cl.trim()}\``);
    } else {
      changes.push(`- \`${pl.trim()}\``);
    }
  }

  if (changes.length === 0) return { location: "", detail: "" };

  // Build location string — refers to the AFTER (current) file state
  let location = "";
  if (firstChangedLine !== -1) {
    if (firstChangedLine === lastChangedLine) {
      location = loc(firstChangedLine, firstChangedChar);
    } else if (lastChangedLine !== -1) {
      location = `${loc(firstChangedLine, firstChangedChar)}-${lastChangedLine}`;
    }
  }

  // Join changes and check against threshold
  const inlineDiff = changes.join(" | ");
  if (inlineDiff.length <= threshold) return { location, detail: inlineDiff };

  return { location, detail: `+${addedChars} -${removedChars} chars` };
}

// --- Handle a change event ---

function handleChange(filePath: string) {
  const prev = state.get(filePath)!;
  const curr = snapshot(filePath);

  if (!prev.exists && curr.exists) {
    // Added
    const { location, detail } = computeDetail(prev, curr, filePath, "A");
    emit("A", filePath, location, detail);
  } else if (prev.exists && !curr.exists) {
    // Deleted
    emit("D", filePath);
  } else if (prev.exists && curr.exists) {
    // Modified — but only if content actually changed
    if (prev.content && curr.content && Buffer.compare(prev.content, curr.content) === 0) {
      return; // no actual change
    }
    const { location, detail } = computeDetail(prev, curr, filePath, "M");
    if (detail) emit("M", filePath, location, detail);
  }

  state.set(filePath, curr);
}

// --- Debounce per file ---

const timers = new Map<string, Timer>();

function debouncedChange(filePath: string) {
  const existing = timers.get(filePath);
  if (existing) clearTimeout(existing);
  timers.set(
    filePath,
    setTimeout(() => {
      timers.delete(filePath);
      handleChange(filePath);
    }, 50)
  );
}

// --- Watch setup ---

for (const filePath of filePaths) {
  // Take initial snapshot
  state.set(filePath, snapshot(filePath));

  if (existsSync(filePath)) {
    // Watch the file directly
    watch(filePath, () => debouncedChange(filePath));
  } else {
    // File doesn't exist yet — watch parent dir for its creation
    const dir = dirname(filePath);
    const target = basename(filePath);
    if (!existsSync(dir)) {
      console.error(`Warning: parent directory does not exist: ${dir}`);
      continue;
    }
    const dirWatcher = watch(dir, (event, filename) => {
      if (filename === target) {
        debouncedChange(filePath);
        // Once created, switch to watching the file directly
        if (existsSync(filePath)) {
          dirWatcher.close();
          watch(filePath, () => debouncedChange(filePath));
        }
      }
    });
  }
}

// Keep alive
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
