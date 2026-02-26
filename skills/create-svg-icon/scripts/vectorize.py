#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx",
#   "python-dotenv",
# ]
# ///
"""
Vectorize a raster image to SVG using QuiverAI.

Usage:
    uv run skills/create-svg-icon/scripts/vectorize.py <image-path> [--output PATH] [--n N] [--auto-crop] [--target-size PX]

Examples:
    uv run vectorize.py icon.png
    uv run vectorize.py icon.png --output icons/icon.svg --auto-crop
    uv run vectorize.py icon.png --n 3 --target-size 1024

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

API_URL = "https://api.quiver.ai/v1/svgs/vectorizations"
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


def vectorize(image_path: Path, n: int, auto_crop: bool, target_size: int | None) -> list[str]:
    key = require_key()
    image_b64 = base64.b64encode(image_path.read_bytes()).decode()

    body: dict = {
        "model": MODEL,
        "image": {"base64": image_b64},
        "n": n,
        "auto_crop": auto_crop,
    }
    if target_size:
        body["target_size"] = target_size

    response = httpx.post(
        API_URL,
        headers={"Authorization": f"Bearer {key}"},
        json=body,
        timeout=60,
    )
    response.raise_for_status()

    data = response.json()
    return [item["svg"] for item in data["data"]]


def main():
    parser = argparse.ArgumentParser(description="Vectorize a raster image to SVG via QuiverAI.")
    parser.add_argument("image", help="Path to the input image (PNG, JPEG, WebP)")
    parser.add_argument("--output", default=None, help="Output SVG path (default: <image-name>.svg)")
    parser.add_argument("--n", type=int, default=1, help="Number of SVG outputs (default: 1)")
    parser.add_argument("--auto-crop", action="store_true", help="Crop to subject before vectorizing")
    parser.add_argument("--target-size", type=int, default=None, help="Resize input to this pixel dimension before processing")
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"File not found: {image_path}")
        sys.exit(1)

    svgs = vectorize(image_path, args.n, args.auto_crop, args.target_size)

    if args.n == 1:
        out = Path(args.output) if args.output else image_path.with_suffix(".svg")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(svgs[0])
        print(f"Saved {out}")
    else:
        stem = image_path.stem
        out_dir = Path(args.output) if args.output else image_path.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        for i, svg in enumerate(svgs):
            out = out_dir / f"{stem}-{i + 1}.svg"
            out.write_text(svg)
            print(f"Saved {out}")


if __name__ == "__main__":
    main()
