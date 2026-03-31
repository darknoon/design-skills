---
name: t2i
description: Generate images from a text prompt using AI image models (GPT Image, Gemini Image, FLUX). Use when asked to generate, create, or render an image — photos, illustrations, icons, textures, mockups, anything visual. Models include gpt-image-1, gpt-image-1-mini, gpt-image-1.5, gemini-2.5-flash-image, gemini-3.1-flash-image-preview, flux-2-flex, flux-2-pro, flux-2-pro-edit, flux-1.1-pro, flux-1.1-ultra. Supports reference images for style and character consistency, and input images for editing.
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
| `flux-2-flex` | `--model flux-2-flex` | FLUX.2 Flex via fal.ai — fast, high quality |
| `flux-2-pro` | `--model flux-2-pro` | FLUX.2 Pro via fal.ai — best quality |
| `flux-2-pro-edit` | `--model flux-2-pro-edit` | FLUX.2 Pro image editing via fal.ai |
| `flux-1.1-pro` | `--model flux-1.1-pro` | FLUX 1.1 Pro via fal.ai |
| `flux-1.1-ultra` | `--model flux-1.1-ultra` | FLUX 1.1 Ultra via fal.ai |

## Options

- `--output PATH` — where to save (default: `icon.png`)
- `--model MODEL` — which model to use
- `--size WxH` — OpenAI: e.g. `1024x1024`. Gemini: `512px`, `1K`, `2K`, `4K`. Fal: arbitrary WxH (e.g. `1024x768`)
- `--aspect-ratio R` — Gemini only: `1:1` (default), `9:16`, `16:9`, `4:3`, `3:4`
- `--reference PATH [PATH ...]` — style reference images (PNG, JPG, WebP). OpenAI and Gemini only.
- `--input-image PATH` — image to edit instead of generating from scratch
- `--orchestrator MODEL` — OpenAI orchestrator model (default: `gpt-4o`)
- `--partial N` — Stream N partial images during generation (0-3, OpenAI only). Each partial overwrites the output file and prints `Progress 1/N <path>` to stdout. Read the image at that path to show the user incremental progress.

## Sizes by provider

**OpenAI** — pass `--size WxH`:
- `1024x1024` (default), `512x512`, `1024x1536`, `1536x1024`

**Gemini** — pass `--aspect-ratio` (recommended) OR `--size`, not both:
- `--aspect-ratio 1:1` (default), `9:16`, `16:9`, `4:3`, `3:4`
- `--size 512px`, `1K`, `2K`, `4K` (these are Gemini-specific keywords, not pixel dimensions)

**fal.ai (FLUX)** — pass `--size WxH` with any pixel dimensions:
- e.g. `1024x1024`, `1920x1080`, `768x1344`
- Dimensions are rounded to the nearest multiple of 16 by the API (e.g. `1000x1000` → `992x992`)
- Also accepts presets: `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9`

## Reference images

**Always pass relevant reference images when you have them.** References dramatically improve consistency — for style, character identity, color palette, composition, everything. More references = better results. If you have images of specific characters, objects, or styles that should appear in the output, pass them all via `--reference`. Don't hold back — the models handle many references well.

Works with PNG, JPG, and WebP. SVGs need to be rasterized to PNG first (e.g. with the svg2img skill).

Common cases where references help:
- **Character consistency** — pass all existing character images so the model sees exactly what they look like, not just a text description
- **Style matching** — pass examples of the target visual style
- **Scene composition** — pass individual element images when combining them into a scene
- **Iterating** — pass previous outputs as references to maintain continuity

Combine with `--input-image` to edit an existing image while matching reference styles.

```bash
# Style-guided generation
uv run skills/t2i/scripts/t2i.py "a cozy cabin" \
  --reference style-refs/watercolor-01.png style-refs/watercolor-02.png \
  --output cabin.png

# Character consistency — pass all character images
uv run skills/t2i/scripts/t2i.py "blue corgi and green cat having a picnic" \
  --reference characters/blue-corgi.png characters/green-cat.png characters/orange-fox.png \
  --output scene.png

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
- `FAL_API_KEY` — for `flux-*` models (fal.ai)

The script prints the exact export command needed if a key is missing.

## Cost reference

| Model | Cost/image |
|---|---|
| `gpt-image-1-mini` (low quality) | $0.005 |
| `gpt-image-1-mini` (medium) | $0.011 |
| `gpt-image-1` (low quality) | $0.011 |
| `gpt-image-1` (medium) | $0.042 |
| `gemini-2.5-flash-image` | ~$0.039 |
| `flux-2-flex` | ~$0.05/megapixel |
| `flux-2-pro` | ~$0.05/megapixel |
| `flux-1.1-ultra` | ~$0.06/megapixel |

OpenAI uses `quality: low` by default to keep iteration costs down.
Fal.ai bills per megapixel (1024x1024 = 1MP = ~$0.05).
