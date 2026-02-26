# Heroicons

**Style**: 4 variants — 24px outline/solid, 20px solid, 16px solid
**Stroke**: 1.5px outline, round linecap/join
**License**: MIT
**Browse**: https://heroicons.com
**Source SVGs**: https://github.com/tailwindlabs/heroicons/tree/master/optimized

## Variants

| Variant | Size | Style | Set name for `get-icon.py` |
|---------|------|-------|---------------------------|
| 24/outline | 24px | Stroke, 1.5px | `heroicons` (default) |
| 24/solid | 24px | Filled | `heroicons-24-solid` |
| 20/solid | 20px | Filled | `heroicons-20-solid` |
| 16/solid | 16px | Filled | `heroicons-16-solid` |

All variants use identical filenames (`magnifying-glass.svg`) — the variant is encoded in the directory path, not the filename.

## Fetching by variant

```bash
uv run scripts/get-icon.py fetch heroicons magnifying-glass
uv run scripts/get-icon.py fetch heroicons-24-solid magnifying-glass
uv run scripts/get-icon.py fetch heroicons --all-styles magnifying-glass
```

## React usage

```tsx
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
// variants: /24/outline, /24/solid, /20/solid, /16/solid
```
