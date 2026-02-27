# SF Symbols (Apple)

**Style**: Multiple weights and sizes; monochromatic, hierarchical, multicolor, palette rendering
**Sizing model**: Typographic — symbols scale with the surrounding font size and align to the text baseline, not a fixed pixel grid
**Icon count**: ~8,500 (macOS 15 / Sequoia)
**License**: Proprietary — Apple license, free to use in apps on Apple platforms
**Browse**: https://developer.apple.com/sf-symbols/ (SF Symbols app)
**Availability**: macOS only — symbols live in the system SF Symbols framework

## Requirements

- macOS (symbols extracted from the local system framework)
- [`act` CLI](https://github.com/insidegui/AssetCatalogTinkerer) — for first-run extraction
  ```bash
  brew install asset-catalog-tinkerer
  ```

The first `fetch` or `search` call extracts ~8,500 SVGs to `~/.cache/sf-symbols/<macos-version>/`
in about 30 seconds. Subsequent calls are instant file copies.

`list` is always instant — it reads a local plist without any extraction.

## Sizing and weight model

SF Symbols are built on the **SF Pro variable font**. Both weight and scale behave as variable font axes, not discrete values:

- **Weight is a seamlessly interpolated variable axis.** The named stops (`ultraLight` → `black`) are checkpoints, but the font interpolates continuously between them — `.fontWeight(.light)` can resolve to any value between `thin` and `regular` without jumping. The SVG exports are static snapshots at the named stops only.
- **Scale categories** (`small`, `medium`, `large`) map to the font's optical size axis. They are not pixel sizes — `medium` aligns the symbol's cap-height with the adjacent text cap-height at the same point size.
- **Baseline alignment** is baked in: each SVG includes padding so the visual weight sits on the text baseline when rendered at any point size. This padding is intentional — don't crop it.
- **Optical compensation by scale**: `small` has slightly heavier strokes for legibility at small sizes; `large` is optically lighter. These differences are pre-baked into the separate SVG variants.
- **Point size → pixels**: at 17pt body / 2× display, `medium` renders at ~34px. At 28pt, ~56px. The symbol follows the font size, not a fixed grid.

When designing to match SF Symbols: design for the silhouette at small sizes (~20–22px effective), keep the baseline padding intact, and treat stroke weight as a continuous property that must feel consistent with the surrounding font weight.

## Variants

SVGs in the cache are static exports — named snapshots of the underlying variable font axes:

```
{symbol.name}_{weight}_{size}_{rendering}.svg
```

| Axis | Default | Options |
|------|---------|---------|
| Weight | `regular` | `ultraLight` `thin` `light` `regular` `medium` `semibold` `bold` `heavy` `black` |
| Size | `medium` | `small` (heavier strokes) `medium` (default) `large` (lighter strokes) |
| Rendering | `template` | `template` (monochromatic) `hierarchical` `multicolor` `palette` |

Not every symbol has every combination. Missing combinations fall back silently.

## Fetching with get-sf-symbol.py

Always start with `list --filter` to discover exact names, then `fetch` the ones you want.

```bash
# Step 1 — find the exact names you want (fast, no extraction)
uv run scripts/get-sf-symbol.py list --filter car
# → car, car.2, car.ferry, car.fill, car.rear, car.side, car.side.fill, ...

# Step 2 — fetch the specific symbols you need
uv run scripts/get-sf-symbol.py fetch car car.side car.fill --output-dir refs/

# Alternative: search + download in one step (when any match is useful)
uv run scripts/get-sf-symbol.py search car --count 5 --output-dir refs/

# Non-default weight/size/rendering
uv run scripts/get-sf-symbol.py fetch car --weight ultraLight
uv run scripts/get-sf-symbol.py fetch car.fill --rendering multicolor --size large
```

Output files are named `sf-{symbol.name}.svg` (e.g. `sf-car.side.svg`).

## Swift / SwiftUI usage

```swift
// SwiftUI
Image(systemName: "arrow.right")
    .symbolRenderingMode(.hierarchical)
    .fontWeight(.light)

// UIKit
UIImage(systemName: "arrow.right")
```

## Finding symbol names

- **SF Symbols app** — browse and search visually (free download from Apple Developer site)
- `uv run scripts/get-sf-symbol.py list --filter <term>` — substring search on all 8,500 names
- Names use dot-separated components, e.g. `arrow.right`, `arrow.right.circle.fill`, `star.fill`

## License note

SF Symbols may only be used in software for Apple platforms. They must not be used in
logos, brand marks, or hardware icons. See Apple's [SF Symbols Usage Guidelines](https://developer.apple.com/design/human-interface-guidelines/sf-symbols).
