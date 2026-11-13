#!/usr/bin/env bash
# Renders the reel in 3 parallel chunks (split mid-scroll, 1 frame overlap for checking).
# usage: tools/reel/render-parallel.sh <out_dir> [fps] [scale] [lang]
# Frames end up in <out_dir>/all/f00000.jpg ...
set -euo pipefail
OUT=${1:?out dir}; FPS=${2:-60}; SCALE=${3:-5}; LANG=${4:-en}
cd "$(dirname "$0")/../.."
mkdir -p "$OUT/c1" "$OUT/c2" "$OUT/c3" "$OUT/all"
# split points (seconds) fall inside fast scrolls, where any tiny difference is invisible
A=$(python3 -c "print(round(20.5*$FPS))"); B=$(python3 -c "print(round(39.9*$FPS))")
node tools/reel/record.cjs --fps=$FPS --scale=$SCALE --lang=$LANG --out="$OUT/c1" --to=$((A+1)) --port=8901 > "$OUT/log-1.txt" 2>&1 &
node tools/reel/record.cjs --fps=$FPS --scale=$SCALE --lang=$LANG --out="$OUT/c2" --from=$((A-1)) --to=$((B+1)) --port=8902 > "$OUT/log-2.txt" 2>&1 &
node tools/reel/record.cjs --fps=$FPS --scale=$SCALE --lang=$LANG --out="$OUT/c3" --from=$((B-1)) --port=8903 > "$OUT/log-3.txt" 2>&1 &
wait
# merge: chunk 1 up to A-1, chunk 2 from A to B-1, chunk 3 from B
for f in "$OUT"/c1/*.jpg; do n=$(basename "$f" .jpg); n=$((10#${n#f})); [ $n -lt $A ] && ln -sf "$(realpath "$f")" "$OUT/all/"; done
for f in "$OUT"/c2/*.jpg; do n=$(basename "$f" .jpg); n=$((10#${n#f})); [ $n -ge $A ] && [ $n -lt $B ] && ln -sf "$(realpath "$f")" "$OUT/all/"; done
for f in "$OUT"/c3/*.jpg; do n=$(basename "$f" .jpg); n=$((10#${n#f})); [ $n -ge $B ] && ln -sf "$(realpath "$f")" "$OUT/all/"; done
echo "ALL CHUNKS DONE A=$A B=$B frames=$(ls "$OUT/all" | wc -l)"; tail -n 1 "$OUT"/log-*.txt
