---
name: file-watcher
description: Watch files for changes and react to modifications in real time. Use this skill whenever you need to monitor files, track file creation/deletion, observe build outputs, or keep tabs on files that external processes are writing to. Also use when the user asks to "watch", "monitor", "tail changes", or "track" files. Supports two modes — a standalone CLI script and an MCP channel server.
---

# File Watcher

Watches files for changes using OS-native events (fsevents on macOS, inotify on Linux) and reports structured diffs. Two entrypoints:

- **Channel server** (`channel.ts`) — an MCP server that exposes `watch`, `unwatch`, and `list_watched` tools so files can be added/removed dynamically at runtime. When launched with channel support, it pushes change events directly into the session. Without channel support, agents can poll via `get_changes`.
- **CLI script** (`watch.ts`) — emits one status line per change to stdout. Useful for agents that don't support channels, or for piping into other tools.

Both share the same core logic (`watcher.ts`): snapshot diffing, binary detection, debouncing, and location tracking.

## Channel Server (MCP)

Register in `.mcp.json`:

```json
{
  "mcpServers": {
    "file-watcher": {
      "command": "bun",
      "args": ["run", "-i", "./skills/file-watcher/scripts/channel.ts"]
    }
  }
}
```

Launch Claude Code with:

```bash
claude --dangerously-load-development-channels server:file-watcher
```

### Tools

| Tool | Description |
|------|-------------|
| `watch` | Start watching a file (absolute or relative path). Files that don't exist yet are watched for creation. |
| `unwatch` | Stop watching a file. |
| `list_watched` | List all currently watched files. |
| `ping` | Test if channel notifications are active. Sends a pong via the channel. If you see a `<channel type="pong">` tag alongside the tool result, changes will be pushed automatically. If not, use `get_changes` to poll. |
| `get_changes` | Returns and clears buffered change events. Use this to poll when channels are not active (e.g., in agents like OpenCode that don't support channels). |

### Channel Events

Changes arrive as `<channel source="file-watcher">` tags with these attributes:

| Attribute | Description |
|-----------|-------------|
| `type` | `A` (added), `M` (modified), `D` (deleted) |
| `path` | Relative path to the changed file |
| `format` | `canvas` if the file is a `.canvas` file with semantic diffing |
| `location` | `line:char` position of the change (non-canvas files only) |

For **`.canvas` files**, the body contains a semantic node diff:

```
Video Gen.canvas
  A id=abc123 text "lets add 3 images belo…"
  M id=def456 pos,color=4 "placeholder-dog"
  D id=xyz789 text "old status note"
  A 2 edge(s)
```

Each line: operation (`A`/`M`/`D`), node ID, what changed (for `M`: `text`, `pos`, `size`, `color=N`, `type=T`, `file`), and a truncated label.

For other files, the body contains an inline diff if small, or a summary like `+N -N chars` for larger changes.

## CLI Script

```bash
bun run skills/file-watcher/scripts/watch.ts [--threshold N] <file1> [file2] ...
```

Emits one line per event to stdout:

```
<status>  <path>:<location>  <detail>
```

```
M src/app.tsx:42:8  `color: red` -> `color: blue`
M src/data.json:10:1-85  +2034 -89 chars
A src/new-file.ts:1:1  248B
D src/old-util.ts
```

`--threshold <n>` controls the max characters for inline diffs (default: 200).
