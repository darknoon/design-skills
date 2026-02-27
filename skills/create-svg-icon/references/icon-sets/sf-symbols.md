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

## Variants

SVGs in the cache follow the naming pattern:
```
{symbol.name}_{weight}_{size}_{rendering}.svg
```

| Axis | Default | Options |
|------|---------|---------|
| Weight | `regular` | `ultraLight` `thin` `light` `regular` `medium` `semibold` `bold` `heavy` `black` |
| Size | `medium` | `small` `medium` `large` |
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
