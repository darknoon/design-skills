#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx",
#   "python-dotenv",
# ]
# ///
"""
Generate SVG directly from a text prompt using QuiverAI.

Usage:
    uv run skills/create-svg-icon/scripts/t2svg.py "<prompt>" [options]

Examples:
    uv run t2svg.py "minimal home icon, single stroke weight, rounded caps"
    uv run t2svg.py "arrow pointing right" --output icons/arrow.svg
    uv run t2svg.py "shopping cart icon" --reference refs/style-a.png refs/style-b.png
    uv run t2svg.py "simplify this icon" --reference iteration-01/icon.png --n 3
    uv run t2svg.py "lock icon, match this style" --instructions "Use consistent 1.5px strokes, rounded line caps"

API key:
    Set QUIVER_API_KEY in your environment:
        export QUIVER_API_KEY=your-key-here
"""

import argparse
import base64
import os
import sys
from pathlib import Path

import httpx
from dotenv import find_dotenv, load_dotenv  # type: ignore

load_dotenv(find_dotenv(usecwd=True))

API_URL = "https://api.quiver.ai/v1/svgs/generations"
MODEL = "arrow-preview"


def require_key() -> str:
    key = os.environ.get("QUIVER_API_KEY")
    if key:
        return key
    print("\n  Quiver API key not found.")
    print("  Set it with:\n")
    print("      export QUIVER_API_KEY=your-key-here\n")
    print("  Get a key at https://quiver.ai")
    sys.exit(1)


def load_reference(path: Path) -> dict:
    """Load an image file as a base64 reference object."""
    b64 = base64.b64encode(path.read_bytes()).decode()
    return {"base64": b64}


def generate_svg(
    prompt: str,
    instructions: str | None,
    references: list[Path],
    n: int,
    temperature: float | None,
) -> list[str]:
    key = require_key()

    body: dict = {
        "model": MODEL,
        "prompt": prompt,
        "n": n,
    }
    if instructions:
        body["instructions"] = instructions
    if temperature is not None:
        body["temperature"] = temperature
    if references:
        body["references"] = [load_reference(p) for p in references[:4]]

    response = httpx.post(
        API_URL,
        headers={"Authorization": f"Bearer {key}"},
        json=body,
        timeout=120,
    )
    response.raise_for_status()

    data = response.json()
    return [item["svg"] for item in data["data"]]


def main():
    parser = argparse.ArgumentParser(
        description="Generate SVG from a text prompt via QuiverAI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  uv run t2svg.py "home icon, rounded, 1.5px stroke"
  uv run t2svg.py "chevron right" --output icons/chevron.svg
  uv run t2svg.py "lock icon" --reference refs/style-a.png --n 3
  uv run t2svg.py "simplify" --reference iteration-01/concept.png
  uv run t2svg.py "cart icon" --instructions "Consistent 1.5px strokes, rounded caps"

api key (env or .env file):
  QUIVER_API_KEY   from https://quiver.ai
""",
    )
    parser.add_argument("prompt", help="Text prompt describing the desired SVG")
    parser.add_argument("--output", default=None, help="Output SVG path (default: icon.svg)")
    parser.add_argument("--instructions", default=None, help="Additional style/formatting guidance")
    parser.add_argument(
        "--reference",
        nargs="+",
        metavar="PATH",
        default=[],
        help="Up to 4 reference images (PNG, JPG, WebP) to guide style",
    )
    parser.add_argument("--n", type=int, default=1, help="Number of SVG outputs (1-16, default: 1)")
    parser.add_argument("--temperature", type=float, default=None, help="Sampling temperature (0-2)")
    args = parser.parse_args()

    refs = [Path(p) for p in args.reference]
    for r in refs:
        if not r.exists():
            print(f"Reference not found: {r}")
            sys.exit(1)

    svgs = generate_svg(args.prompt, args.instructions, refs, args.n, args.temperature)

    out_base = Path(args.output) if args.output else Path("icon.svg")
    if args.n == 1:
        out_base.parent.mkdir(parents=True, exist_ok=True)
        out_base.write_text(svgs[0])
        print(f"Saved {out_base}")
    else:
        stem = out_base.stem
        out_dir = out_base.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        for i, svg in enumerate(svgs):
            out = out_dir / f"{stem}-{i + 1}.svg"
            out.write_text(svg)
            print(f"Saved {out}")


if __name__ == "__main__":
    main()
