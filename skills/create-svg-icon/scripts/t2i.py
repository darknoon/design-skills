#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "openai",
#   "google-genai",
#   "python-dotenv",
#   "playwright",
# ]
# ///
"""Text-to-image generation for icons."""

import argparse
import base64
import os
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv  # type: ignore

load_dotenv(find_dotenv(usecwd=True))

sys.path.insert(0, str(Path(__file__).parent))
from rasterize import render_svgs  # type: ignore  # noqa: E402

OPENAI_MODELS = {"gpt-image-1", "gpt-image-1.5", "gpt-image-1-mini", "gpt-image-2"}
GEMINI_MODELS = {"gemini-2.5-flash-image", "gemini-3.1-flash-image-preview"}

# Outer orchestrator model for OpenAI's Responses API (must be a text/chat model, not image)
# The image_generation tool internally routes to the selected OPENAI_MODEL
OPENAI_ORCHESTRATOR = "gpt-4o"
MIME_BY_EXT = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


def require_key(env_var: str, service: str) -> str:
    key = os.environ.get(env_var)
    if key:
        return key
    print(f"\n  {service} API key not found.")
    print("  Set it with:\n")
    print(f"      export {env_var}=your-key-here\n")
    print("  Or add it to a .env file in your project root.")
    sys.exit(1)


# --- Reference image loading ---


def load_references(paths: list[str]) -> list[tuple[bytes, str]]:
    """Load reference images, rendering SVGs to PNG via Playwright. Returns (bytes, mime_type) pairs."""
    svg_indices = [i for i, p in enumerate(paths) if Path(p).suffix.lower() == ".svg"]
    results: list[tuple[bytes, str] | None] = [None] * len(paths)

    if svg_indices:
        rendered = render_svgs([paths[i] for i in svg_indices])
        for list_pos, original_index in enumerate(svg_indices):
            results[original_index] = (rendered[list_pos], "image/png")

    for i, path_str in enumerate(paths):
        if results[i] is None:
            path = Path(path_str)
            mime = MIME_BY_EXT.get(path.suffix.lower().lstrip("."), "image/png")
            results[i] = (path.read_bytes(), mime)

    return results  # type: ignore


# --- Generation ---


def generate_openai(
    prompt: str,
    model: str,
    size: str,
    references: list[tuple[bytes, str]],
    input_image: tuple[bytes, str] | None = None,
    orchestrator: str = OPENAI_ORCHESTRATOR,
    background: str = "auto",
    quality: str = "auto",
) -> bytes:
    from openai import OpenAI

    client = OpenAI(api_key=require_key("OPENAI_API_KEY", "OpenAI"))

    content: list[dict] = [{"type": "input_text", "text": prompt}]
    if input_image:
        input_bytes, input_mime = input_image
        content.append({
            "type": "input_image",
            "image_url": f"data:{input_mime};base64,{base64.b64encode(input_bytes).decode()}",
        })
    for ref_bytes, mime_type in references:
        content.append({
            "type": "input_image",
            "image_url": f"data:{mime_type};base64,{base64.b64encode(ref_bytes).decode()}",
        })

    tool_config: dict = {
        "type": "image_generation",
        "model": model,
        "size": size,
        "quality": quality,
        "output_format": "png",
    }
    if background != "auto":
        tool_config["background"] = background

    response = client.responses.create(
        model=orchestrator,
        input=[{"role": "user", "content": content}],
        tools=[tool_config],
        tool_choice="required",
    )
    for output in response.output:
        if output.type == "image_generation_call":
            return base64.b64decode(output.result)

    print("No image returned by OpenAI. Model output:")
    for output in response.output:
        print(f"  type={output.type}: {output}")
    sys.exit(1)


def generate_gemini(
    prompt: str,
    model: str,
    size: str,
    aspect_ratio: str,
    references: list[tuple[bytes, str]],
    input_image: tuple[bytes, str] | None = None,
) -> bytes:
    from google import genai
    from google.genai import types

    GEMINI_IMAGE_SIZES = {"512px", "1K", "2K", "4K"}
    image_size = size if size in GEMINI_IMAGE_SIZES else None
    image_config = types.ImageConfig(
        aspect_ratio=aspect_ratio or None,
        image_size=image_size,
    )

    parts = []
    if input_image:
        input_bytes, input_mime = input_image
        parts.append(types.Part.from_bytes(data=input_bytes, mime_type=input_mime))
    for ref_bytes, mime_type in references:
        parts.append(types.Part.from_bytes(data=ref_bytes, mime_type=mime_type))
    parts.append(types.Part.from_text(text=prompt))

    client = genai.Client(api_key=require_key("GOOGLE_API_KEY", "Google Gemini"))
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(parts=parts, role="user")],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=image_config,
        ),
    )

    for part in response.candidates[0].content.parts:
        if part.inline_data:
            return part.inline_data.data

    print("No image returned by Gemini. Try a more descriptive prompt.")
    sys.exit(1)


# --- Main ---


def main():
    parser = argparse.ArgumentParser(
        description="Generate an icon image from a text prompt.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
models:
  gpt-image-1-mini        (default) fast, transparent background
  gpt-image-1             higher quality OpenAI
  gpt-image-2             latest OpenAI
  gemini-2.5-flash-image  good for all icons, best at Android style
  gemini-3.1-flash-image-preview  needs explicit style description

examples:
  uv run t2i.py "water bottle icon, outline, simple"
  uv run t2i.py "search icon" --model gemini-2.5-flash-image
  uv run t2i.py "home icon" --output icons/home.png --size 512x512
  uv run t2i.py "walking dog icon" --reference icons/search.svg icons/home.svg
  uv run t2i.py "clean up the shape" --input-image iteration-01/icon.png
  uv run t2i.py "simplify, match this style" --input-image iter-01/icon.png --reference refs/style-a.png refs/style-b.png
  uv run t2i.py "icon" --orchestrator gpt-5.2

api keys (env or .env file):
  OPENAI_API_KEY   for gpt-image-* models
  GOOGLE_API_KEY   for gemini-* models
""",
    )
    parser.add_argument("prompt", help="Image generation prompt")
    parser.add_argument("--model", default="gpt-image-1-mini")
    parser.add_argument("--output", default=None)
    parser.add_argument("--size", default="1024x1024",
                        help="OpenAI: WxH e.g. 512x512. Gemini: 512px | 1K | 2K | 4K (ignored if not a valid Gemini size)")
    parser.add_argument(
        "--aspect-ratio",
        default="1:1",
        help="Gemini: 1:1 (default), 9:16, 16:9, 4:3, 3:4",
    )
    parser.add_argument(
        "--orchestrator",
        default=OPENAI_ORCHESTRATOR,
        help=f"OpenAI orchestrator model (default: {OPENAI_ORCHESTRATOR}, try gpt-5.2 if deprecated)",
    )
    parser.add_argument(
        "--input-image",
        metavar="PATH",
        default=None,
        help="Source image to edit (PNG, JPG, WebP, SVG). Separate from style references.",
    )
    parser.add_argument(
        "--reference",
        nargs="+",
        metavar="PATH",
        default=[],
        help="Style reference images (PNG, JPG, WebP, SVG). SVGs are rendered via Playwright.",
    )
    parser.add_argument(
        "--background",
        choices=["auto", "transparent", "opaque"],
        default="auto",
        help="OpenAI only: 'auto' (default, model picks), 'transparent', or 'opaque'. "
        "Only gpt-image-1.x models support 'transparent'; gpt-image-2+ will error.",
    )
    parser.add_argument(
        "--quality",
        choices=["auto", "low", "medium", "high"],
        default="auto",
        help="OpenAI only: 'auto' (default), 'low', 'medium', 'high'. "
        "Controls cost and fidelity — use 'low' for cheap iteration, 'high' for evals/finals.",
    )
    args = parser.parse_args()

    out = Path(args.output) if args.output else Path("icon.png")
    input_image = load_references([args.input_image])[0] if args.input_image else None
    references = load_references(args.reference) if args.reference else []

    if args.model in OPENAI_MODELS:
        image_bytes = generate_openai(
            args.prompt, args.model, args.size, references, input_image, args.orchestrator,
            background=args.background,
            quality=args.quality,
        )
    elif args.model in GEMINI_MODELS:
        image_bytes = generate_gemini(
            args.prompt, args.model, args.size, args.aspect_ratio, references, input_image
        )
    else:
        print(
            f"Unknown model '{args.model}'. Choose from: {', '.join(OPENAI_MODELS | GEMINI_MODELS)}"
        )
        sys.exit(1)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(image_bytes)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
