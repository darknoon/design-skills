# Tabler Icons

**Style**: 2 variants — outline (default) and filled
**Base size**: 24×24
**Icon count**: 5000+ outline, 1000+ filled
**License**: MIT
**Browse**: https://tabler.io/icons
**Source SVGs**: https://github.com/tabler/tabler-icons/tree/master/icons

## Variants

| Variant | Style | Set name for `get-icon.py` |
|---------|-------|---------------------------|
| Outline | Stroke, 2px, `fill="none"` | `tabler` (default) |
| Filled | Solid, `fill="currentColor"` | `tabler-filled` |

All variants use identical filenames (`home.svg`) — variant encoded in directory. Note: not every outline icon has a filled counterpart.

## Fetching by variant

```bash
uv run scripts/get-icon.py fetch tabler home
uv run scripts/get-icon.py fetch tabler-filled home
uv run scripts/get-icon.py fetch tabler --all-styles home
```

## React usage

```tsx
import { IconSearch } from '@tabler/icons-react'

<IconSearch size={20} stroke={1.5} />
// filled variant: import { IconSearchFilled } from '@tabler/icons-react'
```
