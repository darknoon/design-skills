---
name: create-svg-icon
description: Design beautiful SVG icons that match your design style for use in UI (eg ios apps, android apps, web apps, documentation, &c). Output svg text, a React component, or standalone .svg file. Use when asked to draw, design, or generate an icon, glyph, or symbol. Also use when adapting or referencing an icon from an existing icon set to a different style (but not just for converting mechanically to a component).
---

# Create SVG Icon

This skill describes common processes for making clean SVG icons for UI, based on a defined visual style and aware of the intended context.

## Workflow

**1. Gain context about the current project and icon needs**

Information you're looking for:

- How will this icon be used?
  - if we're able to get specific HTML context that's ideal b/c then we can see visually how we need to adapt to eg text to the right of the icon, sitting in a button etc.

- What's the overall visual style of the icon set?
  - If the user is making a one-off icon, then we can offer a couple alternatives of visual styles. see `references/icon-sets.md` for examples of popular styles and their characteristics.

- If the user references a named icon or icon set → look up the icon from `references/icon-sets.md`, adapt its path data
- If the user describes an icon concept → draw from scratch using SVG path primitives

**2. Consider various concepts**

Go to step `references/01-icon-sketching in

(see `references/icon-design-principles.md` for full rules)

**3. Choose the output format**

Ask if unclear; default to inline SVG.

| Format          | When to use                               |
| --------------- | ----------------------------------------- |
| Inline SVG      | Dropping into HTML directly               |
| React component | Used in a React/JSX codebase              |
| `.svg` file     | Saving as an asset, using in design tools |

## Output Templates

### Inline SVG

```html
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <!-- paths here -->
</svg>
```

### React Component

```tsx
export function IconName({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* paths here */}
    </svg>
  );
}
```

### SVG File

Use `assets/icon-template.svg` as the starting point, then fill in paths.

## References

- **`references/icon-design-principles.md`** — Grid, optical sizing, stroke rules, accessibility, common path patterns. Read when drawing from scratch or when quality feels off.
- **`references/icon-sets.md`** — Available icon sets, their style characteristics, CDN/npm sources, and how to look up specific icons. Read when the user references an existing icon or set.
