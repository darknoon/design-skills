# Phosphor Icons

**Style**: 6 weight variants — thin, light, regular, bold, fill, duotone
**Base size**: 24×24
**License**: MIT
**Browse**: https://phosphoricons.com
**Source SVGs**: https://github.com/phosphor-icons/core/tree/main/assets

## Weight variants

| Weight | Description | Set name for `get-icon.py` |
|--------|-------------|---------------------------|
| Thin | Very light stroke | `phosphor-thin` |
| Light | Light stroke | `phosphor-light` |
| Regular | Standard stroke (default) | `phosphor` |
| Bold | Heavy stroke | `phosphor-bold` |
| Fill | Solid filled shapes | `phosphor-fill` |
| Duotone | Two-tone with opacity layer | `phosphor-duotone` |

## Fetching by weight

```bash
# Default (regular)
uv run scripts/get-icon.py fetch phosphor pencil

# Specific weight
uv run scripts/get-icon.py fetch phosphor-bold pencil
uv run scripts/get-icon.py fetch phosphor-fill pencil

# Search across a weight
uv run scripts/get-icon.py search phosphor-light arrow --count 5
```

## React usage

```tsx
import { MagnifyingGlass } from '@phosphor-icons/react'

<MagnifyingGlass size={24} weight="light" />
// weight: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
```

## Notes

- SVG filenames for non-regular weights include the weight suffix: `pencil-bold.svg`, `pencil-fill.svg`, etc.
- `regular` SVGs have no suffix: `pencil.svg`
- Duotone icons include two overlapping paths — one at full opacity, one at 20% — which creates the two-tone effect
