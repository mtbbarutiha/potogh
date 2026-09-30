# Persian font pipeline (teaser)

**Font files (absolute):**
- `fonts/Vazirmatn-Bold.ttf`
- `fonts/Vazirmatn-SemiBold.ttf`
- `fonts/Vazirmatn-Medium.ttf`
- `fonts/Vazirmatn-Regular.ttf`

**Verified approach:** Pillow + raqm with `direction="rtl"` and `language="fa"` on **logical** Unicode text.

**Do not** use `arabic-reshaper` + `python-bidi` before Pillow draw with Vazirmatn — presentation forms reverse/disconnect under HarfBuzz.

**Do not** use ffmpeg `drawtext` for Persian body copy — bake text into PNGs via `compose_overlays.py`, then Ken-Burns/xfade in `scripts/build-earn-teaser-pro.py`.

**Avoid** Noto Naskh for punctuation-heavy lines (em dash `—` renders as tofu □). Vazirmatn covers `—` / `–` / Persian digits.

Spot-check: open `composed/01_brand.png`, `03_promise.png`, `09_cta.png` — no □, joined glyphs, correct RTL.
