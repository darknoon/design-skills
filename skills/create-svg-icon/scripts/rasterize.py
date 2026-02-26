#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "playwright",
# ]
# ///
"""
Render SVG files to PNG using the first available Playwright browser.

Usage (standalone):
    uv run skills/create-svg-icon/scripts/rasterize.py <file.svg> [file2.svg ...] [--size WxH] [--output-dir DIR]

Examples:
    uv run rasterize.py icons/search.svg
    uv run rasterize.py icons/*.svg --output-dir rendered/
    uv run rasterize.py icon.svg --size 256x256

Importable:
    import sys; sys.path.insert(0, "skills/create-svg-icon/scripts")
    from rasterize import render_svgs, render_svg
"""

import sys
from pathlib import Path


def _get_browser(playwright, size: tuple[int, int]):
    """Launch the first available Playwright browser and return (browser, browser_name)."""
    for name in ["chromium", "firefox", "webkit"]:
        try:
            browser = getattr(playwright, name).launch()
            return browser, name
        except Exception:
            continue
    print("No Playwright browser found. Install one:\n  playwright install chromium")
    sys.exit(1)


def render_svgs(svg_paths: list[str | Path], size: tuple[int, int] = (512, 512)) -> list[bytes]:
    """Render a list of SVG files to PNG bytes. Reuses a single browser session."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError:
        print("playwright not installed. Run: playwright install chromium")
        sys.exit(1)

    paths = [Path(p) for p in svg_paths]

    with sync_playwright() as p:
        browser, browser_name = _get_browser(p, size)
        print(f"Using {browser_name} to render {len(paths)} SVG(s)")

        results = []
        for svg_path in paths:
            page = browser.new_page(viewport={"width": size[0], "height": size[1]})
            page.set_content(
                f'<!DOCTYPE html><html><body style="margin:0;padding:0;background:white">'
                f'{svg_path.read_text()}</body></html>'
            )
            png = page.locator("svg").first.screenshot()
            page.close()
            results.append(png)

        browser.close()
        return results


def render_svg(svg_path: str | Path, size: tuple[int, int] = (512, 512)) -> bytes:
    """Render a single SVG file to PNG bytes."""
    return render_svgs([svg_path], size)[0]


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Render SVG files to PNG.")
    parser.add_argument("inputs", nargs="+", metavar="FILE", help="SVG file(s) to render")
    parser.add_argument("--size", default="1024x1024", help="Output size WxH (default: 1024x1024)")
    parser.add_argument("--output-dir", default=None, help="Directory to write PNGs (default: same as input)")
    args = parser.parse_args()

    w, h = (int(x) for x in args.size.split("x"))
    png_bytes_list = render_svgs(args.inputs, size=(w, h))

    for svg_path_str, png_bytes in zip(args.inputs, png_bytes_list):
        svg_path = Path(svg_path_str)
        out_dir = Path(args.output_dir) if args.output_dir else svg_path.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / svg_path.with_suffix(".png").name
        out.write_bytes(png_bytes)
        print(f"Saved {out}")
