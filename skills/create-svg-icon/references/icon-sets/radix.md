# Radix Icons

**Style**: Stroke, precise and compact — designed for dense UI
**Base size**: 15×15 (not 24×24)
**License**: MIT
**Browse**: https://www.radix-ui.com/icons
**Source SVGs**: https://github.com/radix-ui/icons/tree/master/packages/radix-icons/icons
**npm**: `@radix-ui/react-icons`

## React usage

```tsx
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'

<MagnifyingGlassIcon width={15} height={15} />
```

## Notes

- viewBox is `0 0 15 15`, not the standard 24×24
- If adapting for a 24×24 context, scale path coordinates by 1.6×
- Designed to pair with Radix UI primitives and Tailwind

## Finding path data

Browse radix-ui.com/icons, click an icon to copy SVG. GitHub source has one `.svg` per icon.
