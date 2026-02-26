# Icon Production Details

## Grid & Sizing

It's important to identify the general shape and bounds that icons in the given icon set obey. That way you get a natural consistency between icons, though some may violate these soft rules.

For the icon set that you're targeting, it's important to identify:

**view box**  (outer bounds) Generally all of the icon content should fit absolutely within this maximum outer area. This is the area that will be shown within the UI.


For example

- **Standard viewBox**: `0 0 24 24` (24×24 unit grid)
- **Optical margin**: Keep content within 2–2.5u padding from edges (live area: ~19–20u)
- **Snap to 0.5px grid**: All anchor points should land on 0.5u increments (e.g., 12, 11.5, 5.25). Avoid sub-0.5 fractions.
- **Stroke icons**: Visual weight ~1.5u stroke width. Visually balanced, not physically measured.
- **Common icon sizes in use**: 16px, 20px, 24px. Design at 24 and scale down.

## Stroke Icons

```
stroke="currentColor"
stroke-width="1.5"
stroke-linecap="round"
stroke-linejoin="round"
fill="none"
```

- Use for outline/line-style icons (most UI icon sets)
- Avoid hairline strokes (<1.0) — they disappear at small sizes
- Avoid blunt caps unless intentional — always use `round` caps for UI icons

## Fill Icons

```
fill="currentColor"
stroke="none"
```

- Use for solid-style icons
- Prefer even, symmetric shapes
- Ensure negative space reads clearly at 16px

## Optical Alignment

Shapes that are geometrically centered may look off. Compensate:

- **Circles**: Slightly larger than squares of the same weight (add ~0.5u radius)
- **Triangles / arrows**: Shift 0.5–1u in pointing direction
- **Vertical centering**: Visually heavy shapes (chevrons, checks) often need nudging up by 0.5u

## Path Primitives

**Line**: `<line x1="..." y1="..." x2="..." y2="..." />`

**Rectangle** (rounded): `<rect x="3" y="3" width="18" height="18" rx="2" />`

**Circle**: `<circle cx="12" cy="12" r="9" />`

**Polyline** (open path): `<polyline points="6,12 12,18 18,12" />`

**Path (arcs and curves)**:
```
M x,y          — move to
L x,y          — line to
H x / V y      — horizontal/vertical line
C x1,y1,...    — cubic bezier
A rx,ry,rot,large-arc,sweep,x,y  — arc
Z              — close path
```

## Common Icon Patterns

| Icon | Technique |
|------|-----------|
| Chevron (right) | `<polyline points="9,18 15,12 9,6" />` |
| X / close | Two diagonal lines crossing at center |
| Check | `<polyline points="4,12 9,17 20,6" />` |
| Plus | `<line x1="12" y1="5" x2="12" y2="19" />` + `<line x1="5" y1="12" x2="19" y2="12" />` |
| Circle with dot | `<circle cx="12" cy="12" r="9" />` + `<circle cx="12" cy="12" r="1" fill="currentColor" />` |
| Home | Pentagon roof + rectangle body |
| Search | Circle + diagonal line extending bottom-right |
| Hamburger menu | Three horizontal lines, evenly spaced |



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

## Accessibility

- Never rely on color alone to convey meaning

## Choose the output format

Ask if unclear; default to inline SVG.

| Format          | When to use                               |
| --------------- | ----------------------------------------- |
| Inline SVG      | Dropping into HTML directly               |
| React component | Used in a React/JSX codebase              |
| `.svg` file     | Saving as an asset, using in design tools |


## Quality Checks

Before outputting an icon:
- [ ] All points on 0.5px grid
- [ ] No unnecessary path complexity (simplify beziers where possible)
- [ ] `currentColor` used — not hardcoded hex
