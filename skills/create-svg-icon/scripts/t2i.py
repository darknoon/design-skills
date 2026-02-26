#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "openai",
#   "google-genai",
#   "python-dotenv",
# ]
# ///
"""
Text-to-image generation for icons.

Usage:
    uv run skills/create-svg-icon/scripts/t2i.py <prompt> [--model MODEL] [--output PATH] [--size SIZE] [--aspect-ratio RATIO]

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

API keys:
    OpenAI models  → set OPENAI_API_KEY in your environment
    Gemini models  → set GOOGLE_API_KEY in your environment
"""

import argparse
import base64
import os
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv  # type: ignore
load_dotenv(find_dotenv(usecwd=True))

OPENAI_MODELS = {"gpt-image-1", "gpt-image-1.5"}
GEMINI_MODELS = {"gemini-2.5-flash-image", "gemini-3.1-flash-image-preview"}


def require_key(env_var: str, service: str) -> str:
    key = os.environ.get(env_var)
    if key:
        return key
    print(f"\n  {service} API key not found.")
    print(f"  Set it with:\n")
    print(f"      export {env_var}=your-key-here\n")
    print(f"  Then re-run this script.")
    sys.exit(1)


def generate_openai(prompt: str, model: str, size: str) -> bytes:
    from openai import OpenAI

    client = OpenAI(api_key=require_key("OPENAI_API_KEY", "OpenAI"))
    response = client.images.generate(
        model=model,
        prompt=prompt,
        n=1,
        size=size,
        response_format="b64_json",
    )
    return base64.b64decode(response.data[0].b64_json)


def generate_gemini(prompt: str, model: str, size: str, aspect_ratio: str | None) -> bytes:
    from google import genai
    from google.genai import types

    img_config: dict = {"number_of_images": 1}
    if aspect_ratio:
        img_config["aspect_ratio"] = aspect_ratio
    else:
        width, height = size.split("x")
        img_config["output_image_width"] = int(width)
        img_config["output_image_height"] = int(height)

    client = genai.Client(api_key=require_key("GOOGLE_API_KEY", "Google Gemini"))
    response = client.models.generate_content(
        model=model,
        contents=prompt,
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


def main():
    parser = argparse.ArgumentParser(description="Generate an icon image.")
    parser.add_argument("prompt", help="Image generation prompt")
    parser.add_argument("--model", default="gpt-image-1")
    parser.add_argument("--output", default=None)
    parser.add_argument("--size", default="1024x1024", help="WxH, e.g. 512x512")
    parser.add_argument("--aspect-ratio", default="1:1", help="Gemini only: 1:1, 9:16, 16:9, 4:3, 3:4")
    args = parser.parse_args()

    out = Path(args.output) if args.output else Path("icon.png")

    if args.model in OPENAI_MODELS:
        image_bytes = generate_openai(args.prompt, args.model, args.size)
    elif args.model in GEMINI_MODELS:
        image_bytes = generate_gemini(args.prompt, args.model, args.size, args.aspect_ratio)
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
