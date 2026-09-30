#!/usr/bin/env python3
"""Compose luxury dark/gold Persian typography onto teaser keyframes (1080x1920).

Font pipeline (verified, no tofu / broken RTL):
  - Vazirmatn .ttf via absolute fontfile paths under ./fonts/
  - Pillow + raqm: direction='rtl', language='fa' on logical Unicode
  - Do NOT pre-reshape with arabic-reshaper+bidi for Pillow+Vazirmatn
    (presentation forms reverse/disconnect under HarfBuzz)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent
FRAMES = ROOT / "frames"
OUT = ROOT / "composed"
FONTS = ROOT / "fonts"
W, H = 1080, 1920

# Absolute font paths — required so ffmpeg/Pillow never fall back to a Latin face
FONT_BOLD = FONTS / "Vazirmatn-Bold.ttf"
FONT_SEMI = FONTS / "Vazirmatn-SemiBold.ttf"
FONT_MED = FONTS / "Vazirmatn-Medium.ttf"
FONT_REG = FONTS / "Vazirmatn-Regular.ttf"

GOLD = (212, 175, 110, 255)
GOLD_SOFT = (230, 200, 140, 230)
CREAM = (245, 236, 220, 255)
WHITE = (255, 255, 255, 245)
MUTED = (200, 190, 170, 210)

WEIGHT_FILES = {
    "bold": FONT_BOLD,
    "semi": FONT_SEMI,
    "med": FONT_MED,
    "reg": FONT_REG,
}


def has_arabic(text: str) -> bool:
    return any("\u0600" <= c <= "\u06FF" for c in text)


def sanitize_fa(text: str) -> str:
    """Keep punctuation Vazirmatn covers; avoid exotic separators that tofu elsewhere."""
    return (
        text.replace("—", " – ")
        .replace("−", "-")
        .replace("×", "×")
    )


def rtl_kwargs(text: str) -> dict:
    if has_arabic(text):
        return {"direction": "rtl", "language": "fa"}
    return {}


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    path = WEIGHT_FILES[weight]
    if not path.is_file():
        raise FileNotFoundError(f"Persian font missing: {path}")
    return ImageFont.truetype(str(path), size)


def fit_cover(src: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale+center-crop to cover target (source may be 2:3)."""
    sw, sh = src.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    img = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def grade(img: Image.Image) -> Image.Image:
    img = ImageEnhance.Color(img).enhance(0.92)
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Brightness(img).enhance(0.94)
    return img


def vignette(base: Image.Image, strength: float = 0.55) -> Image.Image:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for i in range(120):
        a = int(strength * 255 * (i / 120) ** 1.6)
        draw.rectangle([i, i, W - 1 - i, H - 1 - i], outline=(0, 0, 0, a))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def gradient_scrim(height: int, top_alpha: int = 0, bottom_alpha: int = 210) -> Image.Image:
    layer = Image.new("RGBA", (W, height), (0, 0, 0, 0))
    px = layer.load()
    for y in range(height):
        t = y / max(height - 1, 1)
        a = int(top_alpha + (bottom_alpha - top_alpha) * (t**1.15))
        for x in range(W):
            px[x, y] = (8, 6, 2, a)
    return layer


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont):
    bbox = draw.textbbox((0, 0), text, font=fnt, **rtl_kwargs(text))
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    fnt: ImageFont.FreeTypeFont,
    fill,
    shadow: bool = True,
):
    text = sanitize_fa(text)
    tw, th = text_size(draw, text, fnt)
    x = (W - tw) // 2
    kw = rtl_kwargs(text)
    if shadow:
        draw.text((x + 2, y + 3), text, font=fnt, fill=(0, 0, 0, 160), **kw)
    draw.text((x, y), text, font=fnt, fill=fill, **kw)
    return y + th


def thin_gold_rule(draw: ImageDraw.ImageDraw, y: int, width: int = 220):
    x0 = (W - width) // 2
    draw.rectangle([x0, y, x0 + width, y + 2], fill=GOLD)


def compose(
    src_name: str,
    out_name: str,
    lines: list[tuple[str, str, int, tuple]],
    *,
    brand: str | None = "دوردوریا",
    step: str | None = None,
    bottom_scrim: int = 520,
    top_scrim: int = 180,
):
    for req in WEIGHT_FILES.values():
        if not req.is_file():
            raise FileNotFoundError(f"required font missing: {req}")

    src = Image.open(FRAMES / src_name).convert("RGB")
    base = grade(fit_cover(src, W, H)).convert("RGBA")
    base = vignette(base, 0.5)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # top fade
    top = gradient_scrim(top_scrim, 160, 0)
    overlay.alpha_composite(top, (0, 0))
    # bottom fade
    bot = gradient_scrim(bottom_scrim, 0, 230)
    overlay.alpha_composite(bot, (0, H - bottom_scrim))

    draw = ImageDraw.Draw(overlay)

    if brand:
        f_brand = font("semi", 42)
        draw_centered(draw, brand, 96, f_brand, GOLD_SOFT, shadow=True)
        thin_gold_rule(draw, 160, 160)

    if step:
        f_step = font("med", 34)
        draw_centered(draw, step, 200, f_step, MUTED)

    # main copy block near lower third
    y = H - bottom_scrim + 80
    for raw, weight, size, color in lines:
        fnt = font(weight, size)
        # Latin handles stay LTR (no rtl kwargs); Persian uses Pillow RTL
        y = draw_centered(draw, raw, y, fnt, color) + 28

    out = Image.alpha_composite(base, overlay).convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / out_name
    out.save(path, "PNG", optimize=True)
    print("wrote", path.name, out.size, f"fonts={FONT_BOLD.name}")


def main():
    # 01 brand flash
    compose(
        "teaser_02_brand_gold.png",
        "01_brand.png",
        [
            ("دوردوریا", "bold", 96, GOLD),
            ("کسب درآمد هوشمند", "med", 44, CREAM),
        ],
        brand=None,
        bottom_scrim=640,
        top_scrim=120,
    )

    # 02 hook
    compose(
        "teaser_01_hook_home.png",
        "02_hook.png",
        [
            ("از خونه،", "bold", 78, CREAM),
            ("بدون خروج", "bold", 78, GOLD),
            ("درآمد واقعی از معرفی دوستان", "med", 36, MUTED),
        ],
        bottom_scrim=620,
    )

    # 03 promise
    compose(
        "teaser_03_coins_promise.png",
        "03_promise.png",
        [
            ("روزی ۴۰ دعوت", "bold", 70, CREAM),
            ("≈ ماهی ۳۰ میلیون تومان", "bold", 52, GOLD),
            ("۲۵ سکه × ۴۰ × ۱٬۰۰۰ تومان", "med", 34, MUTED),
        ],
        bottom_scrim=680,
    )

    # 04 monthly glow reinforce
    compose(
        "teaser_08_monthly_glow.png",
        "04_growth.png",
        [
            ("مسیر ساده، نتیجه ملموس", "semi", 48, CREAM),
            ("از دعوت تا واریز", "med", 38, GOLD_SOFT),
        ],
        bottom_scrim=560,
    )

    # 05 invite
    compose(
        "teaser_04_invite_friends.png",
        "05_invite.png",
        [
            ("معرفی دوستان", "bold", 72, CREAM),
            ("هر دعوت موفق = ۲۵ سکه", "med", 38, GOLD),
        ],
        step="گام ۱",
        bottom_scrim=560,
    )

    # 06 coins flash (reuse coins with different copy)
    compose(
        "teaser_03_coins_promise.png",
        "06_coins.png",
        [
            ("جمع‌آوری سکه", "bold", 72, CREAM),
            ("موجودی طلایی تو", "med", 40, GOLD_SOFT),
        ],
        step="گام ۲",
        bottom_scrim=540,
    )

    # 07 earn
    compose(
        "teaser_05_earn_phone.png",
        "07_earn.png",
        [
            ("کسب درآمد", "bold", 74, CREAM),
            ("تبدیل سکه به پول واقعی", "med", 38, GOLD),
        ],
        step="گام ۳",
        bottom_scrim=560,
    )

    # 08 card
    compose(
        "teaser_06_card_payout.png",
        "08_card.png",
        [
            ("فروش و کارت", "bold", 72, CREAM),
            ("واریز پس از تأیید", "med", 40, GOLD_SOFT),
        ],
        step="گام ۴",
        bottom_scrim=560,
    )

    # 09 CTA
    compose(
        "teaser_07_cta_void.png",
        "09_cta.png",
        [
            ("دوردوریا", "bold", 88, GOLD),
            ("@Dordoriya_bot", "semi", 52, CREAM),
            ("همین حالا شروع کن", "med", 40, MUTED),
        ],
        brand=None,
        bottom_scrim=720,
        top_scrim=100,
    )


if __name__ == "__main__":
    main()
