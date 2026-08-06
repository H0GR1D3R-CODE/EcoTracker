"""
EcoTrack/backend/generate_reset_animation.py

One-off asset generator, not part of the running app - the same category as
seed_factors.py. Draws the small looping animation shown at the top of the
password-reset email (email_service.py) and writes it straight into
frontend/public/email/, where Vite serves it untouched as a static file at
PUBLIC_APP_URL/email/reset-confirm.gif once the frontend is deployed.

WHAT IT DRAWS, AND WHY
A ring sweeps closed clockwise, in the same brand green as the rest of the
product, with an amber dot leading the sweep - the calibration rail's own
needle colour, doing the same job here: marking the current position on a
scale. Once the ring closes, a checkmark draws inside it. That checkmark
means "your request has been received", not "your password has been
changed" - the email's own copy makes the distinction explicit, so the
animation cannot be misread as claiming the password already changed.

Re-run this file (`python generate_reset_animation.py`) any time the design
needs to change; it always overwrites the same two output files.

Requires Pillow (`pip install pillow`) - a generation-time tool, not a
runtime dependency of the Flask app, so it is deliberately NOT in
requirements.txt.
"""

import math
import os

from PIL import Image, ImageDraw

# Rendered at 4x and downscaled, which is what actually anti-aliases the
# curved ring and the diagonal checkmark strokes - Pillow's own drawing
# primitives have no anti-aliasing at native resolution.
SIZE = 160
SCALE = 4
BIG = SIZE * SCALE

# The light theme's own measured values (index.css), not arbitrary colours -
# an email always renders on a light background, so these are the correct
# ones regardless of which theme the recipient's app is currently in.
PAPER = (245, 243, 236, 255)   # --eco-bg (light)
TRACK = (31, 42, 26, 40)       # --rule (light), alpha over the paper
GREEN = (31, 122, 68, 255)     # --eco-primary (light)
AMBER = (150, 96, 0, 255)      # --readout (light)

CX, CY = BIG // 2, BIG // 2
RADIUS = int(BIG * 0.34)
STROKE = int(BIG * 0.075)

RING_FRAMES = 22
HOLD_FRAMES = 5
CHECK_FRAMES = 10
END_HOLD_FRAMES = 26

FRAME_MS = 45


def _base_frame():
    """A transparent frame with just the empty track ring drawn on it."""
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    bbox = [CX - RADIUS, CY - RADIUS, CX + RADIUS, CY + RADIUS]
    draw.arc(bbox, 0, 360, fill=TRACK, width=STROKE)
    return img, draw, bbox


def _leading_dot(draw, angle_degrees):
    """The amber marker riding the leading edge of the sweep."""
    angle = math.radians(angle_degrees)
    x = CX + RADIUS * math.cos(angle)
    y = CY + RADIUS * math.sin(angle)
    r = STROKE * 0.62
    draw.ellipse([x - r, y - r, x + r, y + r], fill=AMBER)


def _lerp(point_a, point_b, t):
    return (
        point_a[0] + (point_b[0] - point_a[0]) * t,
        point_a[1] + (point_b[1] - point_a[1]) * t,
    )


def build_frames():
    frames = []

    # --- the ring sweeps closed, clockwise from the top ---
    for i in range(RING_FRAMES):
        progress = (i + 1) / RING_FRAMES
        img, draw, bbox = _base_frame()
        start_angle = -90
        end_angle = start_angle + 360 * progress
        draw.arc(bbox, start_angle, end_angle, fill=GREEN, width=STROKE)
        _leading_dot(draw, end_angle)
        frames.append(img)

    # --- a short hold on the completed ring before the check begins ---
    for _ in range(HOLD_FRAMES):
        img, draw, bbox = _base_frame()
        draw.arc(bbox, -90, 270, fill=GREEN, width=STROKE)
        frames.append(img)

    # --- the checkmark draws itself in two strokes ---
    p1 = (CX - RADIUS * 0.42, CY + RADIUS * 0.02)
    p2 = (CX - RADIUS * 0.10, CY + RADIUS * 0.34)
    p3 = (CX + RADIUS * 0.46, CY - RADIUS * 0.30)
    check_width = int(STROKE * 0.9)

    leg_one_length = math.dist(p1, p2)
    leg_two_length = math.dist(p2, p3)
    total_length = leg_one_length + leg_two_length

    def _round_caps(draw, points):
        for point in points:
            r = check_width / 2
            draw.ellipse([point[0] - r, point[1] - r, point[0] + r, point[1] + r], fill=GREEN)

    for i in range(CHECK_FRAMES):
        progress = (i + 1) / CHECK_FRAMES
        img, draw, bbox = _base_frame()
        draw.arc(bbox, -90, 270, fill=GREEN, width=STROKE)

        travelled = total_length * progress
        if travelled <= leg_one_length:
            current_end = _lerp(p1, p2, travelled / leg_one_length)
            draw.line([p1, current_end], fill=GREEN, width=check_width, joint="curve")
            _round_caps(draw, (p1, current_end))
        else:
            draw.line([p1, p2], fill=GREEN, width=check_width, joint="curve")
            remaining = travelled - leg_one_length
            current_end = _lerp(p2, p3, remaining / leg_two_length)
            draw.line([p2, current_end], fill=GREEN, width=check_width, joint="curve")
            _round_caps(draw, (p1, p2, current_end))

        frames.append(img)

    # --- final hold on the completed checkmark ---
    img, draw, bbox = _base_frame()
    draw.arc(bbox, -90, 270, fill=GREEN, width=STROKE)
    draw.line([p1, p2], fill=GREEN, width=check_width, joint="curve")
    draw.line([p2, p3], fill=GREEN, width=check_width, joint="curve")
    _round_caps(draw, (p1, p2, p3))
    for _ in range(END_HOLD_FRAMES):
        frames.append(img.copy())

    return frames


def main():
    frames = build_frames()

    # Downscale for anti-aliasing, then flatten onto the paper colour so older
    # clients that mishandle GIF transparency (Outlook desktop chief among
    # them) show paper instead of a black or white box around the ring.
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

    gif_path = os.path.join(out_dir, "reset-confirm.gif")
    composited[0].save(
        gif_path,
        save_all=True,
        append_images=composited[1:],
        duration=FRAME_MS,
        loop=0,
        optimize=True,
    )

    # A static PNG of the completed state, for reference and for anything
    # that wants a non-animated version later.
    composited[-1].save(os.path.join(out_dir, "reset-confirm.png"))

    print(f"Wrote {gif_path} ({os.path.getsize(gif_path) / 1024:.1f} KB, {len(composited)} frames)")


if __name__ == "__main__":
    main()
