#!/usr/bin/env bash
# Encodes rendered frames + the song into the final reel files.
# usage: tools/reel/encode.sh <frames_dir> <fps> <out_basename>
#   -> <out>-4k.mp4         2160x3840 master (H.264 High, CRF 16)
#   -> <out>-instagram.mp4  1080x1920, ready to upload to Reels
#   -> <out>-cover.jpg      1080x1920 cover image
set -euo pipefail
FRAMES=${1:?frames dir}; FPS=${2:-60}; OUT=${3:?out basename}
cd "$(dirname "$0")/../.."
N=$(ls "$FRAMES"/f*.jpg | wc -l)
DUR=$(python3 -c "print(f'{$N/$FPS:.3f}')")
FADE_OUT=$(python3 -c "print(f'{$N/$FPS-3.2:.3f}')")
mkdir -p "$(dirname "$OUT")"
# song: fade in 1s, fade out over the last 3.2s, levelled to -14 LUFS (Instagram's loudness)
AUDIO="afade=t=in:st=0:d=1.0,afade=t=out:st=$FADE_OUT:d=3.2,loudnorm=I=-14:TP=-1.5:LRA=11"
echo "frames=$N duration=${DUR}s"

ffmpeg -y -hide_banner -loglevel warning -stats \
  -framerate "$FPS" -i "$FRAMES/f%05d.jpg" -i assets/music.mp3 \
  -map 0:v -map 1:a -t "$DUR" \
  -c:v libx264 -preset slow -crf 16 -profile:v high -level 5.2 -pix_fmt yuv420p \
  -x264-params "keyint=$((FPS*2)):min-keyint=$FPS" \
  -af "$AUDIO" -c:a aac -b:a 256k -ar 48000 \
  -movflags +faststart "$OUT-4k.mp4"

ffmpeg -y -hide_banner -loglevel warning -stats \
  -i "$OUT-4k.mp4" \
  -vf "scale=1080:1920:flags=lanczos" \
  -c:v libx264 -preset slow -crf 17 -maxrate 25M -bufsize 50M -profile:v high -level 4.2 -pix_fmt yuv420p \
  -c:a copy -movflags +faststart "$OUT-instagram.mp4"

# cover: the names, once written in (~9.6 s into the film)
COVER=$(python3 -c "print(min($N-1, round(9.6*$FPS)))")
ffmpeg -y -hide_banner -loglevel error -i "$FRAMES/$(printf 'f%05d.jpg' $COVER)" -vf "scale=1080:1920:flags=lanczos" -q:v 2 "$OUT-cover.jpg"
ls -la "$OUT"-*
