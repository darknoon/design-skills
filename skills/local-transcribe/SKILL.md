---
name: local-transcribe
description: Transcribe audio files (m4a, mp3, wav, ogg, flac, aac, webm, mp4) to text using local whisper-cpp (offline, no API). Use when asked to transcribe locally, convert speech to text offline, or process audio recordings without sending data externally. Converts to 16kHz WAV via ffmpeg, then runs whisper-cli locally. Does not do speaker diarization or advanced transcription.
argument-hint: "<audio-file> [--output PATH] [--model MODEL_PATH]"
allowed-tools: Read, Write, Edit, Glob, Bash(skills/local-transcribe/scripts/transcribe.sh *), Bash(chmod +x *)
---

# Audio Transcription

Transcribe audio files to text using `whisper-cpp` (local, offline).

## Script location

```
skills/local-transcribe/scripts/transcribe.sh
```

## Basic usage

```bash
skills/local-transcribe/scripts/transcribe.sh "<audio-file>"
```

The transcript is printed to stdout. Use `--output` to save to a file instead.

## Options

- `--output PATH` — save transcript to a file instead of stdout
- `--model PATH` — path to a whisper.cpp GGML model file (auto-detected if omitted)

## Examples

```bash
# Transcribe and print to stdout
skills/local-transcribe/scripts/transcribe.sh recording.m4a

# Transcribe and save to file
skills/local-transcribe/scripts/transcribe.sh recording.m4a --output transcript.txt

# Use a specific model
skills/local-transcribe/scripts/transcribe.sh recording.m4a --model ~/.cache/whisper-cpp/ggml-medium.bin
```

## Supported formats

Any format ffmpeg can decode: `.m4a`, `.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.webm`, `.mp4`

## Dependencies

- **whisper-cpp** — the transcription engine
  - macOS: `brew install whisper-cpp`
  - Linux (apt): `sudo apt-get install whisper.cpp`
  - Linux (arch): `yay -S whisper.cpp-git`
  - From source: https://github.com/ggerganov/whisper.cpp
- **ffmpeg** — for audio format conversion
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt-get install ffmpeg`
- **A GGML model file** — auto-detected in `~/.cache/whisper-cpp/`, or specify with `--model`
  - Download: `curl -L -o ~/.cache/whisper-cpp/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`

## Models

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| `ggml-tiny.bin` | 75 MB | Fastest | Lower accuracy |
| `ggml-base.bin` | 142 MB | Fast | Decent |
| `ggml-small.bin` | 466 MB | Moderate | Good (recommended) |
| `ggml-medium.bin` | 1.5 GB | Slower | Better |
| `ggml-large.bin` | 3.1 GB | Slowest | Best |

The script searches `~/.cache/whisper-cpp/` for models automatically, preferring `small` > `base` > `medium` > `tiny`.

## After transcribing

The raw transcript is plain text. You can then:
- Clean it up (remove filler words, fix punctuation)
- Add it to a markdown note
- Use it as input for further processing
