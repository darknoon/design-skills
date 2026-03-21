#!/usr/bin/env bun

import { resolve } from "path";
import { FileWatcher } from "./watcher.js";

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

// --- Watch setup ---

function emit(status: string, relPath: string, location: string, detail: string) {
  const path = location ? `${relPath}:${location}` : relPath;
  const parts = [status, path];
  if (detail) parts.push(detail);
  process.stdout.write(parts.join("  ") + "\n");
}

const watcher = new FileWatcher({
  threshold,
  onChange: (event) => emit(event.type, event.relPath, event.location, event.detail),
});

for (const filePath of filePaths) {
  const result = watcher.watch(filePath);
  if (!result.ok) {
    console.error(`Warning: ${result.error}`);
  }
}

process.on("SIGINT", () => { watcher.close(); process.exit(0); });
process.on("SIGTERM", () => { watcher.close(); process.exit(0); });
