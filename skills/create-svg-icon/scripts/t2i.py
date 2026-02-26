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
"""
Text-to-image generation for icons.

Usage:
    uv run skills/create-svg-icon/scripts/t2i.py <prompt> [--model MODEL] [--output PATH] [--size SIZE] [--aspect-ratio RATIO] [--reference PATH ...]

Models:
    gpt-image-1             (default) Best for general icons, Apple/iOS style
    gpt-image-1.5           OpenAI, weaker at icons
    gemini-2.5-flash-image  Good for all icons, best at Android style
    gemini-3.1-flash-image-preview  Needs more style description in prompt

Examples:
    uv run t2i.py "a person walking a dog, ux icon, outline, simple"
    uv run t2i.py "search icon, filled" --model gemini-2.5-flash-image
    uv run t2i.py "calendar icon" --output icons/calendar.png --size 512x512
    uv run t2i.py "home icon" --model gemini-2.5-flash-image --aspect-ratio 16:9
    uv run t2i.py "walking dog icon" --reference icons/search.svg icons/home.svg

API keys:
    OpenAI models  → set OPENAI_API_KEY in your environment or .env
    Gemini models  → set GOOGLE_API_KEY in your environment or .env
"""

import argparse
import base64
import os
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv  # type: ignore
load_dotenv(find_dotenv(usecwd=True))

sys.path.insert(0, str(Path(__file__).parent))
from rasterize import render_svgs  # type: ignore  # noqa: E402

OPENAI_MODELS = {"gpt-image-1", "gpt-image-1.5"}
GEMINI_MODELS = {"gemini-2.5-flash-image", "gemini-3.1-flash-image-preview"}
MIME_BY_EXT = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def require_key(env_var: str, service: str) -> str:
    key = os.environ.get(env_var)
    if key:
        return key
    print(f"\n  {service} API key not found.")
    print(f"  Set it with:\n")
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

def generate_openai(prompt: str, model: str, size: str, references: list[tuple[bytes, str]]) -> bytes:
    from openai import OpenAI

    client = OpenAI(api_key=require_key("OPENAI_API_KEY", "OpenAI"))

    if not references:
        response = client.images.generate(
            model=model,
            prompt=prompt,
            n=1,
            size=size,
            response_format="b64_json",
        )
        return base64.b64decode(response.data[0].b64_json)

    # With references: use the responses API with image_generation tool
    content: list[dict] = [{"type": "input_text", "text": prompt}]
    for ref_bytes, mime_type in references:
        b64 = base64.b64encode(ref_bytes).decode()
        content.append({
            "type": "input_image",
            "source": {"type": "base64", "media_type": mime_type, "data": b64},
        })

    response = client.responses.create(
        model=model,
        input=[{"role": "user", "content": content}],
        tools=[{"type": "image_generation", "size": size}],
    )
    for output in response.output:
        if output.type == "image_generation_call":
            return base64.b64decode(output.result)

    print("No image returned by OpenAI. Try adjusting the prompt.")
    sys.exit(1)


def generate_gemini(prompt: str, model: str, size: str, aspect_ratio: str, references: list[tuple[bytes, str]]) -> bytes:
    from google import genai
    from google.genai import types

    img_config: dict = {"number_of_images": 1}
    if aspect_ratio:
        img_config["aspect_ratio"] = aspect_ratio
    else:
        width, height = size.split("x")
        img_config["output_image_width"] = int(width)
        img_config["output_image_height"] = int(height)

    parts = []
    for ref_bytes, mime_type in references:
        parts.append(types.Part.from_bytes(data=ref_bytes, mime_type=mime_type))
    parts.append(types.Part.from_text(prompt))

    client = genai.Client(api_key=require_key("GOOGLE_API_KEY", "Google Gemini"))
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(parts=parts, role="user")],
        config=types.GenerateContentConfig(
            response_modalities=["image", "text"],
            image_generation_config=types.ImageGenerationConfig(**img_config),
        ),
    )

    for part in response.candidates[0].content.parts:
        if part.inline_data:
            return part.inline_data.data

    print("No image returned by Gemini. Try a more descriptive prompt.")
    sys.exit(1)


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Generate an icon image.")
    parser.add_argument("prompt", help="Image generation prompt")
    parser.add_argument("--model", default="gpt-image-1")
    parser.add_argument("--output", default=None)
    parser.add_argument("--size", default="1024x1024", help="WxH, e.g. 512x512")
    parser.add_argument("--aspect-ratio", default="1:1", help="Gemini: 1:1 (default), 9:16, 16:9, 4:3, 3:4")
    parser.add_argument("--reference", nargs="+", metavar="PATH", default=[],
                        help="Reference images for style guidance (PNG, JPG, WebP, SVG). SVGs are rendered via Playwright.")
    args = parser.parse_args()

    out = Path(args.output) if args.output else Path("icon.png")
    references = load_references(args.reference) if args.reference else []

    if args.model in OPENAI_MODELS:
        image_bytes = generate_openai(args.prompt, args.model, args.size, references)
    elif args.model in GEMINI_MODELS:
        image_bytes = generate_gemini(args.prompt, args.model, args.size, args.aspect_ratio, references)
    else:
        print(f"Unknown model '{args.model}'. Choose from: {', '.join(OPENAI_MODELS | GEMINI_MODELS)}")
        sys.exit(1)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(image_bytes)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
