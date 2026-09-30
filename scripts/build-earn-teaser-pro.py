#!/usr/bin/env python3
"""Assemble professional Patogh earn teaser (9:16) from composed PNG overlays.

Typography is baked into PNGs by earn-teaser-pro/compose_overlays.py using
Vazirmatn + Pillow RTL (no ffmpeg drawtext — avoids Persian tofu/broken RTL).

Usage:
  python3 assets/banners/channel-posts/earn-teaser-pro/compose_overlays.py
  python3 scripts/build-earn-teaser-pro.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRO = ROOT / "assets" / "banners" / "channel-posts" / "earn-teaser-pro"
COMPOSED = PRO / "composed"
CLIPS = PRO / "clips"
AUDIO = PRO / "audio" / "luxury_bg.mp3"
FONT_BOLD = PRO / "fonts" / "Vazirmatn-Bold.ttf"
OUT = ROOT / "assets" / "banners" / "channel-posts" / "channel-earn-teaser-pro.mp4"

W, H = 1080, 1920
FPS = 30

# (composed png, duration_sec, zoom_end)
SPECS: list[tuple[str, float, float]] = [
    ("01_brand.png", 2.8, 1.06),
    ("02_hook.png", 3.4, 1.08),
    ("03_promise.png", 3.8, 1.07),
    ("04_growth.png", 3.0, 1.09),
    ("05_invite.png", 3.2, 1.08),
    ("06_coins.png", 2.8, 1.10),
    ("07_earn.png", 3.2, 1.08),
    ("08_card.png", 3.2, 1.07),
    ("09_cta.png", 4.0, 1.05),
]


def ken_burns(src: Path, dest: Path, duration: float, zoom_end: float) -> None:
    frames = max(1, int(round(duration * FPS)))
    z_expr = f"min(1+({zoom_end}-1)*on/{frames},{zoom_end})"
    vf = (
        f"scale=8000:-1,"
        f"zoompan=z='{z_expr}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
        f":d={frames}:s={W}x{H}:fps={FPS},"
        f"format=yuv420p"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-loop", "1", "-i", str(src),
            "-vf", vf, "-t", f"{duration:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "17",
            "-pix_fmt", "yuv420p", "-an", str(dest),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def concat_xfade(clips: list[tuple[Path, float]], dest: Path, fade: float = 0.45) -> float:
    if len(clips) == 1:
        subprocess.run(["ffmpeg", "-y", "-i", str(clips[0][0]), "-c", "copy", str(dest)], check=True)
        return clips[0][1]

    inputs: list[str] = []
    for path, _ in clips:
        inputs.extend(["-i", str(path)])

    offsets: list[float] = []
    acc = 0.0
    for _p, dur in clips[:-1]:
        acc += dur - fade
        offsets.append(acc)

    parts = [f"[0:v][1:v]xfade=transition=fade:duration={fade}:offset={offsets[0]:.3f}[v1]"]
    last = "v1"
    for i in range(2, len(clips)):
        out = f"v{i}"
        parts.append(
            f"[{last}][{i}:v]xfade=transition=fade:duration={fade}:offset={offsets[i-1]:.3f}[{out}]"
        )
        last = out

    total = sum(d for _, d in clips) - fade * (len(clips) - 1)
    subprocess.run(
        [
            "ffmpeg", "-y", *inputs,
            "-filter_complex", ";".join(parts),
            "-map", f"[{last}]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "17",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-t", f"{total:.3f}", str(dest),
        ],
        check=True,
    )
    return total


def mix_audio(video: Path, music: Path, dest: Path, duration: float) -> None:
    fade_in, fade_out = 0.8, 1.8
    afilt = (
        f"atrim=0:{duration:.3f},asetpts=PTS-STARTPTS,"
        f"afade=t=in:st=0:d={fade_in},"
        f"afade=t=out:st={max(0, duration - fade_out):.3f}:d={fade_out},"
        f"volume=0.32"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video), "-i", str(music),
            "-filter_complex", f"[1:a]{afilt}[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-movflags", "+faststart", str(dest),
        ],
        check=True,
    )


def main() -> int:
    if not FONT_BOLD.is_file():
        print(f"missing Vazirmatn: {FONT_BOLD}", file=sys.stderr)
        return 1
    if not AUDIO.is_file():
        print(f"missing audio: {AUDIO}", file=sys.stderr)
        return 1

    missing = [n for n, _, _ in SPECS if not (COMPOSED / n).is_file()]
    if missing:
        print("missing composed frames — run compose_overlays.py first:", missing, file=sys.stderr)
        return 1

    print(f"font OK: {FONT_BOLD}")
    CLIPS.mkdir(parents=True, exist_ok=True)
    clip_list: list[tuple[Path, float]] = []
    for i, (name, dur, zoom) in enumerate(SPECS):
        clip = CLIPS / f"clip_{i+1:02d}.mp4"
        print(f"ken burns {name} → {clip.name} ({dur}s)…")
        ken_burns(COMPOSED / name, clip, dur, zoom)
        clip_list.append((clip, dur))

    silent = PRO / "video_silent.mp4"
    total = concat_xfade(clip_list, silent)
    print(f"silent ≈ {total:.2f}s")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    mix_audio(silent, AUDIO, OUT, total)

    probe = json.loads(
        subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration,size:stream=codec_name,width,height",
                "-of", "json", str(OUT),
            ],
            text=True,
        )
    )
    print(json.dumps(probe, indent=2))
    print(f"FINAL {OUT} ({OUT.stat().st_size / (1024*1024):.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
