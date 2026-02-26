I've condensed some knowledge gained from using various text-to-image-generators for icons

# Image generation for icons

Here are some general guidelines that help when using image generators in the context of UI icon design.

### Helpful context:

Include other icons from the target icon set to make sure that the icon comes through correctly.


### Helpful tags
"ux icon"
"simple"

### Stylistic descriptions
How strokes are used
- "outline"
- "filled"

### Dimensions

**OpenAI** (`--size`): pixel dimensions as WxH — `1024x1024` (default), `512x512` sometimes gives better results.

**Gemini** — use either `--aspect-ratio` or `--size`, not both. Prefer `--aspect-ratio` for Gemini:
- `--aspect-ratio 1:1` — square (default, best for icons)
- `--aspect-ratio 9:16` — portrait
- `--aspect-ratio 16:9` — landscape
- `--aspect-ratio 4:3`, `--aspect-ratio 3:4` — classic photo ratios

If you need exact pixel dimensions instead, pass `--size WxH` explicitly (e.g. `--size 1024x1024`). Do not rely on the default — always specify one or the other for Gemini.

### Model selection
The best models are as follows:

1. `gpt-image-1`: Best for general icon generation and Apple/iOS style icons
2. `gemini-2.5-flash-image`: Good for all icons, best at Android-style icons
3. `gpt-image-1.5`: Ok, weaker at icons than `gpt-image-1`
4. `gemini-3.1-flash-image-preview`: Ok at icons, needs more description of style (filled vs stroke)

### Script usage

Run `scripts/t2i.py` with a prompt. Dependencies are managed automatically by `uv` — no manual install needed. The script will tell you exactly what to set if an API key is missing.

```bash
# OpenAI (default)
uv run skills/create-svg-icon/scripts/t2i.py "a person walking a dog, ux icon, outline, simple"

# Specific model and output path
uv run skills/create-svg-icon/scripts/t2i.py "search icon, filled" \
  --model gemini-2.5-flash-image \
  --output icons/search.png

# Override size (OpenAI)
uv run skills/create-svg-icon/scripts/t2i.py "calendar icon, outline" \
  --size 512x512 \
  --output icons/calendar.png

# Override aspect ratio (Gemini, defaults to 1:1)
uv run skills/create-svg-icon/scripts/t2i.py "home icon" \
  --model gemini-2.5-flash-image \
  --aspect-ratio 9:16
```

**API keys** — set as environment variables before running:

```bash
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=AIza...
```

If a key is missing the script will print the exact export command needed and exit.