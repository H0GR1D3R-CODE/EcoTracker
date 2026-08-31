"""
EcoTrack/backend/generate_app_icons.py

One-off asset generator (same category as generate_reset_animation.py and
generate_donation_animation.py - not part of the running app). Draws the
source images the Capacitor mobile app's icon/splash screens are built from,
and writes them into frontend/resources/, where `npx capacitor-assets
generate` reads them to produce every actual icon/splash size both Android
and iOS need.

WHAT IT DRAWS, AND WHY
The same leaf mark used everywhere else in the brand (the favicon, the
"EcoTrack" wordmark's leading glyph) - drawn here as its own flat vector
shape rather than reused from anywhere, since nothing else in the repo is
a clean square mark at icon resolution; generate_web_favicon.py draws the
same leaf idea independently, straight from lucide's own path, for the
browser-facing set. Three source files, per capacitor-assets' convention:
  - icon-background.png / icon-foreground.png : Android adaptive icon
    layers (the OS masks these into a circle, squircle, etc. itself, so the
    foreground leaf sits inside a safe zone well clear of the edges).
  - icon.png : a flattened, fully opaque combination of the two, for iOS
    (which applies its own corner rounding and rejects icons with alpha).
  - splash.png / splash-dark.png : the launch screen, light and dark theme,
    exact same colour values as index.css's light/dark --eco-bg and
    --eco-primary so the launch screen is not a foreign palette from the
    app it is about to open into.

Re-run this file (`python generate_app_icons.py`) any time the mark needs to
change; it always overwrites the same five output files.

Requires Pillow (`pip install pillow`) - a generation-time tool, not a
runtime dependency of the Flask app, so it is deliberately NOT in
requirements.txt.
"""

import math
import os

from PIL import Image, ImageDraw

SCALE = 4  # rendered at 4x and downscaled, for anti-aliased curves

ICON_SIZE = 1024 * SCALE
SPLASH_SIZE = 2732 * SCALE

# Exact values from frontend/src/index.css
LIGHT_BG = (245, 243, 236, 255)     # --eco-bg (light) - warm linen/paper
LIGHT_PRIMARY = (31, 122, 68, 255)  # --eco-primary (light)
DARK_BG = (11, 15, 10, 255)         # --eco-bg (dark) - deep forest base
DARK_PRIMARY = (79, 190, 128, 255)  # --eco-primary (dark)
WHITE = (255, 255, 255, 255)


def _leaf_path(cx, cy, r):
    """
    A single rounded leaf shape, point at the top, centred on (cx, cy) with
    "radius" r - built the same way the leaf on the donation animation's
    sprout is (generate_donation_animation.py's _draw_leaf): a vesica/almond
    outline sampled as a polygon, since Pillow has no rotated-teardrop
    primitive of its own.
    """
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


def _icon_layers():
    """Returns (background_img, foreground_img) at ICON_SIZE."""
    background = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), LIGHT_PRIMARY)

    foreground = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    fg_draw = ImageDraw.Draw(foreground)
    cx, cy = ICON_SIZE / 2, ICON_SIZE / 2
    # Android's adaptive-icon safe zone is the inner ~66% of the canvas -
    # the mark is sized well within that so no launcher mask ever clips it.
    r = ICON_SIZE * 0.19
    fg_draw.polygon(_leaf_path(cx, cy, r), fill=WHITE)

    return background, foreground


def _splash(bg_color, mark_color):
    img = Image.new("RGBA", (SPLASH_SIZE, SPLASH_SIZE), bg_color)
    draw = ImageDraw.Draw(img)
    cx, cy = SPLASH_SIZE / 2, SPLASH_SIZE / 2
    r = SPLASH_SIZE * 0.09
    draw.polygon(_leaf_path(cx, cy, r), fill=mark_color)
    return img


def main():
    out_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "resources"
    )
    out_dir = os.path.normpath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    background, foreground = _icon_layers()

    # Flattened icon.png for iOS: background + foreground composited, then
    # downscaled to 1024 and forced fully opaque (iOS rejects alpha in icons).
    flattened = Image.alpha_composite(background, foreground)
    icon = flattened.resize((1024, 1024), Image.LANCZOS).convert("RGB")
    icon.save(os.path.join(out_dir, "icon.png"))

    background.resize((1024, 1024), Image.LANCZOS).convert("RGB").save(
        os.path.join(out_dir, "icon-background.png")
    )
    foreground.resize((1024, 1024), Image.LANCZOS).save(
        os.path.join(out_dir, "icon-foreground.png")
    )

    splash_light = _splash(LIGHT_BG, LIGHT_PRIMARY).resize((2732, 2732), Image.LANCZOS).convert("RGB")
    splash_light.save(os.path.join(out_dir, "splash.png"))

    splash_dark = _splash(DARK_BG, DARK_PRIMARY).resize((2732, 2732), Image.LANCZOS).convert("RGB")
    splash_dark.save(os.path.join(out_dir, "splash-dark.png"))

    print(f"Wrote icon.png, icon-background.png, icon-foreground.png, splash.png, splash-dark.png to {out_dir}")


if __name__ == "__main__":
    main()
