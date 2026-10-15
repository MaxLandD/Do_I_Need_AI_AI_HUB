#!/usr/bin/env bash
# Build HOME-07 "Do I need AI for this?" end to end.
#   ./build.sh            -> output/HOME-07_DoINeedAIForThis_EN_v2.mp4 (+ SRT, thumbnail)
# Needs: python3 (numpy, scipy, pocketsphinx, tinysoundfont, pyloudnorm), node + playwright (Chromium), ffmpeg.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$HERE")"
WORK="${WORK:-$HERE/.build}"
OUT="$REPO/output"
NAME="HOME-07_DoINeedAIForThis_EN_v2"
VOICE="$(ls "$REPO"/ElevenLabs_*.mp3 | head -1)"
SF2="$WORK/GeneralUser-GS.sf2"
mkdir -p "$WORK" "$OUT"

# 1. word timings of the voice-over (pocketsphinx), then captions (SRT), cues and icon data
python3 "$HERE/tools/align_voice.py" "$VOICE"
python3 "$HERE/tools/gen_data.py"

# 2. soundtrack (GeneralUser GS v2.0.3 SoundFont, free for any music use)
[ -f "$SF2" ] || curl -sSL -o "$SF2" https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2
node "$HERE/render.js" cues "$WORK/cues.json"
python3 "$HERE/audio/build_audio.py" "$WORK/cues.json" "$VOICE" "$SF2" "$WORK/audio"

# 3. frames
rm -rf "$WORK/frames"
node "$HERE/render.js" frames "$WORK/frames" "${WORKERS:-4}"

# 4. encode: H.264 High, yuv420p, BT.709, +faststart
ffmpeg -y -v error -framerate 30 -i "$WORK/frames/f%05d.png" -i "$WORK/audio/mix.wav" \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -crf 17 -tune animation -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest \
  -metadata title="Do I need AI for this?" "$OUT/$NAME.mp4"

# 5. thumbnail: scene 7, four ticks and the lit AI slot
node "$HERE/render.js" thumb "$OUT/${NAME}_thumbnail.png" 38.6
ls -la "$OUT"
