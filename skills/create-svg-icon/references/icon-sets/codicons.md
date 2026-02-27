# Codicons (VS Code)

**Style**: Outlined appearance, monochrome, designed for IDE/developer-tool UI
**Base size**: 16x16
**Icon count**: ~542
**License**: CC-BY-4.0 (icons), MIT (code)
**Browse**: https://microsoft.github.io/vscode-codicons/
**Source SVGs**: https://github.com/microsoft/vscode-codicons/tree/main/src/icons

## Design characteristics

It would be okay to talk about some general ideas about this in the overall design language files.- **Outlined appearance, fill paths**: Icons look outlined but are built with filled `<path>` elements and cutouts — they do not use SVG `stroke`.
It would be okay to talk about some general ideas about this in the overall design language files.- **16x16 viewBox**: Smaller than most sets.
- **~1px perceptual stroke width**: The outlined shapes have a perceptual stroke width of about 1px within the 16x16 grid.
- **Single path**: Most icons are a single `<path d="..."/>` element.
- **`currentColor` theming**: All icons inherit colour from their parent element.

## Fetching with get-icon.py

```bash
# List all icons
uv run scripts/get-icon.py list codicons
uv run scripts/get-icon.py list codicons --filter arrow

# Fetch specific icons
uv run scripts/get-icon.py fetch codicons search
uv run scripts/get-icon.py fetch codicons close chevron-right terminal

# Search and download matches
uv run scripts/get-icon.py search codicons debug --count 5 --output-dir refs/
```

## React usage (@vscode/codicons)

```tsx
// Install: npm i @vscode/codicons
// Use as CSS icon font:
import '@vscode/codicons/dist/codicon.css'

<span className="codicon codicon-search" />
```

## Inline SVG usage

```tsx
// 16x16 viewBox — scale with width/height as needed
<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="..." />
</svg>
```
