---
name: file-watcher
description: Watch files for changes and emit structured status lines to stdout. Use this skill whenever you need to monitor files for modifications, track file creation/deletion, observe build outputs, or keep tabs on files that external processes are writing to. Also use when the user asks to "watch", "monitor", "tail changes", or "track" files, or when you need a long-running background process that reports filesystem events as they happen.
---

# File Watcher

A lightweight Bun script that watches a list of files and emits one compact status line per change event to stdout. Designed to run in a background sub-agent or terminal so a parent process can react to filesystem changes without polling.

## Usage

```bash
bun run skills/file-watcher/scripts/watch.ts [options] <file1> [file2] [file3] ...
```

Paths can be relative or absolute. Files that don't exist yet will be watched for creation.

### Options

- `--threshold <n>` — Max characters for inline diff output (default: 200). Diffs larger than this get summarized instead.

### Examples

```bash
# Watch two files with default threshold
bun run scripts/watch.ts src/app.tsx src/data.json

# Watch with a larger inline diff threshold
bun run scripts/watch.ts --threshold 500 dist/bundle.js

# Watch a file that doesn't exist yet
bun run scripts/watch.ts output/report.csv
```

## Output Format

One line per event:

```
<status> <path>:<location> <detail>
```

| Status | Meaning  | Detail                                                       |
|--------|----------|--------------------------------------------------------------|
| A      | Added    | File contents if small, otherwise file size                  |
| M      | Modified | Inline diff if small, otherwise `+N -N chars`               |
| D      | Deleted  | (no detail)                                                  |

### Location

The location after the path is a `line:char` position (both 1-indexed) describing **where the change is in the file AFTER the change was applied** — i.e., the file as it currently exists on disk. This means you can use the location directly with a `Read(file, offset=line)` call to jump straight to the changed region without reading the whole file.

- Single-line change: `path:42:5` — line 42, starting at character 5
- Multi-line change: `path:10:1-85` — lines 10 through 85, first change at char 1
- Binary or large added files: no location (just the path)
- Deleted files: no location (file no longer exists)

### Detail rules

- **Text, small change** (within threshold): the actual changed text inline, with before in backticks and after in backticks separated by `->`
- **Text, large change** (over threshold): `+<added> -<removed> chars`
- **Binary file**: `binary <old_size> -> <new_size>`
- **Added file**: contents if under threshold, otherwise just the size
- **Deleted file**: no detail

### Examples

```
M src/app.tsx:42:8  `color: red` -> `color: blue`
M src/data.json:10:1-85  +2034 -89 chars
M assets/logo.png  binary 12.4KB -> 13.1KB
A src/new-file.ts:1:1  248B
D src/old-util.ts
```

## How It Works

- Uses Bun's built-in `fs.watch` for OS-native file watching (fsevents on macOS, inotify on Linux).
- Keeps the last-known content of each watched file in memory to compute diffs on change.
- Stdout is line-buffered so consumers see events immediately.
- Runs indefinitely until killed (Ctrl+C / SIGTERM).
- For files that don't exist yet, watches the parent directory and filters for the target filename.
