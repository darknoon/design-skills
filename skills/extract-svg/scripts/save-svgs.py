#!/usr/bin/env python3
"""
Read JSON output from extract-svgs.js (stdin) and write individual SVG files.

Usage:
  agent-browser eval --stdin < scripts/extract-svgs.js | python3 scripts/save-svgs.py [--output DIR]

Image-ref SVGs produce a stub noting the URL; use --fetch to download them
via the still-open agent-browser session.
"""

import argparse
import json
import os
import re
import sys
import html


def slugify(name):
    """Turn a name into a safe filename."""
    s = name.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s_]+', '-', s)
    return s or 'unnamed'


def ensure_xmlns(svg_text):
    """Add xmlns if missing so the SVG renders standalone."""
    if 'xmlns=' not in svg_text:
        svg_text = svg_text.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    return svg_text


def wrap_symbol(symbol_html):
    """Wrap a <symbol> in a renderable <svg>."""
    vb_match = re.search(r'viewBox=["\']([^"\']+)["\']', symbol_html)
    viewbox = vb_match.group(1) if vb_match else '0 0 24 24'
    id_match = re.search(r'id=["\']([^"\']+)["\']', symbol_html)
    sym_id = id_match.group(1) if id_match else 'sym'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}">'
        f'{symbol_html}<use href="#{sym_id}"/></svg>'
    )


def wrap_g(g_html):
    """Wrap a <g> element in a renderable <svg>."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
        f'{g_html}</svg>'
    )


def extract_img_src(img_html):
    """Pull the src URL out of an <img> tag."""
    m = re.search(r'src=["\']([^"\']+)["\']', img_html)
    return html.unescape(m.group(1)) if m else None


def main():
    parser = argparse.ArgumentParser(description='Save extracted SVGs to individual files.')
    parser.add_argument('--output', '-o', default=None,
                        help='Output directory. Defaults to .context/extracted-svg/<host>/')
    args = parser.parse_args()

    raw = sys.stdin.read().strip()
    if not raw:
        print('No input received.', file=sys.stderr)
        sys.exit(1)

    # agent-browser eval wraps the result in an extra JSON string layer
    try:
        data = json.loads(json.loads(raw))
    except (json.JSONDecodeError, TypeError):
        data = json.loads(raw)

    host = data.get('host', 'unknown')
    href = data.get('href', '')
    items = data.get('data', [])

    out_dir = args.output or os.path.join('.context', 'extracted-svg', host)
    os.makedirs(out_dir, exist_ok=True)

    saved = []
    image_refs = []

    for item in items:
        name = slugify(item['name'])
        svg_type = item['type']
        svg_text = item['svg']

        if svg_type == 'inline':
            svg_text = ensure_xmlns(svg_text)
            path = os.path.join(out_dir, f'{name}.svg')
            with open(path, 'w') as f:
                f.write(svg_text)
            saved.append((name, svg_type, path))

        elif svg_type == 'symbol':
            svg_text = wrap_symbol(svg_text)
            path = os.path.join(out_dir, f'{name}.svg')
            with open(path, 'w') as f:
                f.write(svg_text)
            saved.append((name, svg_type, path))

        elif svg_type == 'g-element':
            svg_text = wrap_g(svg_text)
            path = os.path.join(out_dir, f'{name}.svg')
            with open(path, 'w') as f:
                f.write(svg_text)
            saved.append((name, svg_type, path))

        elif svg_type == 'image-ref':
            src = extract_img_src(svg_text)
            image_refs.append((name, src))

    # Print summary
    print(f'Source: {href}')
    print(f'Output: {out_dir}')
    print(f'Saved:  {len(saved)} SVGs')
    if image_refs:
        print(f'Refs:   {len(image_refs)} image references (need fetching)')
        refs_path = os.path.join(out_dir, '_image-refs.txt')
        with open(refs_path, 'w') as f:
            for name, src in image_refs:
                f.write(f'{name}\t{src}\n')
        print(f'        Written to {refs_path}')
    print()

    for name, svg_type, path in saved:
        print(f'  {svg_type:<12} {path}')

    if image_refs:
        print()
        for name, src in image_refs:
            print(f'  image-ref  {name}: {src}')


if __name__ == '__main__':
    main()
