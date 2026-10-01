#!/usr/bin/env python3
"""Generate or edit SVGs with Arrow 2 Telos; save requests, responses and usage."""
import argparse
import base64
import json
import math
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

MODEL = "arrow-2-telos"
API = "https://api.quiver.ai/v1/svgs/"


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def validate_svg(svg):
    if not isinstance(svg, str) or "[artifact_reference:" in svg:
        raise ValueError("SVG is missing or contains an artifact reference")
    if ET.fromstring(svg).tag not in ("svg", "{http://www.w3.org/2000/svg}svg"):
        raise ValueError("Expected an SVG root element")


def build_payload(args):
    prompt = args.prompt if args.prompt is not None else args.prompt_file.read_text(encoding="utf-8")
    if not prompt.strip():
        raise ValueError("Prompt must not be empty")
    references = [{"base64": base64.b64encode(path.read_bytes()).decode()} for path in args.reference]
    payload = {"model": MODEL, "prompt": prompt, "stream": False}
    if args.reasoning_effort:
        payload["reasoning_effort"] = args.reasoning_effort
    if args.command == "generate":
        payload.update(n=args.n, references=references)
        if args.viewbox is not None:
            if not all(math.isfinite(v) for v in args.viewbox) or min(args.viewbox[2:]) <= 0:
                raise ValueError("ViewBox must be finite with positive width and height")
            payload["attributes"] = {"viewBox": dict(zip(("minX", "minY", "width", "height"), args.viewbox))}
    else:
        svg = args.svg.read_text(encoding="utf-8")
        validate_svg(svg)
        payload.update(svg=svg, reference_images=references)
    return payload


def post(args, key, summary):
    route = "generations" if args.command == "generate" else "edits"
    request = urllib.request.Request(API + route, data=(args.out / "request.json").read_bytes(), headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
    })
    try:
        response = urllib.request.urlopen(request, timeout=args.timeout)
    except urllib.error.HTTPError as error:
        response = error  # Save failed responses and their server request IDs too.
    with response:
        summary.update(http_status=response.status, request_id=response.headers.get("x-request-id"),
                       retry_after=response.headers.get("retry-after"))
        raw = response.read()
    (args.out / "response.json").write_bytes(raw)
    if not 200 <= summary["http_status"] < 300:
        raise RuntimeError(f"Quiver HTTP {summary['http_status']}; see response.json")
    return json.loads(raw)


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("generate", "edit"):
        sub = commands.add_parser(command)
        prompt = sub.add_mutually_exclusive_group(required=True)
        prompt.add_argument("--prompt")
        prompt.add_argument("--prompt-file", type=Path)
        sub.add_argument("--reference", type=Path, action="append", default=[], help="Repeat in prompt order")
        sub.add_argument("--out", type=Path, required=True, help="New output directory; refuses overwrites")
        sub.add_argument("--reasoning-effort", choices=("low", "medium", "high", "xhigh"))
        sub.add_argument("--timeout", type=float, default=1200, help="HTTP timeout in seconds; no retries")
        sub.add_argument("--dry-run", action="store_true", help="Save request without calling Quiver")
        if command == "generate":
            sub.add_argument("--n", type=int, choices=range(1, 17), default=1, metavar="1..16")
            sub.add_argument("--viewbox", nargs=4, type=float, metavar=("X", "Y", "WIDTH", "HEIGHT"),
                             help="Output coordinates via attributes.viewBox, independent of image resolution")
        else:
            sub.add_argument("--svg", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    try:
        if not math.isfinite(args.timeout) or args.timeout <= 0:
            raise ValueError("Timeout must be finite and positive")
        payload = build_payload(args)
        key = os.environ.get("QUIVERAI_API_KEY", "").strip()
        if not args.dry_run and (not key or key.startswith("op://")):
            raise ValueError("Set QUIVERAI_API_KEY in the environment")
        args.out.mkdir(parents=True, exist_ok=False)
    except (OSError, ValueError, ET.ParseError) as error:
        print(str(error), file=sys.stderr)
        return 1

    requested = args.n if args.command == "generate" else 1
    summary = {"model": MODEL, "operation": args.command, "status": "pending", "outputs": []}
    started = time.monotonic()
    try:
        write_json(args.out / "request.json", payload)
        write_json(args.out / "summary.json", summary)
        if args.dry_run:
            summary["status"] = "dry_run"
            return 0
        print(f"Calling {MODEL} {args.command}; waiting for final JSON", file=sys.stderr, flush=True)
        result = post(args, key, summary)
        documents = result["data"]
        if not isinstance(documents, list):
            raise ValueError("Expected a data array in the response")
        summary.update(usage=result.get("usage"), requested=requested, returned=len(documents), invalid_outputs=[])
        for position, document in enumerate(documents, 1):
            try:
                svg = document["svg"]
                validate_svg(svg)
            except (KeyError, TypeError, ValueError, ET.ParseError) as error:
                summary["invalid_outputs"].append({"position": position, "error": str(error)})
                continue
            target = args.out / f"option_{position}.svg"
            target.write_text(svg, encoding="utf-8")
            summary["outputs"].append(str(target.resolve()))
        complete = len(summary["outputs"]) == requested and not summary["invalid_outputs"]
        summary["status"] = "completed" if complete else "partial"
        return 0 if complete else 2
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as error:
        summary.update(status="error", error=str(error))
        return 1
    except KeyboardInterrupt:
        summary.update(status="interrupted", error="Outcome unknown; do not automatically resubmit")
        return 130
    finally:
        summary["elapsed_seconds"] = round(time.monotonic() - started, 3)
        write_json(args.out / "summary.json", summary)
        print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
