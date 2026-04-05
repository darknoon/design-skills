#!/usr/bin/env bash
set -euo pipefail

# Transcribe audio files using whisper-cpp.
# Handles conversion to 16kHz WAV via ffmpeg, then runs whisper-cli.
#
# Usage: transcribe.sh <input> [--model MODEL_PATH] [--output PATH]
#
# Supports: .m4a, .mp3, .wav, .ogg, .flac, .aac, .webm, .mp4

INPUT=""
MODEL=""
OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    *) INPUT="$1"; shift ;;
  esac
done

if [[ -z "$INPUT" ]]; then
  echo "Error: no input file specified" >&2
  echo "Usage: transcribe.sh <input> [--model MODEL_PATH] [--output PATH]" >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "Error: file not found: $INPUT" >&2
  exit 1
fi

# --- Locate whisper-cli ---

if command -v whisper-cli &>/dev/null; then
  WHISPER="whisper-cli"
elif command -v whisper-cpp &>/dev/null; then
  WHISPER="whisper-cpp"
else
  echo "Error: whisper-cli not found." >&2
  echo "" >&2
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  brew install whisper-cpp" >&2
  elif command -v apt-get &>/dev/null; then
    echo "  sudo apt-get install whisper.cpp" >&2
    echo "  # or build from source: https://github.com/ggerganov/whisper.cpp" >&2
  elif command -v dnf &>/dev/null; then
    echo "  sudo dnf install whisper-cpp" >&2
  elif command -v pacman &>/dev/null; then
    echo "  yay -S whisper.cpp-git" >&2
  else
    echo "  Build from source: https://github.com/ggerganov/whisper.cpp" >&2
  fi
  exit 1
fi

# --- Locate ffmpeg ---

if ! command -v ffmpeg &>/dev/null; then
  echo "Error: ffmpeg not found." >&2
  echo "" >&2
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  brew install ffmpeg" >&2
  elif command -v apt-get &>/dev/null; then
    echo "  sudo apt-get install ffmpeg" >&2
  else
    echo "  Install ffmpeg for your platform: https://ffmpeg.org/download.html" >&2
  fi
  exit 1
fi

# --- Locate model ---

if [[ -z "$MODEL" ]]; then
  # Search common locations
  SEARCH_PATHS=(
    "$HOME/.cache/whisper-cpp/ggml-small.bin"
    "$HOME/.cache/whisper-cpp/ggml-base.bin"
    "$HOME/.cache/whisper-cpp/ggml-medium.bin"
    "$HOME/.cache/whisper-cpp/ggml-tiny.bin"
    "/usr/local/share/whisper-cpp/ggml-small.bin"
    "/usr/share/whisper-cpp/ggml-small.bin"
  )
  # Also check Homebrew prefix on macOS
  if [[ "$(uname)" == "Darwin" ]] && command -v brew &>/dev/null; then
    PREFIX="$(brew --prefix whisper-cpp 2>/dev/null || true)"
    if [[ -n "$PREFIX" ]]; then
      SEARCH_PATHS+=("$PREFIX/share/whisper-cpp/for-tests-ggml-tiny.bin")
    fi
  fi

  for p in "${SEARCH_PATHS[@]}"; do
    if [[ -f "$p" ]]; then
      MODEL="$p"
      break
    fi
  done

  if [[ -z "$MODEL" ]]; then
    echo "Error: no whisper model found. Download one:" >&2
    echo "" >&2
    echo "  mkdir -p ~/.cache/whisper-cpp" >&2
    echo "  curl -L -o ~/.cache/whisper-cpp/ggml-small.bin \\" >&2
    echo "    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" >&2
    exit 1
  fi
fi

echo "Using model: $MODEL" >&2

# --- Convert to 16kHz WAV ---

TMPWAV="$(mktemp /tmp/transcribe-XXXXXX.wav)"
trap 'rm -f "$TMPWAV"' EXIT

echo "Converting to 16kHz WAV..." >&2
ffmpeg -i "$INPUT" -ar 16000 -ac 1 -c:a pcm_s16le "$TMPWAV" -y -loglevel warning

# --- Transcribe ---

echo "Transcribing..." >&2
TRANSCRIPT=$("$WHISPER" -m "$MODEL" -f "$TMPWAV" --no-timestamps 2>/dev/null)

if [[ -n "$OUTPUT" ]]; then
  echo "$TRANSCRIPT" > "$OUTPUT"
  echo "Saved to: $OUTPUT" >&2
else
  echo "$TRANSCRIPT"
fi
