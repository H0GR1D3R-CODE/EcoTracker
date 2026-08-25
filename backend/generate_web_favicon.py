"""
EcoTrack/backend/generate_web_favicon.py

One-off asset generator (same category as generate_app_icons.py,
generate_og_image.py - not part of the running app). Regenerates
frontend/public/icons/icon-{size}.webp, the favicon and PWA manifest icon
set actually served to browsers.

WHY THIS EXISTS SEPARATELY FROM generate_app_icons.py
That file draws the Capacitor MOBILE app's icon (Android/iOS build inputs,
written to frontend/resources/) from a hand-drawn "vesica" leaf shape of its
own. No script ever generated frontend/public/icons/ - those webp files
predate this one and used a DIFFERENT abstract leaf silhouette that, once
compared side by side, did not actually match the mark the app itself uses
everywhere else: Navbar.jsx's logo is literally lucide-react's <Leaf />
icon. A visitor's browser tab showing a different leaf than the one next to
"EcoTrack" in the app itself is exactly the mismatch this fixes.

THE SHAPE ITSELF: THE REAL LUCIDE PATH, NOT A REDRAWN APPROXIMATION
Parsed directly from frontend/node_modules/lucide-react/dist/esm/icons/
leaf.js's own two SVG path strings (its 24x24 viewBox, unchanged) via
svgpathtools - not hand-fit polygon math like generate_app_icons.py's
_leaf_path, because the whole point here is pixel-faithful correspondence
to the actual rendered navbar icon, not merely "a leaf that resembles it".
Lucide's icon is a stroke outline (2px cutout + a vein line down the
middle); rendered here as a solid filled glyph (a stroke outline does not
read cleanly at 48px) with the vein cut back through as a thin green line,
the same "solid glyph, one or two carved detail lines" adaptation most app
icons make from an outline source mark.

Requires Pillow and svgpathtools (`pip install pillow svgpathtools`) -
generation-time tools only, not runtime dependencies, so deliberately not
in requirements.txt (same reasoning generate_app_icons.py's own docstring
already gives for Pillow alone).
"""

import os

from PIL import Image, ImageDraw
from svgpathtools import parse_path

SCALE = 8  # rendered large and downscaled per output size, for anti-aliased curves
CANVAS = 512 * SCALE

# Exact value from frontend/src/index.css's light --eco-primary - the same
# constant generate_app_icons.py uses, so the two icon families (mobile,
# web) share one green even though this script draws its leaf differently.
BG_COLOR = (31, 122, 68, 255)
LEAF_COLOR = (255, 255, 255, 255)

# The two path strings straight from leaf.js, 24x24 viewBox
LEAF_BLOB_D = "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
LEAF_VEIN_D = "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"

OUTPUT_SIZES = [48, 72, 96, 128, 192, 256, 512]
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "icons")


def _sample_path(d, steps=240):
    """A parsed SVG path's points, evenly sampled along its length (not
    along the parameter t alone - t-uniform sampling bunches points on the
    tight curves and starves the flat ones, visibly faceting the result)."""
    path = parse_path(d)
    total_length = path.length()
    points = []
    for i in range(steps + 1):
        target = (i / steps) * total_length
        t = path.ilength(target)
        p = path.point(t)
        points.append((p.real, p.imag))
    return points


def _fit_transform(points_groups, canvas_size, margin_ratio=0.16):
    """One shared scale+offset for every group, fit to the combined bounding
    box of all of them - the leaf and its vein must move together, not be
    independently centred, or the vein drifts off the blob it is meant to sit in."""
    all_points = [p for group in points_groups for p in group]
    xs = [p[0] for p in all_points]
    ys = [p[1] for p in all_points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span = max(max_x - min_x, max_y - min_y)

    usable = canvas_size * (1 - 2 * margin_ratio)
    scale = usable / span
    cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2

    def transform(pt):
        x, y = pt
        return (
            canvas_size / 2 + (x - cx) * scale,
            canvas_size / 2 + (y - cy) * scale,
        )

    return transform


def _draw_master_icon():
    """The 512x512-at-8x master render, downscaled per output size below."""
    blob_points = _sample_path(LEAF_BLOB_D)
    vein_points = _sample_path(LEAF_VEIN_D)

    transform = _fit_transform([blob_points, vein_points], CANVAS)
    blob_px = [transform(p) for p in blob_points]
    vein_px = [transform(p) for p in vein_points]

    img = Image.new("RGBA", (CANVAS, CANVAS), BG_COLOR)
    draw = ImageDraw.Draw(img)

    draw.polygon(blob_px, fill=LEAF_COLOR)

    # The vein, cut back through in the background green - a stroke width
    # proportional to the canvas so it stays a fine line at every output
    # size rather than a fixed pixel count that would look chunky once
    # downscaled from an 8x-scaled master.
    vein_width = max(2, round(CANVAS * 0.018))
    draw.line(vein_px, fill=BG_COLOR, width=vein_width, joint="curve")
    # Rounded line caps - ImageDraw.line has none of its own
    r = vein_width / 2
    for x, y in (vein_px[0], vein_px[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=BG_COLOR)

    return img


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    master = _draw_master_icon()

    for size in OUTPUT_SIZES:
        resized = master.resize((size, size), Image.LANCZOS)
        out_path = os.path.join(OUTPUT_DIR, f"icon-{size}.webp")
        resized.save(out_path, "WEBP", quality=92)
        print(f"wrote {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()
