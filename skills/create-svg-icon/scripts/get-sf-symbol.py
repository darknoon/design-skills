#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
"""
Fetch SF Symbols as SVG files from the local macOS system.

Reads SVGs from the SF Symbols framework bundled with macOS. Requires the
'act' CLI from Asset Catalog Tinkerer to extract SVGs on first use.

Get act:  brew install asset-catalog-tinkerer
          https://github.com/insidegui/AssetCatalogTinkerer

The extracted SVGs are cached in ~/.cache/sf-symbols/<macos-version>/ so
the slow extraction only happens once per macOS version.

Usage:
    # List all symbol names (fast — reads local plist, no extraction needed)
    uv run scripts/get-sf-symbol.py list
    uv run scripts/get-sf-symbol.py list --filter arrow

    # Fetch specific symbol(s) by exact name
    uv run scripts/get-sf-symbol.py fetch arrow.right
    uv run scripts/get-sf-symbol.py fetch star star.fill --output-dir refs/

    # Search names containing a term and download matches
    uv run scripts/get-sf-symbol.py search arrow --count 5 --output-dir refs/

Weight / size / rendering options (defaults: regular, medium, template):
    --weight    ultraLight | thin | light | regular | medium | semibold | bold | heavy | black
    --size      small | medium | large
    --rendering template | hierarchical | multicolor | palette
"""

import argparse
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

# Paths inside the SF Symbols private framework
_BUNDLE = Path(
    "/System/Library/PrivateFrameworks/SFSymbols.framework"
    "/Versions/A/Resources/CoreGlyphs.bundle/Contents/Resources"
)
CAR = _BUNDLE / "Assets.car"
NAME_AVAILABILITY = _BUNDLE / "name_availability.plist"

ACT_APP_PATH = Path("/Applications/Asset Catalog Tinkerer.app/Contents/MacOS/act")
CACHE_BASE = Path.home() / ".cache" / "sf-symbols"

DEFAULT_WEIGHT = "regular"
DEFAULT_SIZE = "medium"
DEFAULT_RENDERING = "template"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_act() -> Path:
    if ACT_APP_PATH.exists():
        return ACT_APP_PATH
    found = shutil.which("act")
    if found:
        return Path(found)
    print(
        "Error: 'act' CLI not found.\n"
        "Install Asset Catalog Tinkerer:\n"
        "  brew install asset-catalog-tinkerer\n"
        "  https://github.com/insidegui/AssetCatalogTinkerer",
        file=sys.stderr,
    )
    sys.exit(1)


def macos_version() -> str:
    result = subprocess.run(["sw_vers", "-productVersion"], capture_output=True, text=True)
    return result.stdout.strip()


def ensure_cache(act: Path) -> Path:
    """Extract the SF Symbols asset catalog to a local cache dir (once per macOS version)."""
    d = CACHE_BASE / macos_version()
    if d.exists() and any(d.iterdir()):
        return d
    d.mkdir(parents=True, exist_ok=True)
    print(f"Extracting SF Symbols to cache — this takes ~30s and only happens once.", file=sys.stderr)
    result = subprocess.run(
        [str(act), "--input", str(CAR), "extract", "--output", str(d)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"Extraction failed:\n{result.stderr}", file=sys.stderr)
        d.rmdir()
        sys.exit(1)
    count = sum(1 for _ in d.glob("*.svg"))
    print(f"Cached {count} SVGs to {d}", file=sys.stderr)
    return d


def list_names() -> list[str]:
    """Return sorted symbol names from the local name_availability.plist (no extraction needed)."""
    if not NAME_AVAILABILITY.exists():
        print("Error: SF Symbols framework not found. Requires macOS.", file=sys.stderr)
        sys.exit(1)
    with NAME_AVAILABILITY.open("rb") as f:
        data = plistlib.load(f)
    return sorted(data.get("symbols", {}).keys())


def find_svg(cache: Path, name: str, weight: str, size: str, rendering: str) -> Path | None:
    candidate = cache / f"{name}_{weight}_{size}_{rendering}.svg"
    return candidate if candidate.exists() else None


def save_icon(src: Path, name: str, output_dir: Path) -> Path:
    out = output_dir / f"sf-{name}.svg"
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, out)
    return out


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def cmd_list(args: argparse.Namespace) -> None:
    names = list_names()
    if args.filter:
        names = [n for n in names if args.filter.lower() in n.lower()]
    for name in names:
        print(name)


def cmd_fetch(args: argparse.Namespace) -> None:
    cache = ensure_cache(find_act())
    output_dir = Path(args.output_dir)
    found = 0
    for name in args.names:
        svg = find_svg(cache, name, args.weight, args.size, args.rendering)
        if svg is None:
            print(f"[sf] '{name}' not found (weight={args.weight}, size={args.size}, rendering={args.rendering})")
        else:
            out = save_icon(svg, name, output_dir)
            print(f"Saved {out}")
            found += 1
    print(f"\n{found} symbol(s) saved")


def cmd_search(args: argparse.Namespace) -> None:
    cache = ensure_cache(find_act())
    output_dir = Path(args.output_dir)
    names = list_names()
    matches = [n for n in names if args.query.lower() in n.lower()]
    if not matches:
        print(f"[sf] No matches for '{args.query}'")
        return
    limited = matches[: args.count] if args.count else matches
    suffix = f"... ({len(matches)} total)" if len(matches) > 10 else ""
    print(f"[sf] {len(matches)} match(es): {', '.join(matches[:10])}{suffix}")
    total = 0
    for name in limited:
        svg = find_svg(cache, name, args.weight, args.size, args.rendering)
        if svg:
            out = save_icon(svg, name, output_dir)
            print(f"  Saved {out}")
            total += 1
    print(f"\n{total} symbol(s) saved to {output_dir}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _add_variant_args(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--weight", default=DEFAULT_WEIGHT,
        choices=["ultraLight", "thin", "light", "regular", "medium", "semibold", "bold", "heavy", "black"],
    )
    p.add_argument("--size", default=DEFAULT_SIZE, choices=["small", "medium", "large"])
    p.add_argument(
        "--rendering", default=DEFAULT_RENDERING,
        choices=["template", "hierarchical", "multicolor", "palette"],
    )
    p.add_argument("--output-dir", default=".", metavar="DIR")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch SF Symbols as SVG from the local macOS system.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Requires macOS and the 'act' CLI from Asset Catalog Tinkerer.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="List symbol names (fast, no extraction)")
    p_list.add_argument("--filter", metavar="TERM", help="Only show names containing TERM")
    p_list.set_defaults(func=cmd_list)

    p_fetch = sub.add_parser("fetch", help="Fetch symbols by exact name")
    p_fetch.add_argument("names", nargs="+")
    _add_variant_args(p_fetch)
    p_fetch.set_defaults(func=cmd_fetch)

    p_search = sub.add_parser("search", help="Search names and download matches")
    p_search.add_argument("query", help="Substring to match in symbol names")
    p_search.add_argument("--count", type=int, default=0, metavar="N", help="Max results (default: all)")
    _add_variant_args(p_search)
    p_search.set_defaults(func=cmd_search)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
