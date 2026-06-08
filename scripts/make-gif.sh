#!/usr/bin/env bash
# Turn the recorded take.webm into an optimized GIF (+ an h264 mp4 for long-form
# sharing) using the 2-pass palettegen/paletteuse pipeline.
#
# Usage: scripts/make-gif.sh <input.webm> [out_dir]
set -euo pipefail

IN="${1:?usage: make-gif.sh <input.webm> [out_dir]}"
OUT_DIR="${2:-docs}"
FPS="${FPS:-12}"
WIDTH="${WIDTH:-1200}"

PALETTE="$(mktemp -u).png"
GIF="${OUT_DIR}/demo.gif"
MP4="${OUT_DIR}/demo.mp4"

mkdir -p "$OUT_DIR"

echo "[gif] palettegen ($FPS fps, ${WIDTH}px)"
ffmpeg -y -i "$IN" \
  -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$PALETTE"

echo "[gif] paletteuse -> $GIF"
ffmpeg -y -i "$IN" -i "$PALETTE" \
  -lavfi "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
  "$GIF"

echo "[gif] h264 -> $MP4"
ffmpeg -y -i "$IN" -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart "$MP4"

rm -f "$PALETTE"
echo "[gif] done: $GIF ($(du -h "$GIF" | cut -f1)), $MP4 ($(du -h "$MP4" | cut -f1))"
