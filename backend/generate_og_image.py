"""
EcoTrack/backend/generate_og_image.py

One-off asset generator (same category as generate_app_icons.py and the
email animation scripts - not part of the running app). Draws the social
share preview image - the card WhatsApp, iMessage, LinkedIn, Twitter/X and
every other platform render when someone pastes the site's link, built from
og:image / twitter:image in index.html.

WHY THIS EXISTS
Before this, index.html had no og:image (or any Open Graph tags) at all -
sharing ecotrackapp.web.app anywhere showed a bare link with no title, no
description, no image. That is the single most common "looks unfinished"
tell for a project a visitor has never seen before opening it.

Standard 1200x630 size (Open Graph's and Twitter's own recommendation) -
render at 2x for crisper text on high-DPI displays, then downscale.

Writes straight into frontend/public/, where Vite serves it untouched at
PUBLIC_APP_URL/og-image.png.

Re-run this file (`python generate_og_image.py`) any time the design needs
to change; it always overwrites the same output file.

Requires Pillow (`pip install pillow`) - a generation-time tool, not a
runtime dependency of the Flask app, so it is deliberately NOT in
requirements.txt.
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

SCALE = 2
W, H = 1200 * SCALE, 630 * SCALE

# Exact values from frontend/src/index.css (light theme - an OG card always
# renders on whatever background the sharing platform gives it, so the same
# safe light default the emails use).
PAPER = (245, 243, 236, 255)     # --eco-bg (light)
INK = (30, 42, 29, 255)          # --eco-text (light)
INK_MUTED = (95, 107, 88, 255)   # --eco-text-muted (light)
GREEN = (31, 122, 68, 255)       # --eco-primary (light)
AMBER = (150, 96, 0, 255)        # --readout (light)
RULE = (31, 42, 26, 40)          # --rule (light), alpha over paper

FONTS_DIR = r"C:\Windows\Fonts"


def _font(name, size):
    return ImageFont.truetype(os.path.join(FONTS_DIR, name), size)


def _leaf_path(cx, cy, r):
    """Same vesica-outline leaf as generate_app_icons.py / the donation
    animation - one shape drawn three ways across the project's generators,
    kept consistent rather than re-invented per script."""
    points = []
    steps = 48
    length = r * 2.15
    width = r * 1.35
    for i in range(steps + 1):
        t = i / steps
        half_w = (width / 2) * math.sin(math.pi * t)
        y = cy - length / 2 + length * (1 - t)
        points.append((cx + half_w, y))
    for i in range(steps + 1):
        t = i / steps
        half_w = (width / 2) * math.sin(math.pi * t)
        y = cy - length / 2 + length * t
        points.append((cx - half_w, y))
    return points


def main():
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)

    margin = 90 * SCALE

    # a faint corner-to-corner dot grid, the same motif Home's hero section
    # uses (.eco-dot-grid) - texture without competing with the type
    step = 34 * SCALE
    for y in range(0, H, step):
        for x in range(0, W, step):
            draw.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(31, 42, 26, 18))

    # a single rule under the eyebrow, the same "a rule replaces a card"
    # convention the rest of the site uses instead of boxing content
    eyebrow_font = _font("segoeuib.ttf", 21 * SCALE)
    eyebrow_y = margin
    draw.text((margin, eyebrow_y), "SDG 13 \u00b7 CLIMATE ACTION", font=eyebrow_font, fill=AMBER)
    rule_y = eyebrow_y + 34 * SCALE
    draw.line([(margin, rule_y), (W - margin, rule_y)], fill=RULE, width=2)

    # leaf mark + wordmark, set as one lockup
    leaf_r = 34 * SCALE
    leaf_cx = margin + leaf_r
    leaf_cy = rule_y + 92 * SCALE
    draw.polygon(_leaf_path(leaf_cx, leaf_cy, leaf_r), fill=GREEN)

    word_font = _font("segoeuib.ttf", 58 * SCALE)
    draw.text(
        (leaf_cx + leaf_r + 22 * SCALE, leaf_cy - 40 * SCALE),
        "EcoTrack",
        font=word_font,
        fill=GREEN,
    )

    # headline
    headline_font = _font("segoeuib.ttf", 62 * SCALE)
    headline_y = leaf_cy + 70 * SCALE
    draw.text(
        (margin, headline_y),
        "Measure your footprint,",
        font=headline_font,
        fill=INK,
    )
    draw.text(
        (margin, headline_y + 76 * SCALE),
        "then bring it down.",
        font=headline_font,
        fill=INK,
    )

    # subhead
    sub_font = _font("segoeui.ttf", 28 * SCALE)
    sub_y = headline_y + 176 * SCALE
    draw.text(
        (margin, sub_y),
        "Track, understand and reduce your carbon footprint",
        font=sub_font,
        fill=INK_MUTED,
    )
    draw.text(
        (margin, sub_y + 40 * SCALE),
        "across seven categories - free, no card required.",
        font=sub_font,
        fill=INK_MUTED,
    )

    # footer rule + url, echoing the site's own footer treatment. A smaller,
    # dedicated bottom margin than the top/side one - the top margin has an
    # eyebrow-plus-rule stacked above it, so re-using its size here crowded
    # the subhead's second line against this rule.
    footer_margin = 60 * SCALE
    footer_rule_y = H - footer_margin
    draw.line([(margin, footer_rule_y), (W - margin, footer_rule_y)], fill=RULE, width=2)
    url_font = _font("segoeuib.ttf", 24 * SCALE)
    draw.text((margin, footer_rule_y + 18 * SCALE), "ecotrackapp.web.app", font=url_font, fill=GREEN)

    out_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "og-image.png"
    )
    out_path = os.path.normpath(out_path)

    final = img.resize((1200, 630), Image.LANCZOS)
    final.save(out_path, optimize=True)

    print(f"Wrote {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
