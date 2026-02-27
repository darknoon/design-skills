---
name: extract-svg
description: Discover and extract all SVGs from any web page. Navigates to a URL using browser automation, scans the DOM for SVGs (inline, img tags, CSS backgrounds, shadow DOM, symbols, sprites, templates, web components, and more), and returns the collected SVGs. Use when asked to grab, extract, rip, collect, or download SVGs from a website or URL.
argument-hint: "[URL to extract SVGs from]"
allowed-tools: Bash(agent-browser *), Bash(cat *), Bash(mkdir -p *), Read, Write, Glob
---

# Extract SVGs from Web Pages

This skill automates SVG discovery and extraction from any web page using Vercel's agent-browser. It implements the same comprehensive extraction strategies as the svg-gobbler browser extension, adapted into a standalone JS script that runs via `agent-browser eval`.

## Workflow

1. **Navigate** — `agent-browser open <url>` and wait for load
2. **Extract** — pipe `scripts/extract-svgs.js` into the page context
3. **Resolve** — fetch the actual SVG content for image references
4. **Save** — write each SVG to disk, generate a manifest

## Running the Extraction

```bash
# 1. Open the page
agent-browser open "https://example.com"

# 2. Wait for full load
agent-browser wait --load networkidle

# 3. Run the extraction script
agent-browser eval --stdin < skills/extract-svg/scripts/extract-svgs.js
```

The script returns a JSON string with this shape:

```json
{
  "data": [
    { "id": 1, "name": "logo", "type": "inline", "svg": "<svg ...>...</svg>" },
    { "id": 2, "name": "icon-arrow", "type": "image-ref", "svg": "<img src=\"/icons/arrow.svg\">" }
  ],
  "count": 2,
  "host": "example.com",
  "href": "https://example.com/page",
  "origin": "https://example.com"
}
```

### SVG types in results

| Type | Meaning | Action needed |
|------|---------|---------------|
| `inline` | Full `<svg>` markup, ready to use | Save directly |
| `image-ref` | `<img>` tag pointing to a `.svg` URL | Fetch the URL to get actual SVG content |
| `symbol` | `<symbol>` element, not directly renderable | Wrap in `<svg>` with `<use>` reference |
| `g-element` | `<g>` group, no root `<svg>` | Wrap in `<svg>` with computed viewBox |

## Resolving Image References

For results with `type: "image-ref"`, extract the `src` attribute and fetch the SVG content:

```bash
# Fetch a referenced SVG file
agent-browser eval "fetch('https://example.com/icon.svg').then(r=>r.text())"
```

For data URIs, decode in-page:

```bash
agent-browser eval "decodeURIComponent('data:image/svg+xml,...'.split(',').slice(1).join(','))"
```

## Output Structure

Save to `.context/extracted-svg/<domain>/` or a user-specified directory:

```
.context/extracted-svg/<domain>/
  manifest.md          # Summary table of all found SVGs
  inline/
    001-logo.svg
    002-nav-icon.svg
  images/
    arrow.svg           # Fetched from <img src="*.svg">
  symbols/
    symbol-name.svg     # Wrapped <symbol> elements
```

## Discovery Strategies (12 total)

The `scripts/extract-svgs.js` script scans for SVGs using these strategies:

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

## Notes

- Zero-cost skill — no API calls, just browser automation and local file I/O
- CORS restrictions may prevent fetching some externally-referenced SVGs; note these but don't fail
- Very large pages may have hundreds of SVGs; offer to filter by minimum size or type
- The extraction script runs in ~100ms on most pages — single synchronous DOM scan
