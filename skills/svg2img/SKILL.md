---
name: svg2img
description: Render SVG files to PNG images using Playwright. Use when asked to rasterize, render, screenshot, or convert an SVG to a raster image (PNG). Also useful for creating previews of SVGs at specific sizes.
argument-hint: "<file.svg> [--size WxH] [--output-dir DIR]"
allowed-tools: Read, Glob, Bash(uv run skills/svg2img/scripts/rasterize.py *), Bash(mkdir -p *)
---

# SVG to Image

Render SVG files to PNG using a headless browser (Playwright).

## Script location

```
skills/svg2img/scripts/rasterize.py
```

## Usage

```bash
# Single file (defaults to 1024x1024, saves alongside the SVG)
uv run skills/svg2img/scripts/rasterize.py icon.svg

# Multiple files
uv run skills/svg2img/scripts/rasterize.py icons/*.svg --output-dir rendered/

# Custom size
uv run skills/svg2img/scripts/rasterize.py icon.svg --size 256x256

```

Dependencies are managed by `uv` — no manual install needed. Playwright will use the first available browser (chromium, firefox, or webkit).

## Options

- `--size WxH` — output dimensions (default: `1024x1024`)
- `--output-dir DIR` — where to write PNGs (default: same directory as the SVG)
- `--bg COLOR` — background color: hex (e.g. `#ff0000`), named color, or `transparent` (default: `white`)

## Notes

- Output filename matches the input with `.png` extension
- SVG is rendered at the exact requested size (not scaled from a larger render)
- If no Playwright browser is installed, the script will tell you how to install one
