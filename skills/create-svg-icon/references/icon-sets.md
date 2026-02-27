# Icon Sets Index

Read the file for the specific icon set the user is referencing. If the set is unknown, use this table to pick the closest match.

| Set | Style | viewBox | License | File |
|-----|-------|---------|---------|------|
| Heroicons | Stroke + solid | 24 / 20 | MIT | [icon-sets/heroicons.md](icon-sets/heroicons.md) |
| Lucide | Stroke | 24 | ISC | [icon-sets/lucide.md](icon-sets/lucide.md) |
| Phosphor | Stroke, 6 weights | 24 | MIT | [icon-sets/phosphor.md](icon-sets/phosphor.md) |
| Tabler | Stroke, 5000+ icons | 24 | MIT | [icon-sets/tabler.md](icon-sets/tabler.md) |
| Feather | Stroke, minimal | 24 | MIT | [icon-sets/feather.md](icon-sets/feather.md) |
| Material Symbols | Rounded/sharp/outlined | 24 | Apache 2.0 | [icon-sets/material-symbols.md](icon-sets/material-symbols.md) |
| Radix Icons | Stroke, 15px base | 15 | MIT | [icon-sets/radix.md](icon-sets/radix.md) |
| Codicons (VS Code) | Fill, IDE/dev-tool UI | 16 | CC-BY-4.0 | [icon-sets/codicons.md](icon-sets/codicons.md) |

## Adapting an icon from any set

1. Find the SVG source from the set's GitHub repo or website (see the set's file for links)
2. Copy the `<path>`, `<circle>`, `<line>`, etc. elements
3. Adjust stroke-width or path details as needed
4. Apply standard template attributes (`stroke="currentColor"`, `fill="none"`, etc.)
5. Verify points are on 0.5px grid and icon is optically balanced

To use an icon directly without customization: recommend the npm package and show the import. Offer inline SVG as a fallback.
