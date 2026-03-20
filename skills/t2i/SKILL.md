---
name: t2i
description: Generate images from a text prompt using AI image models (Gemini or OpenAI). Use when asked to generate, create, or render an image. Supports reference images and input images for editing. Good for quick image generation without the full icon pipeline.
argument-hint: "[prompt] [--model MODEL] [--output PATH]"
allowed-tools: Read, Write, Glob, Bash(uv run /Users/andrew/Developer/Prefix/design-skills/skills/create-svg-icon/scripts/t2i.py *), Bash(mkdir -p *)
---

# Text-to-Image Generation

Generate images from a text prompt using the `t2i.py` script.

## Script location

```
/Users/andrew/Developer/Prefix/design-skills/skills/create-svg-icon/scripts/t2i.py
```

The script reads API keys from `/Users/andrew/Developer/Prefix/design-skills/.env` automatically via `python-dotenv`.

## Basic usage

```bash
uv run /Users/andrew/Developer/Prefix/design-skills/skills/create-svg-icon/scripts/t2i.py "<prompt>" --output <path>
```

## Models

| Model | Flag | Notes |
|---|---|---|
| `gpt-image-1-mini` | (default) | Fast, transparent background, good for icons |
| `gpt-image-1` | `--model gpt-image-1` | Higher quality OpenAI |
| `gemini-2.5-flash-image` | `--model gemini-2.5-flash-image` | Good all-around, great for Android-style |
| `gemini-3.1-flash-image-preview` | `--model gemini-3.1-flash-image-preview` | Needs more explicit style description |

## Options

- `--output PATH` — where to save (default: `icon.png`)
- `--model MODEL` — which model to use
- `--size WxH` — OpenAI: e.g. `1024x1024`. Gemini: `512px`, `1K`, `2K`, `4K`
- `--aspect-ratio R` — Gemini only: `1:1` (default), `9:16`, `16:9`, `4:3`, `3:4`
- `--reference PATH [PATH ...]` — style reference images (PNG, JPG, WebP, SVG)
- `--input-image PATH` — image to edit instead of generating from scratch

## Generating for comparison

When the user wants to see results from multiple models, run both in parallel and show the results side by side:

```bash
uv run /Users/andrew/Developer/Prefix/design-skills/skills/create-svg-icon/scripts/t2i.py "<prompt>" \
  --model gpt-image-1-mini --output out/A-openai.png

uv run /Users/andrew/Developer/Prefix/design-skills/skills/create-svg-icon/scripts/t2i.py "<prompt>" \
  --model gemini-2.5-flash-image --output out/B-gemini.png
```

Then show both images to the user using markdown image syntax:

```markdown
![description](path/to/image.png)
```

**If running inside the Dave app** (cwd is the Dave project), save outputs under `data/` and reference them via the file server:

```markdown
![OpenAI result](/api/fs/t2i-test/A-openai.png)
![Gemini result](/api/fs/t2i-test/B-gemini.png)
```

Dave's `/api/fs/` endpoint serves files from the `data/` directory. Absolute paths and paths containing `/data/` are also auto-resolved by the chat UI.

## API keys

Keys are loaded from `/Users/andrew/Developer/Prefix/design-skills/.env`:
- `OPENAI_API_KEY` — for `gpt-image-*` models
- `GOOGLE_API_KEY` — for `gemini-*` models

## Cost reference

| Model | Cost/image |
|---|---|
| `gpt-image-1-mini` (low quality) | $0.005 |
| `gpt-image-1` (low quality) | $0.011 |
| `gemini-2.5-flash-image` | ~$0.039 |
