# create-svg-icon

A Codex + Claude Code skill for designing SVG icons using text-to-image generation, vectorization, and reference icon sets.

## How it works

The skill follows a multi-step pipeline:

1. **Context** — understand the target icon set, visual style, and intended usage
2. **Concept generation** — generate 2–3 candidate images via `t2i.py` (OpenAI or Gemini)
3. **Style grounding** — fetch real icons from the target set and pass as visual references
4. **Concept selection** — evaluate generated concepts, pick the best direction
5. **Vectorization** — convert the chosen raster image to SVG via Quiver
6. **Iteration** — refine the SVG until it meets quality requirements
7. **Production** — deliver final SVG in the requested format (inline, React component, .svg file)

Work is saved under `.context/icon_skill/<icon-name-NN>/` with a `PROGRESS.md` journal and full cost tracking.

---

## Scripts

All scripts use `uv run` and manage their own dependencies via inline metadata. No `pip install` needed.

### `t2i.py` — Text-to-image generation

Generate a raster PNG from a prompt.

```bash
uv run scripts/t2i.py "water bottle icon, outline, simple"
uv run scripts/t2i.py "home icon" --model gemini-2.5-flash-image --aspect-ratio 1:1
uv run scripts/t2i.py "search icon" --model gpt-image-1 --size 512x512 --output icon.png
uv run scripts/t2i.py "icon" --reference refs/search.png refs/home.png
```

**Models:**

| Model | Best for | Cost per image |
|-------|----------|----------------|
| `gpt-image-1-mini` | Fast iteration (default) | $0.005 low / $0.011 med / $0.036 high |
| `gpt-image-1` | Higher quality, Apple/iOS style | $0.011 low / $0.042 med / $0.167 high |
| `gemini-2.5-flash-image` | All icons, best Android style | ~$0.039 |
| `gemini-3.1-flash-image-preview` | All icons, needs explicit style description | ~$0.039 |

**Size:**
- OpenAI: `--size WxH` (e.g. `1024x1024`, `512x512`)
- Gemini: `--aspect-ratio 1:1|9:16|16:9|4:3|3:4` and/or `--size 512px|1K|2K|4K`

**References:**
Pass rasterized PNGs from the target icon set to ground the visual style. Do NOT just describe the style in the prompt — always use real references.

---

### `get-icon.py` — Fetch icons from popular sets

```bash
# List all icons in a set
uv run scripts/get-icon.py list lucide
uv run scripts/get-icon.py list lucide --filter globe

# Fetch specific icons by name
uv run scripts/get-icon.py fetch lucide search
uv run scripts/get-icon.py fetch heroicons magnifying-glass --output-dir refs/

# Fetch one icon in all style variants
uv run scripts/get-icon.py fetch phosphor pencil --all-styles --output-dir refs/

# Search and download matches
uv run scripts/get-icon.py search lucide globe --count 5 --output-dir refs/

# List available style variants for a set
uv run scripts/get-icon.py styles phosphor
uv run scripts/get-icon.py styles heroicons
```

**Supported sets:**

| Set | Styles / variants |
|-----|-------------------|
| `lucide` | Single style |
| `heroicons` | `heroicons` (24px outline), `heroicons-24-solid`, `heroicons-20-solid`, `heroicons-16-solid` |
| `tabler` | `tabler` (outline), `tabler-filled` |
| `feather` | Single style |
| `phosphor` | `phosphor` (regular), `phosphor-thin`, `phosphor-light`, `phosphor-bold`, `phosphor-fill`, `phosphor-duotone` |
| `radix` | Single style |
| `codicons` | Single style |

---

### `rasterize.py` — Render SVGs to PNG

Renders SVG files to 1024×1024 PNG using Playwright (auto-detects chromium/firefox/webkit).

```bash
# Single file (default 1024×1024)
uv run scripts/rasterize.py icon.svg

# Batch
uv run scripts/rasterize.py refs/*.svg --output-dir refs/

# Custom size
uv run scripts/rasterize.py icon.svg --size 256x256 --output-dir out/
```

Also importable by other scripts:
```python
sys.path.insert(0, "skills/create-svg-icon/scripts")
from rasterize import render_svgs, render_svg
```

---

### `vectorize.py` — Raster → SVG via Quiver

Converts a PNG/JPEG/WebP to SVG using the [Quiver API](https://quiver.ai).

```bash
uv run scripts/vectorize.py icon.png
uv run scripts/vectorize.py icon.png --auto-crop --output iteration-01/icon.svg
uv run scripts/vectorize.py icon.png --n 3 --output-dir candidates/
```

**Cost:** $0.30 per call (1 credit), regardless of `--n`. Buy credits at [app.quiver.ai/settings/api-keys](https://app.quiver.ai/settings/api-keys).

---

### `get-sf-symbol.py` — Fetch SF Symbols from macOS (macOS only)

Extracts SF Symbols SVGs from the local macOS system framework via the `act` CLI
(Asset Catalog Tinkerer). First run extracts ~8,500 SVGs to a local cache (~30s);
subsequent calls are instant.

```bash
# List all symbol names (fast — no extraction needed)
uv run scripts/get-sf-symbol.py list
uv run scripts/get-sf-symbol.py list --filter arrow

# Fetch specific symbols
uv run scripts/get-sf-symbol.py fetch arrow.right star star.fill
uv run scripts/get-sf-symbol.py fetch arrow.right --output-dir refs/

# Search and download matches
uv run scripts/get-sf-symbol.py search arrow --count 5 --output-dir refs/

# Non-default weight/size/rendering
uv run scripts/get-sf-symbol.py fetch arrow.right --weight ultraLight --size large
uv run scripts/get-sf-symbol.py fetch heart.fill --rendering multicolor
```

**Requires:** `brew install asset-catalog-tinkerer` (or the installed app at `/Applications/Asset Catalog Tinkerer.app`)

**Supported sets:** ~8,500 symbols (macOS 15). Weights: ultraLight → black. Rendering: template, hierarchical, multicolor, palette.

---

### `get-lucide-icon.py` — Fetch a single Lucide icon (legacy)

```bash
uv run scripts/get-lucide-icon.py search
uv run scripts/get-lucide-icon.py chevron-right icons/chevron-right.svg
```

Superseded by `get-icon.py fetch lucide <name>` but kept for convenience.

---

## Setup

### API keys

Copy `.env.example` to `.env` at the repo root and fill in keys:

```bash
cp .env.example .env
```

```
OPENAI_API_KEY=sk-proj-…       # for gpt-image-* models
GOOGLE_API_KEY=AI…              # for gemini-* models
QUIVER_API_KEY=sk_live_…        # for vectorize.py
```

Scripts load `.env` by walking up from the current directory, so keys set at the repo root work from any subdirectory.

### Playwright browsers

Required by `rasterize.py` and `t2i.py` (for SVG references). Install on first use:

```bash
uv run playwright install chromium
```

---

## Reference files

| File | When to read |
|------|--------------|
| `references/icon-sets.md` | Choosing or fetching from an icon set |
| `references/icon-sets/<set>.md` | Details on a specific icon set (lucide, heroicons, tabler, phosphor, material-symbols, sf-symbols, …) |
| `references/image-gen.md` | Prompt tips, model selection, cost rates |
| `references/vectorization.md` | Quiver API details and pricing |
| `references/icon-design-principles.md` | SVG quality rules, grid, stroke conventions |
| `references/02-icon-sketching.md` | Full concept generation workflow |
| `references/04-icon-production.md` | Production SVG templates |

---

## Workflow in detail

### Typical run for a representational icon (e.g. "phosphor-style water bottle")

```bash
# 1. Fetch style references from the target set and rasterize
uv run scripts/get-icon.py search phosphor bottle --count 3 --output-dir .context/icon_skill/water-bottle-01/refs/
uv run scripts/get-icon.py search phosphor cup --count 2 --output-dir .context/icon_skill/water-bottle-01/refs/
uv run scripts/rasterize.py .context/icon_skill/water-bottle-01/refs/*.svg \
  --output-dir .context/icon_skill/water-bottle-01/refs/

# 2. Generate concepts (2–3 different compositions)
uv run scripts/t2i.py "reusable water bottle with flip cap, phosphor icon style, outline" \
  --output .context/icon_skill/water-bottle-01/concepts/01-flip-cap/concept.png \
  --reference .context/icon_skill/water-bottle-01/refs/*.png

uv run scripts/t2i.py "sport water bottle, straw lid, phosphor icon style, outline" \
  --output .context/icon_skill/water-bottle-01/concepts/02-sport/concept.png \
  --reference .context/icon_skill/water-bottle-01/refs/*.png

# 3. Vectorize the best concept
uv run scripts/vectorize.py .context/icon_skill/water-bottle-01/concepts/01-flip-cap/concept.png \
  --auto-crop --output .context/icon_skill/water-bottle-01/iteration-01/icon.svg

# 4. Rasterize for review
uv run scripts/rasterize.py .context/icon_skill/water-bottle-01/iteration-01/icon.svg
```

## Cost tracking

The PROGRESS.md journal tracks costs after each billable API call. At the end of a session the skill reports the total to the user. Quick reference:

| Call | Model/service | Cost |
|------|--------------|------|
| `t2i.py` | gpt-image-1-mini (low) | $0.005/image |
| `t2i.py` | gpt-image-1 (low) | $0.011/image |
| `t2i.py` | Gemini | ~$0.039/image |
| `vectorize.py` | Quiver | $0.30/call |


## Symlink for Claude Code

This skill is symlinked into `~/.claude/skills/` so Claude Code picks it up automatically:

```bash
ln -s $(pwd)/skills/create-svg-icon ~/.claude/skills/create-svg-icon
```
