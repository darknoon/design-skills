---
name: smart-file-watcher
description: Watch files with an LLM triage layer. Supports two modes — a per-request HTTP mode (Gemini Flash Lite) and a persistent WebSocket mode (Gemini Live) for lower latency. The triage agent handles immediate responses (acknowledgments) autonomously in-file and delegates complex work to the main model. Supports canvas and markdown files.
---

# Smart File Watcher

An evolution of [file-watcher](../file-watcher/) that inserts a lightweight LLM between file system events and the main model. Two triage modes:

- **Request mode** — per-event HTTP calls to Gemini Flash Lite (`gemini-3.1-flash-lite-preview`)
- **Live mode** — persistent WebSocket session to Gemini Live (`gemini-3.1-flash-live-preview`) for lower latency. The session stays warm so subsequent triage calls skip connection overhead.

The triage agent has two tools it can call:

- **`acknowledge_user(text)`** — writes a short message directly into the file so the user sees instant feedback
- **`delegate_task(summary)`** — hands off work to the main model via MCP channel notification

It can call both (ack then delegate), just one, or neither (silent ignore for noise).

## Architecture

```
┌─────────┐   150ms    ┌──────────┐  800ms   ┌─────────────────┐
│ fsevents │──debounce──│  batch   │──settle──│  Gemini triage  │
│          │            │  buffer  │          │ (request / live) │
└─────────┘            └──────────┘          └────────┬─────────┘
                                                      │
                                            ┌─────────┴─────────┐
                                            │                   │
                                    acknowledge_user      delegate_task
                                            │                   │
                                     ┌──────┴──────┐    ┌──────┴──────┐
                                     │  edit file  │    │ MCP channel │
                                     │ (Bun.write) │    │ → big model │
                                     └─────────────┘    └─────────────┘
```

### Event flow

1. `FileWatcher` detects changes with a low 150ms debounce
2. Events accumulate in a per-file batch buffer
3. After 800ms of silence (configurable via `set_settle_time`), the batch is sent to the triage model
4. If events keep coming for >5s, the batch is force-flushed
5. The triage model calls `acknowledge_user` and/or `delegate_task` as needed
6. Acknowledgments are written directly to the file (canvas: new text node near the edited node; markdown: appended blockquote)
7. Delegations are pushed through the MCP channel to the main model, including timing info and what was already acknowledged

### Self-edit suppression

When the triage agent writes to a file, it marks the path for a 3s cooldown to suppress the resulting file-system event and prevent feedback loops.

### Live mode session management

- WebSocket sessions last ~10 minutes. The server reconnects automatically using session resumption handles.
- The main model can send context back to the triage agent via the `send_to_triage` tool (e.g. "I finished generating the images").
- The triage session maintains conversational state, so context accumulates across events.

## Setup

### Requirements

- Bun runtime
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` environment variable

### Install

```bash
cd skills/smart-file-watcher && bun install
```

### Register in `.mcp.json`

```json
{
  "mcpServers": {
    "smart-file-watcher": {
      "command": "bun",
      "args": ["run", "-i", "./skills/smart-file-watcher/scripts/channel.ts"],
      "env": {
        "GOOGLE_API_KEY": "your-key-here"
      }
    }
  }
}
```

### Launch

```bash
claude --dangerously-load-development-channels server:smart-file-watcher
```

## Tools

| Tool | Description |
|------|-------------|
| `watch` | Start smart-watching a file. Changes are triaged by the LLM. |
| `unwatch` | Stop watching a file. |
| `list_watched` | List all currently watched files. |
| `ping` | Test if channel notifications are active. |
| `get_changes` | Poll for buffered delegated events (fallback when channels aren't active). |
| `set_settle_time` | Adjust the settle window (100-5000ms). Lower = faster response, higher = better batching. Default: 800ms. |
| `set_mode` | Switch between `request` (per-event HTTP) and `live` (persistent WebSocket). Eagerly connects the session when switching to live. |
| `send_to_triage` | Send a message to the triage agent's live session (context, corrections, instructions). Only works in live mode. |

## File type support

### Canvas (`.canvas`)

- Semantic node diffing (added/modified/deleted nodes and edges)
- Detects italic text as user instructions
- Responds by adding text nodes via `Bun.write` (in-place, single write, no temp files)
- Acknowledgment nodes are placed directly below the edited node using geometry captured at diff time
- Color changes interpreted as feedback

### Markdown (`.md`)

- Line-level text diffing
- Detects blockquotes, italics, and HTML comments as instructions
- Responds by appending blockquoted text

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `GOOGLE_API_KEY` | — | Google AI API key (required) |
| `GEMINI_API_KEY` | — | Alternative key name |
| `TRIAGE_MODEL` | `gemini-3.1-flash-lite-preview` | Model for request mode |
| `LIVE_MODEL` | `gemini-3.1-flash-live-preview` | Model for live mode |
| `TRIAGE_MODE` | `request` | Starting mode (`request` or `live`) |

All settings can be adjusted at runtime via the MCP tools.

## Logs

All modules log to `/tmp/smart-file-watcher.log` with tags:

| Tag | Source |
|-----|--------|
| `[channel]` | MCP server, event batching, tool handlers |
| `[triage]` | Request mode Gemini API calls |
| `[triage-live]` | Live mode WebSocket session, tool calls, timing |
| `[editor]` | File writes (canvas node adds, markdown appends) |
