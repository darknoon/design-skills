# Material Symbols (Google)

**Style**: 3 variants — outlined (default), rounded, sharp
**Base size**: 24×24
**Icon count**: ~2,700
**License**: Apache 2.0
**Browse**: https://fonts.google.com/icons
**Source SVGs**: https://github.com/google/material-design-icons/tree/master/symbols/web

## Variants

| Variant | Style | Set name for `get-icon.py` |
|---------|-------|---------------------------|
| Outlined | Sharp corners, stroke-based | `material-symbols` (default) |
| Rounded | Rounded corners and terminals | `material-symbols-rounded` |
| Sharp | Angular, geometric | `material-symbols-sharp` |

All variants use identical icon names (e.g. `search`, `account_circle`) — variant encoded in the path. Icon names use underscores.

## Fetching with get-icon.py

```bash
# List icons (parses codepoints file — works despite large repo size)
uv run scripts/get-icon.py list material-symbols
uv run scripts/get-icon.py list material-symbols --filter search

# Fetch a specific icon
uv run scripts/get-icon.py fetch material-symbols search
uv run scripts/get-icon.py fetch material-symbols-rounded search
uv run scripts/get-icon.py fetch material-symbols account_circle

# Fetch one icon in all three style variants
uv run scripts/get-icon.py fetch material-symbols --all-styles search

# List the three variants
uv run scripts/get-icon.py styles material-symbols
```

## React usage (Material UI)

```tsx
import SearchIcon from '@mui/icons-material/Search'

<SearchIcon sx={{ fontSize: 20 }} />
```

## React usage (standalone)

```tsx
// Use as icon font via CSS class, or import SVG directly
import { Search } from 'material-symbols'
```

## Variable font axes (advanced)

The icons are also distributed as a variable font (`MaterialSymbolsOutlined[FILL,GRAD,opsz,wght].woff2`) with four axes:

| Axis | Range | Description |
|------|-------|-------------|
| `wght` (weight) | 100–700 | Stroke thickness |
| `FILL` | 0–1 | 0 = outlined, 1 = filled |
| `GRAD` (grade) | -50–200 | Fine weight adjustment without layout shift |
| `opsz` (optical size) | 20–48 | Optimised detail level for the rendered size |

When using the SVG files from this script, these axes are baked into the static `_24px.svg` file (weight 400, fill 0). For dynamic axis control, use the variable font or the `material-symbols` npm package.
