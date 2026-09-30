#!/usr/bin/env python3
"""Build high-quality Patogh «کسب درآمد» educational video (9:16).

- Upscales AI frames to 1080x1920 with luxury Persian overlays
- Ken Burns zooms + crossfades via ffmpeg
- Mixes royalty-free instrumental bed (Kevin MacLeod / Gymnopédie)
- High-bitrate H.264 mp4 for Telegram

Usage:
  python3 scripts/build-earn-tutorial-hq.py
"""
from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
HQ = ROOT / "assets" / "banners" / "channel-posts" / "earn-tutorial-hq"
SRC_FRAMES = HQ / "frames"
COMPOSED = HQ / "composed"
CLIPS = HQ / "clips"
AUDIO = HQ / "audio" / "gymnopedie.mp3"
OUT = ROOT / "assets" / "banners" / "channel-posts" / "channel-earn-tutorial-hq.mp4"
# Also overwrite legacy path used by send script convenience
OUT_LEGACY = ROOT / "assets" / "banners" / "channel-posts" / "channel-earn-tutorial.mp4"

W, H = 1080, 1920
FPS = 30
GOLD = (212, 175, 95)
GOLD_SOFT = (235, 210, 150)
CREAM = (248, 244, 236)
MUTED = (180, 190, 195)
NIGHT = (6, 18, 24)

# Vazirmatn preferred (covers em dash / Persian digits; no tofu). Fallback: Noto Sans Arabic.
_VAZIR_DIR = ROOT / "assets" / "banners" / "channel-posts" / "earn-teaser-pro" / "fonts"
_VAZIR_BOLD = _VAZIR_DIR / "Vazirmatn-Bold.ttf"
_VAZIR_REG = _VAZIR_DIR / "Vazirmatn-Regular.ttf"
if _VAZIR_BOLD.is_file():
    FONT_REG = str(_VAZIR_REG)
    FONT_BOLD = str(_VAZIR_BOLD)
    FONT_NASKH = str(_VAZIR_BOLD)
else:
    FONT_REG = "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf"
    FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf"
    FONT_NASKH = "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf"
FONT_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# (source, duration_sec, zoom_end, caption_lines, badge)
SPECS: list[tuple[str, float, float, list[str], str | None]] = [
    (
        "hq_01_title.png",
        4.5,
        1.08,
        ["دوردوریا", "آموزش کسب درآمد", "فروش سکه به تومان – گام‌به‌گام"],
        None,
    ),
    (
        "hq_02_menu.png",
        4.5,
        1.10,
        ["منوی اصلی را باز کن"],
        "مرحله ۱ از ۷",
    ),
    (
        "hq_03_referral.png",
        4.5,
        1.09,
        ["معرفی دوستان", "هر دعوت موفق = ۲۵ سکه"],
        "مرحله ۲ از ۷",
    ),
    (
        "hq_04_earn_tap.png",
        4.2,
        1.11,
        ["دکمه «کسب درآمد» را بزن"],
        "مرحله ۳ از ۷",
    ),
    (
        "hq_05_rates.png",
        5.2,
        1.08,
        ["نرخ: ۱٬۰۰۰ تومان / سکه", "حداقل فروش: ۱٬۰۰۰ سکه"],
        "مرحله ۴ از ۷",
    ),
    (
        "hq_06_sell.png",
        4.5,
        1.10,
        ["فروش را بزن و تأیید کن"],
        "مرحله ۵ از ۷",
    ),
    (
        "hq_07_card.png",
        4.5,
        1.09,
        ["شماره کارت ۱۶ رقمی را بفرست"],
        "مرحله ۶ از ۷",
    ),
    (
        "hq_08_deposit.png",
        4.5,
        1.08,
        ["منتظر واریز ادمین بمان"],
        "مرحله ۷ از ۷",
    ),
    (
        "hq_09_outro.png",
        4.6,
        1.07,
        ["همین حالا شروع کن", "t.me/Patoghchatbot"],
        None,
    ),
]


def has_arabic(text: str) -> bool:
    return any("\u0600" <= c <= "\u06FF" for c in text)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    path = FONT_NASKH if bold else FONT_REG
    try:
        return ImageFont.truetype(path if bold else FONT_REG, size)
    except OSError:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def font_latin(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_LATIN, size)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt) -> tuple[int, int]:
    kwargs: dict = {"font": fnt}
    if has_arabic(text):
        kwargs["direction"] = "rtl"
        kwargs["language"] = "fa"
    bb = draw.textbbox((0, 0), text, **kwargs)
    return bb[2] - bb[0], bb[3] - bb[1]


def draw_text(draw, xy, text, fnt, fill):
    kwargs: dict = {"font": fnt, "fill": fill}
    if has_arabic(text):
        kwargs["direction"] = "rtl"
        kwargs["language"] = "fa"
    draw.text(xy, text, **kwargs)


def cover_resize(im: Image.Image, tw: int, th: int) -> Image.Image:
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def rounded_rect(draw, xy, radius, fill, outline=None, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def compose_frame(
    src: Path,
    caption_lines: list[str],
    badge: str | None,
    *,
    title_mode: bool = False,
    hero_coin: str | None = None,
) -> Image.Image:
    base = Image.open(src).convert("RGB")
    img = cover_resize(base, W, H)
    # Luxury vignette + center panel so AI-garbled glyphs don't fight overlays
    veil = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(veil)
    vd.rectangle([0, 0, W, int(H * 0.24)], fill=(6, 16, 22, 130))
    vd.rectangle([0, int(H * 0.68), W, H], fill=(4, 12, 18, 165))
    # Soft center scrub panel for clean typography
    if title_mode:
        vd.rounded_rectangle([70, 430, W - 70, 1180], radius=36, fill=(8, 20, 26, 175))
    elif hero_coin:
        vd.rounded_rectangle([90, 520, W - 90, 1180], radius=40, fill=(8, 20, 26, 185))
        vd.rounded_rectangle([60, 1480, W - 60, 1860], radius=32, fill=(6, 16, 22, 150))
        vd.rounded_rectangle([220, 70, W - 220, 210], radius=28, fill=(6, 16, 22, 120))
    else:
        vd.rounded_rectangle([60, 1480, W - 60, 1860], radius=32, fill=(6, 16, 22, 150))
        vd.rounded_rectangle([220, 70, W - 220, 210], radius=28, fill=(6, 16, 22, 120))
    veil = veil.filter(ImageFilter.GaussianBlur(16))
    img = Image.alpha_composite(img.convert("RGBA"), veil).convert("RGB")
    # Slight contrast polish
    img = ImageEnhance.Contrast(img).enhance(1.06)
    img = ImageEnhance.Color(img).enhance(1.05)

    draw = ImageDraw.Draw(img)

    if badge:
        f = font(30, True)
        tw, th = text_size(draw, badge, f)
        pad_x, pad_y = 34, 16
        x0 = (W - tw) // 2 - pad_x
        y0 = 96
        rounded_rect(
            draw,
            (x0, y0, x0 + tw + pad_x * 2, y0 + th + pad_y * 2),
            28,
            fill=(12, 28, 34),
            outline=GOLD,
            width=2,
        )
        draw_text(draw, (x0 + pad_x, y0 + pad_y - 2), badge, f, GOLD)

    if hero_coin:
        # Giant coin reward callout (corrects any wrong AI numerals)
        title = caption_lines[0] if caption_lines else "معرفی دوستان"
        f_t = font(52, True)
        tw, th = text_size(draw, title, f_t)
        draw_text(draw, ((W - tw) // 2, 560), title, f_t, CREAM)

        f_n = font(140, True)
        tw, th = text_size(draw, hero_coin, f_n)
        draw_text(draw, ((W - tw) // 2, 680), hero_coin, f_n, GOLD)
        coin_lbl = "سکه"
        f_c = font(56, True)
        tw2, _ = text_size(draw, coin_lbl, f_c)
        draw_text(draw, ((W - tw2) // 2, 860), coin_lbl, f_c, GOLD_SOFT)

        sub = caption_lines[1] if len(caption_lines) > 1 else ""
        if sub:
            f_s = font(36, True)
            tw, th = text_size(draw, sub, f_s)
            rounded_rect(
                draw,
                ((W - tw) // 2 - 36, 980, (W + tw) // 2 + 36, 980 + th + 32),
                22,
                fill=(14, 34, 40),
                outline=GOLD,
                width=2,
            )
            draw_text(draw, ((W - tw) // 2, 992), sub, f_s, CREAM)
        return img

    # Caption stack near bottom
    if title_mode:
        # Brand-first title composition
        brand, headline, sub = caption_lines[0], caption_lines[1], caption_lines[2]
        f_brand = font(96, True)
        tw, th = text_size(draw, brand, f_brand)
        # soft shadow
        draw_text(draw, ((W - tw) // 2 + 2, 520 + 2), brand, f_brand, (0, 0, 0))
        draw_text(draw, ((W - tw) // 2, 520), brand, f_brand, GOLD)
        draw.line([(W // 2 - 90, 640), (W // 2 + 90, 640)], fill=GOLD, width=3)

        f_h = font(58, True)
        tw, _ = text_size(draw, headline, f_h)
        draw_text(draw, ((W - tw) // 2, 680), headline, f_h, CREAM)

        f_s = font(34, False)
        tw, _ = text_size(draw, sub, f_s)
        draw_text(draw, ((W - tw) // 2, 780), sub, f_s, MUTED)

        chips = ["نرخ ۱٬۰۰۰ تومان", "حداقل ۱٬۰۰۰ سکه"]
        y = 980
        for c in chips:
            f = font(34, True)
            tw, th = text_size(draw, c, f)
            rounded_rect(
                draw,
                ((W - tw) // 2 - 36, y, (W + tw) // 2 + 36, y + th + 28),
                22,
                fill=(14, 34, 40),
                outline=GOLD,
                width=2,
            )
            draw_text(draw, ((W - tw) // 2, y + 10), c, f, GOLD_SOFT)
            y += th + 48

        bot = "@Patoghchatbot"
        bb = draw.textbbox((0, 0), bot, font=font_latin(28))
        draw.text(((W - (bb[2] - bb[0])) // 2, 1680), bot, font=font_latin(28), fill=MUTED)
        return img

    # Standard step captions
    y = 1580 if len(caption_lines) == 1 else 1520
    for i, line in enumerate(caption_lines):
        if line.startswith("t.me/") or line.startswith("@"):
            f = font_latin(32)
            bb = draw.textbbox((0, 0), line, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
            rounded_rect(
                draw,
                ((W - tw) // 2 - 40, y, (W + tw) // 2 + 40, y + th + 36),
                24,
                fill=(10, 26, 32),
                outline=GOLD,
                width=2,
            )
            draw.text(((W - tw) // 2, y + 14), line, font=f, fill=GOLD_SOFT)
            y += th + 56
            continue

        size = 48 if i == 0 else 36
        f = font(size, True)
        tw, th = text_size(draw, line, f)
        pad_x, pad_y = 40, 18
        rounded_rect(
            draw,
            ((W - tw) // 2 - pad_x, y, (W + tw) // 2 + pad_x, y + th + pad_y * 2),
            26,
            fill=(10, 24, 30),
            outline=GOLD,
            width=2,
        )
        fill = GOLD if i == 0 and len(caption_lines) > 1 else CREAM
        if i > 0:
            fill = GOLD_SOFT
        draw_text(draw, ((W - tw) // 2, y + pad_y - 2), line, f, fill)
        y += th + pad_y * 2 + 18

    return img


def build_composed() -> list[tuple[Path, float, float]]:
    COMPOSED.mkdir(parents=True, exist_ok=True)
    out: list[tuple[Path, float, float]] = []
    for i, (name, dur, zoom, lines, badge) in enumerate(SPECS):
        src = SRC_FRAMES / name
        if not src.exists():
            raise FileNotFoundError(src)
        print(f"compose {name}…")
        title_mode = i == 0
        hero_coin = "۲۵" if i == 2 else None
        img = compose_frame(
            src, lines, badge, title_mode=title_mode, hero_coin=hero_coin
        )
        dest = COMPOSED / f"{i+1:02d}_{name}"
        img.save(dest, "PNG", optimize=False)
        out.append((dest, dur, zoom))
    return out


def ken_burns_clip(src: Path, dest: Path, duration: float, zoom_end: float) -> None:
    """Create a Ken Burns zoom clip from a still at 1080x1920."""
    frames = max(1, int(round(duration * FPS)))
    # zoompan: z goes from 1 to zoom_end; keep centered
    # d = frames; s = output size
    z_expr = f"min(1+({zoom_end}-1)*on/{frames},{zoom_end})"
    x_expr = f"(iw-iw/zoom)/2"
    y_expr = f"(ih-ih/zoom)/2"
    vf = (
        f"scale=8000:-1,"
        f"zoompan=z='{z_expr}':x='{x_expr}':y='{y_expr}':d={frames}:s={W}x{H}:fps={FPS},"
        f"format=yuv420p"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(src),
        "-vf",
        vf,
        "-t",
        f"{duration:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-an",
        str(dest),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def concat_xfade(clips: list[tuple[Path, float]], dest: Path, fade: float = 0.55) -> float:
    """Chain clips with crossfades. Returns total duration."""
    if len(clips) == 1:
        subprocess.run(["ffmpeg", "-y", "-i", str(clips[0][0]), "-c", "copy", str(dest)], check=True)
        return clips[0][1]

    # Build filter_complex xfade chain
    inputs: list[str] = []
    for path, _dur in clips:
        inputs.extend(["-i", str(path)])

    n = len(clips)
    # offset accumulates: start of each fade
    # total = sum(dur) - (n-1)*fade
    offsets = []
    acc = 0.0
    for i, (_p, dur) in enumerate(clips[:-1]):
        acc += dur - fade
        offsets.append(acc)

    parts = []
    # First pair
    parts.append(
        f"[0:v][1:v]xfade=transition=fade:duration={fade}:offset={offsets[0]:.3f}[v1]"
    )
    last = "v1"
    for i in range(2, n):
        out = f"v{i}"
        parts.append(
            f"[{last}][{i}:v]xfade=transition=fade:duration={fade}:offset={offsets[i-1]:.3f}[{out}]"
        )
        last = out

    filt = ";".join(parts)
    total = sum(d for _, d in clips) - fade * (n - 1)

    cmd = [
        "ffmpeg",
        "-y",
        *inputs,
        "-filter_complex",
        filt,
        "-map",
        f"[{last}]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-t",
        f"{total:.3f}",
        str(dest),
    ]
    print("xfade concat…")
    subprocess.run(cmd, check=True)
    return total


def mix_audio(video: Path, music: Path, dest: Path, duration: float) -> None:
    # Moderate volume bed with fade in/out
    fade_in = 1.2
    fade_out = 2.0
    # volume ~0.22 relative to full
    afilt = (
        f"atrim=0:{duration:.3f},asetpts=PTS-STARTPTS,"
        f"afade=t=in:st=0:d={fade_in},afade=t=out:st={max(0, duration - fade_out):.3f}:d={fade_out},"
        f"volume=0.38"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video),
        "-i",
        str(music),
        "-filter_complex",
        f"[1:a]{afilt}[a]",
        "-map",
        "0:v",
        "-map",
        "[a]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(dest),
    ]
    print("mix audio…")
    subprocess.run(cmd, check=True)


def main() -> int:
    if not AUDIO.exists():
        print(f"missing music: {AUDIO}", file=sys.stderr)
        return 1

    composed = build_composed()
    CLIPS.mkdir(parents=True, exist_ok=True)

    clip_list: list[tuple[Path, float]] = []
    for i, (path, dur, zoom) in enumerate(composed):
        clip = CLIPS / f"clip_{i+1:02d}.mp4"
        print(f"ken burns {clip.name} ({dur}s, zoom→{zoom})…")
        ken_burns_clip(path, clip, dur, zoom)
        clip_list.append((clip, dur))

    silent = HQ / "video_silent.mp4"
    total = concat_xfade(clip_list, silent, fade=0.55)
    print(f"silent duration ≈ {total:.2f}s")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    mix_audio(silent, AUDIO, OUT, total)

    # Copy to legacy name for easy send
    OUT_LEGACY.write_bytes(OUT.read_bytes())

    # Probe
    probe = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:stream=codec_type,codec_name,width,height,bit_rate",
            "-of",
            "json",
            str(OUT),
        ],
        text=True,
    )
    print(probe)
    mb = OUT.stat().st_size / (1024 * 1024)
    print(f"FINAL {OUT} ({mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
