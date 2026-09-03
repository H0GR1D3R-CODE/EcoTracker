"""
EcoTrack/backend/generate_welcome_animation.py

One-off asset generator, not part of the running app - the same category as
generate_reset_animation.py and generate_donation_animation.py, and built
the exact same way (draw at 4x, downscale for anti-aliasing, composite onto
the light theme's own paper colour so no client's transparency handling can
put a black or white box around it). Draws the small looping animation at
the top of the new-account welcome email (email_service.py), and writes it
straight into frontend/public/email/, where Vite serves it untouched at
PUBLIC_APP_URL/email/welcome.gif once the frontend is deployed.

WHAT IT DRAWS, AND WHY
A seed splits and a stem rises out of it, then two leaves unfurl at the top
- the exact same seed-to-sprout visual grammar GrowingTree.jsx's own reward
tree already uses for a brand-new account's first stage ("Seed"), so a
welcome email and the first thing a new user actually sees inside the app
are drawing on the same idea rather than two unrelated pieces of art. A
literal "day one" image for a "day one" email.

Re-run this file (`python generate_welcome_animation.py`) any time the
design needs to change; it always overwrites the same two output files.

Requires Pillow (`pip install pillow`) - a generation-time tool, not a
runtime dependency of the Flask app, so it is deliberately NOT in
requirements.txt.
"""

import math
import os

from PIL import Image, ImageDraw

# Rendered at 4x and downscaled, which is what actually anti-aliases the
# curved leaf shapes and the stem's own slight lean - Pillow's own drawing
# primitives have no anti-aliasing at native resolution.
SIZE = 160
SCALE = 4
BIG = SIZE * SCALE

# The light theme's own measured values (index.css), exactly matching
# generate_reset_animation.py's own palette - an email always renders on a
# light background, so these are the correct values regardless of which
# theme the recipient's app is currently in.
PAPER = (245, 243, 236, 255)   # --eco-bg (light)
SOIL = (94, 66, 42, 255)       # a warm soil brown, not in the app's own
                                # palette (nothing else in this product draws
                                # dirt) - kept muted so it reads as "ground",
                                # not as its own competing colour
GREEN = (31, 122, 68, 255)     # --eco-primary (light)
LEAF_LIGHT = (88, 180, 131, 255)  # --cat-transport (light) - already the
                                    # app's own "second green", used here so
                                    # the two leaves read as two tones of the
                                    # same brand rather than one flat shape

GROUND_Y = int(BIG * 0.66)
STEM_TOP_Y = int(BIG * 0.30)
CX = BIG // 2
STEM_WIDTH = int(BIG * 0.045)

SEED_FRAMES = 6
STEM_FRAMES = 16
LEAF_FRAMES = 14
END_HOLD_FRAMES = 26

FRAME_MS = 55


def _base_frame():
    """A transparent frame with just the soil line drawn on it."""
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.line(
        [(BIG * 0.18, GROUND_Y), (BIG * 0.82, GROUND_Y)],
        fill=SOIL,
        width=int(BIG * 0.018),
    )
    return img, draw


def _lerp(a, b, t):
    return a + (b - a) * t


def _leaf(draw, base, tip, spread, colour, progress):
    """
    One leaf as two curved edges meeting at a tip - drawn as a polygon
    between two quadratic-ish arcs so it reads as a real leaf silhouette,
    not a triangle. `progress` (0-1) scales the whole leaf from nothing at
    the base up to its full size, the same "shape draws itself in" idea
    generate_reset_animation.py's checkmark uses.
    """
    if progress <= 0:
        return
    current_tip = (
        _lerp(base[0], tip[0], progress),
        _lerp(base[1], tip[1], progress),
    )
    mid = ((base[0] + current_tip[0]) / 2, (base[1] + current_tip[1]) / 2)
    # Perpendicular offset from the base->tip line, scaled by how far the
    # leaf has grown - this is what bulges the two edges outward into a
    # believable leaf shape instead of a straight blade.
    dx, dy = current_tip[0] - base[0], current_tip[1] - base[1]
    length = math.hypot(dx, dy) or 1
    perp = (-dy / length, dx / length)
    bulge = spread * progress
    edge_a = (mid[0] + perp[0] * bulge, mid[1] + perp[1] * bulge)
    edge_b = (mid[0] - perp[0] * bulge, mid[1] - perp[1] * bulge)
    draw.polygon([base, edge_a, current_tip, edge_b], fill=colour)


def build_frames():
    frames = []

    # --- the seed sits, then splits (a small widening gap) before the stem starts ---
    seed_r = BIG * 0.028
    for i in range(SEED_FRAMES):
        img, draw = _base_frame()
        gap = (i / (SEED_FRAMES - 1)) * seed_r * 0.9
        draw.ellipse(
            [CX - seed_r - gap, GROUND_Y - seed_r, CX - gap, GROUND_Y + seed_r],
            fill=SOIL,
        )
        draw.ellipse(
            [CX + gap, GROUND_Y - seed_r, CX + seed_r + gap, GROUND_Y + seed_r],
            fill=SOIL,
        )
        frames.append(img)

    # --- the stem rises out of the split, with a slight natural lean ---
    for i in range(STEM_FRAMES):
        progress = (i + 1) / STEM_FRAMES
        img, draw = _base_frame()
        current_top_y = _lerp(GROUND_Y, STEM_TOP_Y, progress)
        # A gentle S-curve, not a straight line - a single control point
        # pulled sideways part-way up is enough to read as organic growth.
        lean = math.sin(progress * math.pi) * BIG * 0.035
        control = (CX + lean, (GROUND_Y + current_top_y) / 2)
        top = (CX, current_top_y)
        # Approximate the curve with short segments - Pillow has no native
        # quadratic-curve stroke primitive.
        steps = 14
        points = []
        for s in range(steps + 1):
            t = s / steps
            x = (1 - t) ** 2 * CX + 2 * (1 - t) * t * control[0] + t ** 2 * top[0]
            y = (1 - t) ** 2 * GROUND_Y + 2 * (1 - t) * t * control[1] + t ** 2 * top[1]
            points.append((x, y))
        draw.line(points, fill=GREEN, width=STEM_WIDTH, joint="curve")
        r = STEM_WIDTH / 2
        draw.ellipse([top[0] - r, top[1] - r, top[0] + r, top[1] + r], fill=GREEN)
        frames.append(img)

    stem_top = points[-1]

    # --- two leaves unfurl from the top of the stem, opposite sides ---
    left_base = stem_top
    right_base = stem_top
    left_tip = (stem_top[0] - BIG * 0.20, stem_top[1] - BIG * 0.09)
    right_tip = (stem_top[0] + BIG * 0.17, stem_top[1] - BIG * 0.15)

    for i in range(LEAF_FRAMES):
        progress = (i + 1) / LEAF_FRAMES
        img, draw = _base_frame()
        draw.line(points, fill=GREEN, width=STEM_WIDTH, joint="curve")
        r = STEM_WIDTH / 2
        draw.ellipse(
            [stem_top[0] - r, stem_top[1] - r, stem_top[0] + r, stem_top[1] + r],
            fill=GREEN,
        )
        # The right leaf trails the left by a beat, so they do not unfurl in
        # lockstep - a small thing, but perfectly synchronised motion is
        # what reads as mechanical rather than grown.
        left_progress = min(1.0, progress * 1.25)
        right_progress = max(0.0, min(1.0, (progress - 0.18) * 1.25))
        _leaf(draw, left_base, left_tip, BIG * 0.075, GREEN, left_progress)
        _leaf(draw, right_base, right_tip, BIG * 0.06, LEAF_LIGHT, right_progress)
        frames.append(img)

    # --- final hold on the grown sprout ---
    final = frames[-1].copy()
    for _ in range(END_HOLD_FRAMES):
        frames.append(final.copy())

    return frames


def main():
    frames = build_frames()

    # Downscale for anti-aliasing, then flatten onto the paper colour so
    # older clients that mishandle GIF transparency (Outlook desktop chief
    # among them) show paper instead of a black or white box.
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

    gif_path = os.path.join(out_dir, "welcome.gif")
    composited[0].save(
        gif_path,
        save_all=True,
        append_images=composited[1:],
        duration=FRAME_MS,
        loop=0,
        optimize=True,
    )

    composited[-1].save(os.path.join(out_dir, "welcome.png"))

    print(f"Wrote {gif_path} ({os.path.getsize(gif_path) / 1024:.1f} KB, {len(composited)} frames)")


if __name__ == "__main__":
    main()
