#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
"""
Fetch SVG icons from popular icon sets.

Subcommands:
    list    Print all icon names in a set (redirect to file if needed)
    fetch   Fetch specific icon(s) by exact name
    search  Search names and download all matches

Usage:
    # List all icons in a set — pipe or redirect as needed
    uv run get-icon.py list lucide
    uv run get-icon.py list lucide --filter globe    # filter by substring
    uv run get-icon.py list lucide > lucide-names.txt

    # Fetch specific icons by exact name
    uv run get-icon.py fetch lucide search
    uv run get-icon.py fetch heroicons magnifying-glass
    uv run get-icon.py fetch lucide search chevron-right home
    uv run get-icon.py fetch lucide search --output-dir .context/icon_skill/refs/

    # Search: find names containing a term and download matches
    uv run get-icon.py search lucide globe
    uv run get-icon.py search lucide globe --count 3
    uv run get-icon.py search lucide,heroicons,tabler globe --count 3

Sets: lucide, heroicons, tabler, feather, phosphor, radix
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SETS: dict[str, dict] = {
    "lucide": {
        "raw": "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/{name}.svg",
        "owner": "lucide-icons", "repo": "lucide", "branch": "main", "path": "icons",
    },
    "heroicons": {
        "raw": "https://raw.githubusercontent.com/tailwindlabs/heroicons/master/src/24/outline/{name}.svg",
        "owner": "tailwindlabs", "repo": "heroicons", "branch": "master", "path": "src/24/outline",
    },
    "tabler": {
        "raw": "https://raw.githubusercontent.com/tabler/tabler-icons/master/icons/outline/{name}.svg",
        "owner": "tabler", "repo": "tabler-icons", "branch": "master", "path": "icons/outline",
    },
    "feather": {
        "raw": "https://raw.githubusercontent.com/feathericons/feather/master/icons/{name}.svg",
        "owner": "feathericons", "repo": "feather", "branch": "master", "path": "icons",
    },
    "phosphor": {
        "raw": "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/regular/{name}.svg",
        "owner": "phosphor-icons", "repo": "core", "branch": "main", "path": "assets/regular",
    },
    "radix": {
        "raw": "https://raw.githubusercontent.com/radix-ui/icons/master/packages/radix-icons/icons/{name}.svg",
        "owner": "radix-ui", "repo": "icons", "branch": "master", "path": "packages/radix-icons/icons",
    },
}

ALL_SET_NAMES = list(SETS.keys())
_listing_cache: dict[str, list[str]] = {}


def fetch_svg(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(url) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def list_icons(set_name: str) -> list[str]:
    """Return sorted icon names via GitHub Trees API (cached per session)."""
    if set_name in _listing_cache:
        return _listing_cache[set_name]

    s = SETS[set_name]
    api = (
        f"https://api.github.com/repos/{s['owner']}/{s['repo']}"
        f"/git/trees/{s['branch']}?recursive=1"
    )
    req = urllib.request.Request(api, headers={"Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"[{set_name}] GitHub API error {e.code}", file=sys.stderr)
        return []

    prefix = s["path"].rstrip("/") + "/"
    names = sorted(
        p[len(prefix):-4]
        for item in data.get("tree", [])
        if (p := item.get("path", ""))
        and item.get("type") == "blob"
        and p.startswith(prefix)
        and p.endswith(".svg")
        and "/" not in p[len(prefix):]
    )

    if data.get("truncated"):
        print(f"[{set_name}] Warning: listing truncated by GitHub", file=sys.stderr)

    _listing_cache[set_name] = names
    return names


def fetch_icon(set_name: str, name: str) -> bytes | None:
    return fetch_svg(SETS[set_name]["raw"].format(name=name))


def save_icon(svg: bytes, set_name: str, name: str, output_dir: Path) -> Path:
    out = output_dir / f"{set_name}-{name}.svg"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(svg)
    return out


def parse_sets(raw: str) -> list[str]:
    names = [s.strip() for s in raw.split(",") if s.strip()]
    if unknown := [n for n in names if n not in SETS]:
        print(f"Unknown set(s): {', '.join(unknown)}. Available: {', '.join(ALL_SET_NAMES)}")
        sys.exit(1)
    return names


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def cmd_list(args: argparse.Namespace) -> None:
    for set_name in parse_sets(args.set):
        names = list_icons(set_name)
        if args.filter:
            names = [n for n in names if args.filter.lower() in n.lower()]
        for name in names:
            print(name)


def cmd_fetch(args: argparse.Namespace) -> None:
    output_dir = Path(args.output_dir)
    found = 0
    for set_name in parse_sets(args.set):
        for name in args.names:
            svg = fetch_icon(set_name, name)
            if svg is None:
                print(f"[{set_name}] '{name}' not found")
            else:
                out = save_icon(svg, set_name, name, output_dir)
                print(f"Saved {out}")
                found += 1
    print(f"\n{found} icon(s) saved")


def cmd_search(args: argparse.Namespace) -> None:
    output_dir = Path(args.output_dir)
    total = 0
    for set_name in parse_sets(args.set):
        names = list_icons(set_name)
        matches = [n for n in names if args.query.lower() in n.lower()]
        if not matches:
            print(f"[{set_name}] No matches for '{args.query}'")
            continue
        limited = matches[:args.count] if args.count else matches
        suffix = f"... ({len(matches)} total)" if len(matches) > 10 else ""
        print(f"[{set_name}] {len(matches)} match(es): {', '.join(matches[:10])}{suffix}")
        for name in limited:
            if svg := fetch_icon(set_name, name):
                out = save_icon(svg, set_name, name, output_dir)
                print(f"  Saved {out}")
                total += 1
    print(f"\n{total} icon(s) saved to {output_dir}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch SVG icons from popular icon sets.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Available sets: {', '.join(ALL_SET_NAMES)}",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="List icon names in a set")
    p_list.add_argument("set", help="Set name")
    p_list.add_argument("--filter", metavar="TERM", help="Only show names containing TERM")
    p_list.set_defaults(func=cmd_list)

    p_fetch = sub.add_parser("fetch", help="Fetch icons by exact name")
    p_fetch.add_argument("set", help="Set name(s), comma-separated")
    p_fetch.add_argument("names", nargs="+")
    p_fetch.add_argument("--output-dir", default=".", metavar="DIR")
    p_fetch.set_defaults(func=cmd_fetch)

    p_search = sub.add_parser("search", help="Search names and download matches")
    p_search.add_argument("set", help="Set name(s), comma-separated")
    p_search.add_argument("query", help="Substring to match in icon names")
    p_search.add_argument("--count", type=int, default=0, metavar="N", help="Max per set (default: all)")
    p_search.add_argument("--output-dir", default=".", metavar="DIR")
    p_search.set_defaults(func=cmd_search)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
