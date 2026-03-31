#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "openai",
#   "google-genai",
#   "python-dotenv",
#   "fal-client",
#   "httpx",
# ]
# ///
"""Text-to-image generation."""

import argparse
import base64
import os
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv  # type: ignore

load_dotenv(find_dotenv(usecwd=True))

OPENAI_MODELS = {"gpt-image-1", "gpt-image-1.5", "gpt-image-1-mini"}
GEMINI_MODELS = {"gemini-2.5-flash-image", "gemini-3.1-flash-image-preview"}
FAL_MODELS = {
    "flux-2-flex": "fal-ai/flux-2-flex",
    "flux-2-pro": "fal-ai/flux-2-pro",
    "flux-2-pro-edit": "fal-ai/flux-2-pro/edit",
    "flux-1.1-pro": "fal-ai/flux-pro/v1.1",
    "flux-1.1-ultra": "fal-ai/flux-pro/v1.1-ultra",
}

# Outer orchestrator model for OpenAI's Responses API (must be a text/chat model, not image)
# The image_generation tool internally routes to the selected OPENAI_MODEL
OPENAI_ORCHESTRATOR = "gpt-4o-mini"
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
    """Load reference images. Returns (bytes, mime_type) pairs."""
    results: list[tuple[bytes, str]] = []
    for path_str in paths:
        path = Path(path_str)
        if path.suffix.lower() == ".svg":
            print(f"Skipping SVG reference (not supported): {path}")
            continue
        mime = MIME_BY_EXT.get(path.suffix.lower().lstrip("."), "image/png")
        results.append((path.read_bytes(), mime))
    return results


# --- Generation ---


def emit_partial(path: str, index: int, total: int) -> None:
    """Emit a standardized progress line for the calling agent to parse and show the user.

    Format: Progress <index>/<total> <path>
    The agent can read the image at <path> to show incremental progress.
    """
    print(f"Progress {index}/{total} {path}")


def generate_openai(
    prompt: str,
    model: str,
    size: str,
    references: list[tuple[bytes, str]],
    input_image: tuple[bytes, str] | None = None,
    orchestrator: str = OPENAI_ORCHESTRATOR,
    partial: int = 0,
    output_dir: Path | None = None,
    output_name: str = "image.png",
) -> bytes:
    from openai import OpenAI

    client = OpenAI(api_key=require_key("OPENAI_API_KEY", "OpenAI"))

    # Build instruction text
    if input_image and references:
        text = (
            "I'm attaching an image to edit, plus style reference images. "
            "Edit the image to match the style of the references with this description: "
            + prompt
        )
    elif input_image:
        text = (
            "I'm attaching an image to edit. Edit it with this description: " + prompt
        )
    elif references:
        text = (
            "I'm attaching reference images that show the target visual style. "
            "Generate a NEW image matching that style with this description: " + prompt
        )
    else:
        text = prompt

    content: list[dict] = [{"type": "input_text", "text": text}]
    if input_image:
        input_bytes, input_mime = input_image
        content.append(
            {
                "type": "input_image",
                "image_url": f"data:{input_mime};base64,{base64.b64encode(input_bytes).decode()}",
            }
        )
    for ref_bytes, mime_type in references:
        content.append(
            {
                "type": "input_image",
                "image_url": f"data:{mime_type};base64,{base64.b64encode(ref_bytes).decode()}",
            }
        )

    tool_config: dict = {
        "type": "image_generation",
        "model": model,
        "size": size,
        "quality": "low",
        "output_format": "png",
        "background": "transparent",
    }
    if partial > 0:
        tool_config["partial_images"] = min(partial, 3)

    if partial > 0:
        # Streaming mode — write partial images to the output path as they arrive,
        # so the agent/user can see progress by watching the file
        stream = client.responses.create(
            model=orchestrator,
            input=[{"role": "user", "content": content}],
            tools=[tool_config],
            tool_choice="required",
            stream=True,
        )
        final_bytes: bytes | None = None
        partial_count = 0
        partial_total = min(partial, 3)
        for event in stream:
            if event.type == "response.image_generation_call.partial_image":
                partial_count += 1
                if output_dir:
                    img_bytes = base64.b64decode(event.partial_image_b64)
                    output_path = output_dir / output_name
                    output_path.write_bytes(img_bytes)
                    emit_partial(str(output_path), partial_count, partial_total)
            elif event.type == "response.completed":
                # Final image is in the completed response output
                for out in event.response.output:
                    if out.type == "image_generation_call":
                        final_bytes = base64.b64decode(out.result)

        if final_bytes:
            return final_bytes

        print("No image returned by OpenAI (streaming mode).")
        sys.exit(1)
    else:
        # Non-streaming mode
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


def generate_fal(
    prompt: str,
    model: str,
    size: str,
    input_image: tuple[bytes, str] | None = None,
) -> bytes:
    import fal_client
    import httpx

    # SDK reads FAL_KEY; we standardize on FAL_API_KEY
    if not os.environ.get("FAL_KEY") and os.environ.get("FAL_API_KEY"):
        os.environ["FAL_KEY"] = os.environ["FAL_API_KEY"]
    require_key("FAL_API_KEY", "fal.ai")

    endpoint = FAL_MODELS[model]

    # fal.ai accepts arbitrary WxH via a dict, or named presets
    FAL_SIZE_PRESETS = {
        "square_hd",
        "square",
        "portrait_4_3",
        "portrait_16_9",
        "landscape_4_3",
        "landscape_16_9",
    }
    if size in FAL_SIZE_PRESETS:
        image_size: dict | str = size
    elif "x" in size:
        w, h = (int(x) for x in size.split("x"))
        image_size = {"width": w, "height": h}
    else:
        image_size = "square_hd"

    arguments: dict = {
        "prompt": prompt,
        "image_size": image_size,
        "output_format": "png",
        "num_images": 1,
    }

    # For edit models, pass the input image as a data URI
    if input_image and "edit" in model:
        input_bytes, input_mime = input_image
        data_uri = f"data:{input_mime};base64,{base64.b64encode(input_bytes).decode()}"
        arguments["image_url"] = data_uri

    result = fal_client.subscribe(endpoint, arguments=arguments)

    images = result.get("images", [])
    if not images:
        print("No image returned by fal.ai.")
        print(f"Response: {result}")
        sys.exit(1)

    image_url = images[0]["url"]
    response = httpx.get(image_url)
    response.raise_for_status()
    return response.content


# --- Main ---


def main():
    all_models = sorted(OPENAI_MODELS | GEMINI_MODELS | set(FAL_MODELS.keys()))

    parser = argparse.ArgumentParser(
        description="Generate an image from a text prompt.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
models:
  gpt-image-1-mini        (default) fast, transparent background
  gpt-image-1             higher quality OpenAI
  gpt-image-1.5           latest OpenAI
  gemini-2.5-flash-image  good all-around, great for Android style
  gemini-3.1-flash-image-preview  needs explicit style description
  flux-2-flex             FLUX.2 Flex via fal.ai — fast, high quality
  flux-2-pro              FLUX.2 Pro via fal.ai — best quality
  flux-2-pro-edit         FLUX.2 Pro image editing via fal.ai
  flux-1.1-pro            FLUX 1.1 Pro via fal.ai
  flux-1.1-ultra          FLUX 1.1 Ultra via fal.ai

examples:
  uv run t2i.py "a sunset over mountains" --output sunset.png
  uv run t2i.py "search icon" --model gemini-2.5-flash-image
  uv run t2i.py "a cat in a garden" --model flux-2-flex --output cat.png
  uv run t2i.py "home icon" --output icons/home.png --size 512x512
  uv run t2i.py "walking dog" --reference refs/style-a.png refs/style-b.png
  uv run t2i.py "clean up the shape" --input-image draft.png
  uv run t2i.py "refine this" --input-image draft.png --model flux-2-pro-edit

api keys (env or .env file):
  OPENAI_API_KEY   for gpt-image-* models
  GOOGLE_API_KEY   for gemini-* models
  FAL_API_KEY      for flux-* models (fal.ai)
""",
    )
    parser.add_argument("prompt", help="Image generation prompt")
    parser.add_argument("--model", default="gpt-image-1-mini")
    parser.add_argument("--output", default=None)
    parser.add_argument(
        "--size",
        default="1024x1024",
        help="OpenAI: WxH e.g. 512x512. Gemini: 512px | 1K | 2K | 4K. Fal: WxH mapped to presets",
    )
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
        help="Source image to edit (PNG, JPG, WebP). Separate from style references.",
    )
    parser.add_argument(
        "--reference",
        nargs="+",
        metavar="PATH",
        default=[],
        help="Style reference images (PNG, JPG, WebP).",
    )
    parser.add_argument(
        "--partial",
        type=int,
        default=0,
        metavar="N",
        help="Stream N partial images during generation (0-3, OpenAI only). "
        "Each partial overwrites the output file and prints 'Progress 1/N <path>' to stdout.",
    )
    args = parser.parse_args()

    out = Path(args.output) if args.output else Path("image.png")
    input_image = load_references([args.input_image])[0] if args.input_image else None
    references = load_references(args.reference) if args.reference else []

    if args.model in OPENAI_MODELS:
        out.parent.mkdir(parents=True, exist_ok=True)
        image_bytes = generate_openai(
            args.prompt,
            args.model,
            args.size,
            references,
            input_image,
            args.orchestrator,
            partial=args.partial,
            output_dir=out.parent,
            output_name=out.name,
        )
    elif args.model in GEMINI_MODELS:
        if args.partial > 0:
            print("Note: --partial is only supported for OpenAI models (ignored).")
        image_bytes = generate_gemini(
            args.prompt,
            args.model,
            args.size,
            args.aspect_ratio,
            references,
            input_image,
        )
    elif args.model in FAL_MODELS:
        if references:
            print("Note: fal.ai models don't support --reference images (ignored).")
        if args.partial > 0:
            print("Note: --partial is only supported for OpenAI models (ignored).")
        image_bytes = generate_fal(args.prompt, args.model, args.size, input_image)
    else:
        print(f"Unknown model '{args.model}'. Choose from: {', '.join(all_models)}")
        sys.exit(1)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(image_bytes)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
