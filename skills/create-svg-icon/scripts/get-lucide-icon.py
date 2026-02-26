#!/usr/bin/env python3
"""
Fetch a Lucide icon SVG by name and save it to a file.

Usage:
    python get-lucide-icon.py <icon-name> [output-path]

Examples:
    python get-lucide-icon.py search
    python get-lucide-icon.py chevron-right
    python get-lucide-icon.py arrow-up-right icons/arrow-up-right.svg
"""

import sys
import urllib.request
import urllib.error
from pathlib import Path


def get_lucide_icon(name: str) -> str:
    url = f"https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/{name}.svg"
    try:
        with urllib.request.urlopen(url) as response:
            return response.read().decode()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(
                f"Icon '{name}' not found. Check the name at https://lucide.dev/icons",
                file=sys.stderr,
            )
        else:
            print(f"HTTP error {e.code} fetching icon '{name}'", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    name = sys.argv[1]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(f"{name}.svg")

    svg = get_lucide_icon(name)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg)
    print(f"Saved {out}")
