#!/usr/bin/env bash
# Assemble Dordoriya earn teaser: Ken Burns clips + crossfades + music
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
COMP="$ROOT/composed"
CLIPS="$ROOT/clips"
AUDIO="$ROOT/audio/luxury_bg.mp3"
OUT_SILENT="$ROOT/video_silent.mp4"
OUT_FINAL="$(dirname "$ROOT")/channel-earn-teaser-pro.mp4"
FPS=30
mkdir -p "$CLIPS"

# durations (seconds) — total ~33s
# brand 2.8 | hook 5.0 | promise 5.5 | growth 3.2 | invite 3.2 | coins 3.0 | earn 3.2 | card 3.2 | cta 4.5
# with short xfade overlap 0.45 → approx 33s
declare -a FILES=(
  "01_brand.png"
  "02_hook.png"
  "03_promise.png"
  "04_growth.png"
  "05_invite.png"
  "06_coins.png"
  "07_earn.png"
  "08_card.png"
  "09_cta.png"
)
declare -a DURS=(2.8 5.0 5.5 3.2 3.2 3.0 3.2 3.2 4.5)
# Ken Burns zoom directions alternate
declare -a ZOOMS=(
  "zoompan=z='min(1.12,1+0.0012*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='min(1.14,1+0.0010*on)':x='iw/2-(iw/zoom/2)-20*on/${FPS}':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='min(1.12,1+0.0009*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+12*on/${FPS}':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='if(eq(on,1),1.10,max(1.0,1.10-0.0008*on))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='min(1.13,1+0.0011*on)':x='iw/2-(iw/zoom/2)+15*on/${FPS}':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='min(1.12,1+0.0010*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-10*on/${FPS}':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='min(1.14,1+0.0012*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='min(1.12,1+0.0009*on)':x='iw/2-(iw/zoom/2)-12*on/${FPS}':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
  "zoompan=z='min(1.10,1+0.0007*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
)

echo "== generating Ken Burns clips =="
for i in "${!FILES[@]}"; do
  idx=$(printf "%02d" $((i + 1)))
  src="$COMP/${FILES[$i]}"
  dur="${DURS[$i]}"
  frames=$(python3 -c "print(int(round($dur * $FPS)))")
  # Extra frames for zoompan frame budget
  zp="${ZOOMS[$i]}"
  # Replace d=1 with actual frame count
  zp="${zp/d=1/d=${frames}}"
  out="$CLIPS/clip_${idx}.mp4"
  echo "  clip $idx  ${dur}s  ${FILES[$i]}"
  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -i "$src" \
    -vf "scale=1400:2489:force_original_aspect_ratio=increase,crop=1400:2489,${zp},format=yuv420p" \
    -t "$dur" -r "$FPS" -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p \
    -an "$out"
done

echo "== concatenating with xfade =="
XFADE=0.45
# Build filter_complex for sequential xfades
n=${#FILES[@]}
inputs=()
for i in $(seq 1 "$n"); do
  idx=$(printf "%02d" "$i")
  inputs+=(-i "$CLIPS/clip_${idx}.mp4")
done

# cumulative offset for xfade
# offset_k = sum(dur[0..k]) - xfade * (k)  ... actually for chained:
# first xfade at dur0 - xfade
# next at (dur0 + dur1 - xfade) - xfade = dur0+dur1 - 2*xfade
filter=""
prev="[0:v]"
offset=$(python3 -c "print(${DURS[0]} - $XFADE)")
for i in $(seq 1 $((n - 1))); do
  out_label="v$i"
  if [[ $i -eq $((n - 1)) ]]; then
    out_label="vout"
  fi
  filter+="${prev}[$i:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}[${out_label}];"
  prev="[${out_label}]"
  if [[ $i -lt $((n - 1)) ]]; then
    offset=$(python3 -c "print(${offset} + ${DURS[$i]} - $XFADE)")
  fi
done
filter="${filter%;}"

ffmpeg -y -hide_banner -loglevel error \
  "${inputs[@]}" \
  -filter_complex "$filter" \
  -map "[vout]" \
  -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -r "$FPS" -movflags +faststart \
  "$OUT_SILENT"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_SILENT")
echo "silent duration: $DUR"

echo "== mixing music (fade in/out, ducked) =="
# Fade in 1.2s, fade out last 2.5s; volume ~0.22 for under-titles feel
FADE_OUT_ST=$(python3 -c "print(max(0.0, float('${DUR}') - 2.5))")
ffmpeg -y -hide_banner -loglevel error \
  -i "$OUT_SILENT" \
  -i "$AUDIO" \
  -filter_complex "[1:a]atrim=0:${DUR},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.2,afade=t=out:st=${FADE_OUT_ST}:d=2.5,volume=0.22[a]" \
  -map 0:v -map "[a]" \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart \
  "$OUT_FINAL"

echo "== final probe =="
ffprobe -hide_banner "$OUT_FINAL" 2>&1 | head -25
ls -lh "$OUT_FINAL"
echo "DONE $OUT_FINAL"
