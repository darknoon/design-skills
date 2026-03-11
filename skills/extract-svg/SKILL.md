---
name: extract-svg
description: Discover and extract all SVGs from any web page. Navigates to a URL using browser automation, scans the DOM for SVGs (inline, img tags, CSS backgrounds, shadow DOM, symbols, sprites, templates, web components, and more), resolves CSS-dependent styles into each SVG, and saves them as self-contained .svg files. Use when asked to grab, extract, rip, collect, or download SVGs from a website or URL.
argument-hint: "[URL to extract SVGs from]"
---

# Extract SVGs from Web Pages

This skill automates SVG discovery and extraction from any web page using Vercel's agent-browser. It implements the same comprehensive extraction strategies as the svg-gobbler browser extension, adapted into a standalone JS script that runs via `agent-browser eval`.

Extracted inline SVGs have all class-dependent CSS resolved and inlined as `style` attributes, so each `.svg` file is fully self-contained and renderable independently.

## Quick Start

```bash
# Open the page and wait for it to load
pnpx agent-browser open "https://example.com"
pnpx agent-browser wait --load networkidle

# Extract all SVGs and save to disk
pnpx agent-browser eval --stdin < skills/extract-svg/scripts/extract-svgs.js \
  | python3 skills/extract-svg/scripts/save-svgs.py
```

Output goes to `.context/extracted-svg/<domain>/` by default. Use `--output DIR` to override.

## Scripts

### `scripts/extract-svgs.js`

Runs in the page context via `agent-browser eval --stdin`. Scans the DOM using 12 discovery strategies, resolves computed CSS styles on classed elements, and returns JSON to stdout.

Returns:
```json
{
  "data": [
    { "id": 1, "name": "logo", "type": "inline", "svg": "<svg xmlns=\"...\" ...>...</svg>" },
    { "id": 2, "name": "icon", "type": "image-ref", "svg": "<img src=\"/icon.svg\">" }
  ],
  "count": 2,
  "host": "example.com",
  "href": "https://example.com/page",
  "origin": "https://example.com"
}
```

### `scripts/save-svgs.py`

Reads JSON from stdin, writes individual `.svg` files. Handles:
- **inline** — saved directly (xmlns ensured)
- **symbol** — wrapped in `<svg>` with `<use>` reference
- **g-element** — wrapped in `<svg>` with viewBox
- **image-ref** — URLs logged to `_image-refs.txt` for manual fetching

## CSS Inlining

The extraction script resolves computed styles for any SVG child element that has a `class` attribute. This handles cases like:
- Icon sets with `.accent` classes styled via CSS custom properties
- SVGs styled via external stylesheets
- Class-based fill/stroke/opacity overrides

The resolved values (e.g. `fill: color(display-p3 1 0.94 0.65)`) are written as inline `style` attributes, and the `class` attribute is removed. The result is a standalone SVG that looks correct without its parent page's CSS.

## Discovery Strategies (12 total)

| # | Strategy | What it finds |
|---|----------|---------------|
| 1 | Source & background images | `<img src="*.svg">`, `<object>`, `<embed>`, `<iframe>`, CSS `background-image` |
| 2 | Inline SVG elements | `<svg>` elements (excluding sprite containers) |
| 3 | G elements | `<g>` group elements |
| 4 | Symbol elements | `<symbol>` elements |
| 5 | Use elements | `<use href>` and `<use xlink:href>` references |
| 6 | Shadow DOM | SVGs inside shadow DOMs, recursively |
| 7 | CSS custom properties | SVG URLs in CSS variables (`--var`) |
| 8 | Web components | SVGs slotted into custom elements |
| 9 | CSS content | SVG URLs in CSS `content` properties |
| 10 | Template elements | SVGs inside `<template>` elements |
| 11 | CSS sprite sheets | SVG sprites via `background-image` + `background-position` |
| 12 | Picture elements | `<picture>` with `<source type="image/svg+xml">` |

## Fetching Image References

Image-ref results contain `<img>` tags pointing to `.svg` URLs. To fetch them while the browser session is still open:

```bash
pnpx agent-browser eval "fetch('https://example.com/icon.svg').then(r=>r.text())"
```

## Notes

- Zero-cost skill — no API calls, just browser automation and local file I/O
- CORS restrictions may prevent fetching some externally-referenced SVGs; these are logged but don't fail the run
- The extraction script runs in ~100ms on most pages — single synchronous DOM scan
