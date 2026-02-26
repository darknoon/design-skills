# Lucide

**Style**: Minimalist stroke, highly consistent
**Base size**: 24×24
**Stroke**: 2px default, round linecap/join
**License**: ISC
**Browse**: https://lucide.dev/icons
**Source SVGs**: https://github.com/lucide-icons/lucide/tree/main/icons

## React usage

```tsx
import { Search, X, ChevronRight } from 'lucide-react'

<Search size={20} strokeWidth={1.5} />
```

## Finding path data

Run the bundled script with the icon name (use hyphens, lowercase):

```bash
# Saves to <icon-name>.svg in the current directory
python skills/create-svg-icon/scripts/get-lucide-icon.py search

# Save to a specific path
python skills/create-svg-icon/scripts/get-lucide-icon.py chevron-right icons/chevron-right.svg
```

If the icon name is unknown, browse https://lucide.dev/icons to find the exact name, then run the script.
