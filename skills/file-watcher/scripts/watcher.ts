import { watch, existsSync, readFileSync, statSync, appendFileSync } from "fs";
import { resolve, relative, dirname, basename } from "path";

const LOG = "/tmp/file-watcher.log";
function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG, `[${ts}] [watcher] ${msg}\n`);
}

// --- Types ---

export interface FileState {
  exists: boolean;
  content: Buffer | null;
  size: number;
  isBinary: boolean;
}

export interface ChangeDetail {
  location: string;
  detail: string;
}

export interface ChangeEvent {
  type: "A" | "M" | "D";
  filePath: string;
  relPath: string;
  location: string;
  detail: string;
}

export type ChangeHandler = (event: ChangeEvent) => void;

// --- Utilities ---

function isBinary(buf: Buffer): boolean {
  const check = buf.subarray(0, 8192);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function snapshot(filePath: string): FileState {
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

// --- Diff logic ---

function loc(line: number, char: number): string {
  return `${line}:${char}`;
}

export function computeDetail(
  prev: FileState,
  curr: FileState,
  threshold: number,
  eventType: "A" | "M"
): ChangeDetail {
  if (curr.isBinary || prev.isBinary) {
    if (eventType === "A") return { location: "", detail: formatSize(curr.size) };
    return { location: "", detail: `binary ${formatSize(prev.size)} -> ${formatSize(curr.size)}` };
  }

  const currText = curr.content!.toString("utf-8");

  if (eventType === "A") {
    if (currText.length <= threshold) return { location: "1:1", detail: currText.replace(/\n/g, "\\n") };
    return { location: "", detail: formatSize(curr.size) };
  }

  const prevText = prev.content!.toString("utf-8");
  const prevLines = prevText.split("\n");
  const currLines = currText.split("\n");

  const changes: string[] = [];
  const maxLen = Math.max(prevLines.length, currLines.length);
  let addedChars = 0;
  let removedChars = 0;
  let firstChangedLine = -1;
  let lastChangedLine = -1;
  let firstChangedChar = -1;

  for (let i = 0; i < maxLen; i++) {
    const pl = prevLines[i];
    const cl = currLines[i];
    if (pl === cl) continue;

    const afterLine = i + 1;
    if (firstChangedLine === -1) {
      firstChangedLine = afterLine;
      if (pl !== undefined && cl !== undefined) {
        let c = 0;
        while (c < pl.length && c < cl.length && pl[c] === cl[c]) c++;
        firstChangedChar = c + 1;
      } else {
        firstChangedChar = 1;
      }
    }
    if (i < currLines.length) lastChangedLine = afterLine;

    if (pl !== undefined) removedChars += pl.length;
    if (cl !== undefined) addedChars += cl.length;
    if (pl !== undefined && cl !== undefined) {
      changes.push(`\`${pl.trim()}\` -> \`${cl.trim()}\``);
    } else if (cl !== undefined) {
      changes.push(`+ \`${cl.trim()}\``);
    } else {
      changes.push(`- \`${pl.trim()}\``);
    }
  }

  if (changes.length === 0) return { location: "", detail: "" };

  let location = "";
  if (firstChangedLine !== -1) {
    if (firstChangedLine === lastChangedLine) {
      location = loc(firstChangedLine, firstChangedChar);
    } else if (lastChangedLine !== -1) {
      location = `${loc(firstChangedLine, firstChangedChar)}-${lastChangedLine}`;
    }
  }

  const inlineDiff = changes.join(" | ");
  if (inlineDiff.length <= threshold) return { location, detail: inlineDiff };

  return { location, detail: `+${addedChars} -${removedChars} chars` };
}

// --- Watcher ---

export class FileWatcher {
  private state = new Map<string, FileState>();
  private timers = new Map<string, Timer>();
  private watchers = new Map<string, ReturnType<typeof watch>>();
  private cwd: string;
  private threshold: number;
  private onChange: ChangeHandler;

  private debounceMs: number;

  constructor(opts: { cwd?: string; threshold?: number; debounce?: number; onChange: ChangeHandler }) {
    this.cwd = opts.cwd ?? process.cwd();
    this.threshold = opts.threshold ?? 200;
    this.debounceMs = opts.debounce ?? 300;
    this.onChange = opts.onChange;
  }

  relPath(abs: string): string {
    return relative(this.cwd, abs);
  }

  watch(filePath: string): { ok: boolean; error?: string } {
    const abs = resolve(filePath);
    if (this.watchers.has(abs)) {
      return { ok: false, error: `Already watching ${abs}` };
    }

    const dir = dirname(abs);
    const target = basename(abs);
    if (!existsSync(dir)) {
      return { ok: false, error: `Parent directory does not exist: ${dir}` };
    }

    this.state.set(abs, snapshot(abs));

    // Always watch the parent directory, not the file itself.
    // fs.watch on a file breaks when the file is replaced via
    // atomic write (write-to-temp + mv), which is what jq, Obsidian,
    // and most editors do. The watcher binds to the inode, and the
    // new file gets a new inode. Watching the directory catches renames.
    const dirWatcher = watch(dir, (_event, filename) => {
      if (filename === target) {
        this.debouncedChange(abs);
      }
    });
    this.watchers.set(abs, dirWatcher);

    return { ok: true };
  }

  unwatch(filePath: string): { ok: boolean; error?: string } {
    const abs = resolve(filePath);
    const watcher = this.watchers.get(abs);
    if (!watcher) {
      return { ok: false, error: `Not watching ${abs}` };
    }
    watcher.close();
    this.watchers.delete(abs);
    this.state.delete(abs);
    const timer = this.timers.get(abs);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(abs);
    }
    return { ok: true };
  }

  getWatchedFiles(): string[] {
    return [...this.watchers.keys()];
  }

  close() {
    for (const [, watcher] of this.watchers) watcher.close();
    for (const [, timer] of this.timers) clearTimeout(timer);
    this.watchers.clear();
    this.state.clear();
    this.timers.clear();
  }

  private debouncedChange(filePath: string) {
    log(`fsevent: ${filePath}`);
    const existing = this.timers.get(filePath);
    if (existing) clearTimeout(existing);
    this.timers.set(
      filePath,
      setTimeout(() => {
        this.timers.delete(filePath);
        this.handleChange(filePath);
      }, this.debounceMs)
    );
  }

  private handleChange(filePath: string) {
    const prev = this.state.get(filePath);
    if (!prev) {
      log(`handleChange: no prev state for ${filePath}`);
      return;
    }
    const curr = snapshot(filePath);

    const rel = this.relPath(filePath);

    if (!prev.exists && curr.exists) {
      log(`handleChange: ADDED ${filePath}`);
      const { location, detail } = computeDetail(prev, curr, this.threshold, "A");
      this.onChange({ type: "A", filePath, relPath: rel, location, detail });
    } else if (prev.exists && !curr.exists) {
      log(`handleChange: DELETED ${filePath}`);
      this.onChange({ type: "D", filePath, relPath: rel, location: "", detail: "" });
    } else if (prev.exists && curr.exists) {
      if (prev.content && curr.content && Buffer.compare(prev.content, curr.content) === 0) {
        log(`handleChange: no content change ${filePath}`);
        return;
      }
      log(`handleChange: MODIFIED ${filePath}`);
      const { location, detail } = computeDetail(prev, curr, this.threshold, "M");
      if (detail) this.onChange({ type: "M", filePath, relPath: rel, location, detail });
    }

    this.state.set(filePath, curr);
  }
}
