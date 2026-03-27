---
name: krea
description: Generate images and videos using the Krea API, which aggregates many image and video models behind a single endpoint. Use this skill whenever the user wants to generate, create, or render images or video using Krea, or mentions  Krea, Z Image, Flux, Seedream, Imagen, Topaz, or any model available through Krea and the user has a Krea account.
argument-hint: "[prompt] [--model MODEL] [--output PATH]"
allowed-tools: Read, Write, Glob, Bash(bun run skills/krea/scripts/*), Bash(bun skills/krea/scripts/*), Bash(mkdir -p *)
---

# Krea API

Generate images and videos through Krea. It aggregates many models (Flux, Seedream, Imagen, etc.) behind a single API with unified billing, and also offers Z Image — a fast, cheap model good for rapid iteration.

## Quick start

```bash
bun run skills/krea/scripts/krea.ts "a futuristic cityscape at sunset" --output scratch/city.png
```

The script handles the full async lifecycle: submit the job, poll until done, download the result. Output defaults to `scratch/output.png`.

## API key

Set `KREA_API_TOKEN` as an environment variable or in a `.env` file. Generate one at [krea.ai/settings/api-tokens](https://www.krea.ai/settings/api-tokens). Format: `{id}:{secret}`.

## Choosing a model

Pick based on what matters most — speed, quality, or cost. All costs are in compute units (CU), drawn from the user's Krea subscription pool.

| Model | ~CU | ~Time | Best for |
|-------|-----|-------|----------|
| `z-image` | 3 | 5s | Fast iteration, cheap. Realistic but low diversity. **Default.** |
| `flux` | 5 | 5s | Versatile general-purpose. Good with LoRAs. |
| `flux-kontext` | 9 | 5s | Editing existing images. |
| `flux-1-1-pro` | 31 | 11s | Higher quality when speed matters less. |
| `flux-1-1-pro-ultra` | 47 | 18s | Maximum BFL quality. |
| `seedream-4` | 24 | 20s | Photorealism and text rendering. |
| `imagen-4-fast` | 16 | ~15s | Fast Google model. |
| `imagen-4-ultra` | 47 | 30s | Google flagship quality. |
| `ideogram-3` | — | — | Text in images. |
| `chatgpt-image` | 183 | 60s | OpenAI quality, but expensive and slow. |

**Video:** `wan-2-1`, `kling-2-5`, `kling-2-6`, `veo-3-1` (see `references/api-details.md`). Video models may not be available on all plans — if you get a 404, tell the user the model isn't available on their current Krea plan rather than retrying.

**Upscaling:** `topaz` (faithful, 22K), `topaz-bloom` (creative, 10K), `topaz-generative` (creative, 16K) (see `references/api-details.md`)

When unsure, start with `z-image` for speed or `flux` for versatility. Move to `seedream-4` or `imagen-4-ultra` when the user wants higher fidelity.

## Script options

```bash
bun run skills/krea/scripts/krea.ts "<prompt>" [options]
```

| Flag | Purpose | Default |
|------|---------|---------|
| `--model MODEL` | Which model to use | `z-image` |
| `--output PATH` | Where to save the result | `scratch/output.png` |
| `--width N` | Image width | 1024 |
| `--height N` | Image height | 1024 |
| `--steps N` | Inference steps (more = more detail, slower) | model default |
| `--seed N` | Seed for reproducible results | random |
| `--image-url URL` | Source image for img2img / upscaling | — |

## Billing

API calls draw from the same CU pool as the Krea web app. Failed/cancelled jobs cost nothing. See `references/api-details.md` for plan tiers and pricing. There is no API endpoint to check the user's plan or available models — if a model returns 404, it's not available on their plan.

## References

- **`references/api-details.md`** — Billing tiers, video/upscaling model details, LoRA training, Node Apps, webhooks, and raw API endpoint patterns. Read when you need specifics beyond basic image generation.
