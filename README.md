# design-skills

Claude Code skills for design and development workflows.

## Skills

| Skill | Description |
|-------|-------------|
| **[create-svg-icon](skills/create-svg-icon/)** | Generate SVG icons via a t2i + vectorization pipeline. Supports style-matching against popular icon sets (Lucide, Phosphor, Codicons, SF Symbols, etc.). |
| **[extract-svg](skills/extract-svg/)** | Extract all SVGs from any web page — inline, img tags, CSS backgrounds, shadow DOM, sprites, and more. |
| **[file-watcher](skills/file-watcher/)** | Watch files for changes and emit structured status lines to stdout. Reports diffs, line locations, and file events (add/modify/delete). |
| **[krea](skills/krea/)** | Generate images and videos via the Krea API (Flux, Seedream, Imagen, Topaz, and more). |
| **[quiver-svg](skills/quiver-svg/)** | Generate SVG alternatives from image references and refine SVGs directly with QuiverAI Arrow 2 Telos. Saves requests, responses, usage, and server request IDs. |
| **[smart-file-watcher](skills/smart-file-watcher/)** | Watch files or directories with LLM triage. Two modes: per-request (Flash Lite) and live WebSocket (Gemini Live). Acknowledges users in-file and delegates complex work to the main model. |
| **[svg2img](skills/svg2img/)** | Render SVG files to PNG using Playwright. Batch support, configurable size. |
| **[t2i](skills/t2i/)** | Text-to-image generation using Gemini or OpenAI models. Supports reference images, input editing, and multiple models. |

## Related

Audio processing skills (transcription, diarization, etc.) live in [darknoon/audio-skills](https://github.com/darknoon/audio-skills).

## Setup

Some skills require API keys for image generation and vectorization. See each skill's SKILL.md for details. I recommend putting them in a password manager like 1Password, then using its CLI to inject.

`quiver-svg` needs Python 3.10+ (standard library only) and `QUIVERAI_API_KEY` in the environment. If you already use `QUIVER_API_KEY` for vectorization, export the same key as `QUIVERAI_API_KEY` for this helper.

Skills that use Bun (e.g. `file-watcher`) need a one-time `bun install` in their directory for TypeScript types.
