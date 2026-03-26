---
name: t2i
description: Generate images from a text prompt using AI image models (Gemini or OpenAI). Use when asked to generate, create, or render an image — photos, illustrations, icons, textures, mockups, anything visual. Supports reference images for style matching and input images for editing. Not limited to icons.
argument-hint: "[prompt] [--model MODEL] [--output PATH]"
allowed-tools: Read, Write, Glob, Bash(uv run skills/t2i/scripts/t2i.py *), Bash(mkdir -p *)
---

# Text-to-Image Generation

Generate images from a text prompt using `t2i.py`.

## Script location

```
skills/t2i/scripts/t2i.py
```

The script reads API keys from `.env` (at the repo root) automatically via `python-dotenv`.

## Basic usage

```bash
uv run skills/t2i/scripts/t2i.py "<prompt>" --output <path>
```

Dependencies are managed by `uv` — no manual install needed. Just run the command.

## Models

| Model | Flag | Notes |
|---|---|---|
| `gpt-image-1-mini` | (default) | Fast, transparent background, good for icons |
| `gpt-image-1` | `--model gpt-image-1` | Higher quality OpenAI |
| `gpt-image-1.5` | `--model gpt-image-1.5` | Latest OpenAI |
| `gemini-2.5-flash-image` | `--model gemini-2.5-flash-image` | Good all-around, great for Android-style |
| `gemini-3.1-flash-image-preview` | `--model gemini-3.1-flash-image-preview` | Needs more explicit style description |

## Options

- `--output PATH` — where to save (default: `icon.png`)
- `--model MODEL` — which model to use
- `--size WxH` — OpenAI: e.g. `1024x1024`. Gemini: `512px`, `1K`, `2K`, `4K`
- `--aspect-ratio R` — Gemini only: `1:1` (default), `9:16`, `16:9`, `4:3`, `3:4`
- `--reference PATH [PATH ...]` — style reference images (PNG, JPG, WebP, SVG). SVGs are auto-rasterized via Playwright.
- `--input-image PATH` — image to edit instead of generating from scratch
- `--orchestrator MODEL` — OpenAI orchestrator model (default: `gpt-4o`)

## Reference images

Pass `--reference` to ground the model on a visual style. Works with PNG, JPG, and WebP. SVGs need to be rasterized to PNG first (e.g. with the svg2img skill). Combine with `--input-image` to edit an existing image while matching a reference style.

```bash
# Style-guided generation
uv run skills/t2i/scripts/t2i.py "a cozy cabin" \
  --reference style-refs/watercolor-01.png style-refs/watercolor-02.png \
  --output cabin.png

# Edit an existing image to match a reference style
uv run skills/t2i/scripts/t2i.py "simplify, match this style" \
  --input-image draft.png \
  --reference target-style.png \
  --output refined.png
```

## Generating for comparison

When the user wants to see results from multiple models, run both and show side by side:

```bash
uv run skills/t2i/scripts/t2i.py "<prompt>" \
  --model gpt-image-1-mini --output out/A-openai.png

uv run skills/t2i/scripts/t2i.py "<prompt>" \
  --model gemini-2.5-flash-image --output out/B-gemini.png
```

Then show both images to the user.

## API keys

Set as environment variables or in `.env`:
- `OPENAI_API_KEY` — for `gpt-image-*` models
- `GOOGLE_API_KEY` — for `gemini-*` models

The script prints the exact export command needed if a key is missing.

## Cost reference

| Model | Cost/image |
|---|---|
| `gpt-image-1-mini` (low quality) | $0.005 |
| `gpt-image-1-mini` (medium) | $0.011 |
| `gpt-image-1` (low quality) | $0.011 |
| `gpt-image-1` (medium) | $0.042 |
| `gemini-2.5-flash-image` | ~$0.039 |

OpenAI uses `quality: low` by default to keep iteration costs down.
