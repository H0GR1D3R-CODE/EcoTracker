"""
EcoTrack/backend/generate_donation_animation.py

One-off asset generator (same category as seed_factors.py and
generate_reset_animation.py - not part of the running app). Draws the small
looping animation shown at the top of the donation thank-you email
(email_service.py): a sprout grows up out of the soil and two leaves unfurl,
in the brand green - "your donation, growing into something" is the whole
idea, and it is a deliberately different animation from the reset email's
ring-and-checkmark so the two emails do not feel like the same template
re-skinned.

Writes straight into frontend/public/email/, where Vite serves it untouched
as a static file at PUBLIC_APP_URL/email/donation-thanks.gif once the
frontend is deployed - no separate image host needed.

Re-run this file (`python generate_donation_animation.py`) any time the
design needs to change; it always overwrites the same two output files.

Requires Pillow (`pip install pillow`) - a generation-time tool, not a
runtime dependency of the Flask app, so it is deliberately NOT in
requirements.txt.
"""

import math
import os

from PIL import Image, ImageDraw

SIZE = 160
SCALE = 4
BIG = SIZE * SCALE

# The light theme's own measured values (index.css) - an email always renders
# on a light background, regardless of which theme the recipient's app is in.
PAPER = (245, 243, 236, 255)   # --eco-bg (light)
SOIL = (95, 107, 88, 255)      # --eco-text-muted (light) - a plain earth tone
GREEN = (31, 122, 68, 255)     # --eco-primary (light)
GREEN_SOFT = (79, 190, 128, 255)  # dark-theme primary, used here as a lighter leaf tone

GROUND_Y = int(BIG * 0.74)
STEM_TOP_Y = int(BIG * 0.28)
STEM_X = BIG // 2
STEM_WIDTH = int(BIG * 0.045)

GROW_FRAMES = 26
LEAF_FRAMES = 14
HOLD_FRAMES = 30
SWAY_FRAMES = 18  # a gentle sway once fully grown, before the loop restarts


def _base_frame():
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # the soil mound the stem grows out of
    mound_w = BIG * 0.34
    draw.ellipse(
        [STEM_X - mound_w / 2, GROUND_Y - BIG * 0.04, STEM_X + mound_w / 2, GROUND_Y + BIG * 0.06],
        fill=SOIL,
    )
    return img, draw


def _stem_point(t, sway=0.0):
    """A point t (0-1) of the way up the stem, with an optional lean in radians."""
    y = GROUND_Y - (GROUND_Y - STEM_TOP_Y) * t
    # a gentle S-curve rather than a ramrod-straight stem
    lean = math.sin(t * math.pi) * BIG * 0.05 + sway * (t ** 1.5) * BIG * 0.06
    x = STEM_X + lean
    return x, y


def _draw_stem(draw, up_to_t, sway=0.0, width=STEM_WIDTH):
    steps = 24
    points = [_stem_point(up_to_t * i / steps, sway) for i in range(steps + 1)]
    draw.line(points, fill=GREEN, width=width, joint="curve")
    # rounded cap at the growing tip
    tip = points[-1]
    r = width / 2
    draw.ellipse([tip[0] - r, tip[1] - r, tip[0] + r, tip[1] + r], fill=GREEN)


def _draw_leaf(target_img, origin, angle_degrees, length, width, color):
    """
    A smooth, tapered leaf - drawn as an ellipse pinched at both ends on its
    own small canvas, rotated, then pasted onto the frame. Rotating a raster
    patch is what actually gets a smoothly curved, angled leaf out of Pillow;
    ImageDraw has no primitive for a rotated ellipse or a bezier-curved
    outline, and approximating one with a straight-edged polygon is what
    produced the faceted, gem-like look this replaced.
    """
    if length <= 0 or width <= 0:
        return

    pad = 4
    patch_w, patch_h = int(width) + pad * 2, int(length) + pad * 2
    patch = Image.new("RGBA", (patch_w, patch_h), (0, 0, 0, 0))
    patch_draw = ImageDraw.Draw(patch)

    # The leaf points "up" (+y) on its own canvas before rotation: a pointed
    # almond/vesica outline, sampled as a polygon along its full length so the
    # curve tapers to a point at both the tip and where it meets the stem,
    # rather than the previous version which only ever drew a round blob
    # sized to `width` and never actually reached `length`.
    cx = patch_w / 2
    steps = 20
    right_side = []
    for i in range(steps + 1):
        t = i / steps
        half_w = (width / 2) * math.sin(math.pi * t)
        y = pad + length * (1 - t)
        right_side.append((cx + half_w, y))
    left_side = [(cx - (x - cx), y) for x, y in reversed(right_side)]
    patch_draw.polygon(right_side + left_side, fill=color)

    # angle_degrees is measured from the +x axis, standard maths convention;
    # PIL's rotate() turns counter-clockwise from +y "up", so this converts
    rotated = patch.rotate(angle_degrees - 90, resample=Image.BICUBIC, expand=True)

    paste_x = int(origin[0] - rotated.width / 2)
    paste_y = int(origin[1] - rotated.height + pad)
    target_img.alpha_composite(rotated, (paste_x, paste_y))


def build_frames():
    frames = []

    # --- the stem grows from nothing to full height ---
    for i in range(GROW_FRAMES):
        progress = (i + 1) / GROW_FRAMES
        img, draw = _base_frame()
        _draw_stem(draw, progress)
        frames.append(img)

    # --- two leaves unfurl near the top of the stem, one per side ---
    leaf_origin_t = 0.78  # how far up the stem the leaves attach
    origin = _stem_point(leaf_origin_t)
    max_len = BIG * 0.22
    max_w = BIG * 0.075

    for i in range(LEAF_FRAMES):
        progress = (i + 1) / LEAF_FRAMES
        img, draw = _base_frame()
        _draw_stem(draw, 1.0)
        # eased growth - fast start, gentle finish
        eased = 1 - (1 - progress) ** 2
        _draw_leaf(img, origin, 145, max_len * eased, max_w * eased, GREEN)
        _draw_leaf(img, origin, 35, max_len * eased, max_w * eased, GREEN_SOFT)
        frames.append(img)

    # --- hold on the fully grown sprout ---
    full_grown, draw = _base_frame()
    _draw_stem(draw, 1.0)
    _draw_leaf(full_grown, origin, 145, max_len, max_w, GREEN)
    _draw_leaf(full_grown, origin, 35, max_len, max_w, GREEN_SOFT)
    for _ in range(HOLD_FRAMES):
        frames.append(full_grown.copy())

    # --- a gentle sway, then back to still - keeps the loop feeling alive
    #     without ever being distracting ---
    for i in range(SWAY_FRAMES):
        t = i / SWAY_FRAMES
        sway = math.sin(t * 2 * math.pi) * 0.4
        img, draw = _base_frame()
        _draw_stem(draw, 1.0, sway=sway)
        swayed_origin = _stem_point(leaf_origin_t, sway=sway)
        _draw_leaf(img, swayed_origin, 145, max_len, max_w, GREEN)
        _draw_leaf(img, swayed_origin, 35, max_len, max_w, GREEN_SOFT)
        frames.append(img)

    return frames


def main():
    frames = build_frames()

    composited = []
    for frame in frames:
        downscaled = frame.resize((SIZE, SIZE), Image.LANCZOS)
        flattened = Image.new("RGBA", (SIZE, SIZE), PAPER)
        flattened.alpha_composite(downscaled)
        composited.append(flattened.convert("RGB"))

    out_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "email"
    )
    out_dir = os.path.normpath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    gif_path = os.path.join(out_dir, "donation-thanks.gif")
    composited[0].save(
        gif_path,
        save_all=True,
        append_images=composited[1:],
        duration=42,
        loop=0,
        optimize=True,
    )

    composited[GROW_FRAMES + LEAF_FRAMES - 1].save(os.path.join(out_dir, "donation-thanks.png"))

    print(f"Wrote {gif_path} ({os.path.getsize(gif_path) / 1024:.1f} KB, {len(composited)} frames)")


if __name__ == "__main__":
    main()
