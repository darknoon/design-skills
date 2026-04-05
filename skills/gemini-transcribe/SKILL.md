---
name: gemini-transcribe
description: Transcribe audio files using the Gemini API with an optional custom prompt. Use when asked to transcribe speech, diarize audio, extract meeting notes, summarize recordings, or process audio with specific instructions. Supports any Gemini model that accepts audio input. Default behavior is speaker-diarized transcription; pass a custom prompt to change the output format or task.
argument-hint: "<audio-file> [--model MODEL] [--prompt PROMPT]"
allowed-tools: Read, Write, Edit, Glob, Bash(python3 skills/gemini-transcribe/scripts/gemini_transcribe.py *), Bash(ffmpeg *)
---

# Gemini Audio Transcription

Transcribe audio with speaker diarization via the Gemini API. Zero dependencies beyond Python 3 stdlib.

## Script location

```
skills/gemini-transcribe/scripts/gemini_transcribe.py
```

## Basic usage

```bash
python3 skills/gemini-transcribe/scripts/gemini_transcribe.py <audio-file> [--model MODEL] [--prompt PROMPT]
```

Transcript is printed to stdout. Redirect to save.

## Examples

```bash
# Default (gemini-2.5-flash, diarized transcription)
python3 skills/gemini-transcribe/scripts/gemini_transcribe.py recording.m4a

# Custom prompt
python3 skills/gemini-transcribe/scripts/gemini_transcribe.py recording.m4a --prompt "List every action item mentioned in this meeting."

# Gemini 3 Flash
python3 skills/gemini-transcribe/scripts/gemini_transcribe.py recording.m4a --model gemini-3-flash-preview

# Gemini 3.1 Flash Lite (cheapest)
python3 skills/gemini-transcribe/scripts/gemini_transcribe.py recording.m4a --model gemini-3.1-flash-lite-preview

# Save to file
python3 skills/gemini-transcribe/scripts/gemini_transcribe.py recording.m4a > transcript.md
```

## Supported formats

Any format Gemini accepts: `.m4a`, `.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`

For large files (>20MB), compress first:
```bash
ffmpeg -i input.wav -ar 16000 -ac 1 -c:a libopus -b:a 32k output.ogg -y
```

## Available models

| Model | Notes |
|-------|-------|
| `gemini-2.5-flash` | Default, good quality |
| `gemini-3-flash-preview` | Latest gen |
| `gemini-3.1-flash-lite-preview` | Cheapest, fast |

## Environment

`GOOGLE_API_KEY` must be set. Get one from https://aistudio.google.com/apikey
