#!/usr/bin/env python3
"""Transcribe audio with speaker diarization via Gemini API."""

import base64, json, urllib.request, os, sys

DEFAULT_PROMPT = "Transcribe this audio with speaker diarization. Identify and label each distinct speaker. Use names if you can infer them from context, otherwise use Speaker 1, Speaker 2, etc. Output clean readable text with speaker labels before each turn of dialogue."

def transcribe(audio_path, model="gemini-2.5-flash", prompt=None, api_key=None):
    if not api_key:
        api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GOOGLE_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    if not prompt:
        prompt = DEFAULT_PROMPT

    print(f"Reading {audio_path}...", file=sys.stderr)
    with open(audio_path, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode()

    ext = os.path.splitext(audio_path)[1].lower()
    mime_map = {".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4",
                ".mp3": "audio/mpeg", ".flac": "audio/flac", ".aac": "audio/aac"}
    mime = mime_map.get(ext, "audio/ogg")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    body = json.dumps({
        "contents": [{"parts": [
            {"inline_data": {"mime_type": mime, "data": audio_b64}},
            {"text": prompt}
        ]}]
    }).encode()

    print(f"Calling {model}...", file=sys.stderr)
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=300)
    result = json.loads(resp.read())
    return result["candidates"][0]["content"]["parts"][0]["text"]

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Transcribe audio via Gemini API")
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--model", default="gemini-2.5-flash", help="Gemini model to use")
    parser.add_argument("--prompt", default=None, help="Custom prompt (default: diarized transcription)")
    args = parser.parse_args()
    print(transcribe(args.audio, args.model, args.prompt))
