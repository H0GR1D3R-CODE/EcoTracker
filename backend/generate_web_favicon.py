"""
EcoTrack/backend/generate_web_favicon.py

One-off asset generator (same category as generate_app_icons.py,
generate_og_image.py - not part of the running app). Regenerates
frontend/public/icons/icon-{size}.webp, the favicon and PWA manifest icon
set actually served to browsers.

WHY THIS EXISTS SEPARATELY FROM generate_app_icons.py
That file draws the Capacitor MOBILE app's icon (Android/iOS build inputs,
written to frontend/resources/) from its own hand-drawn leaf shape. This
file draws the browser-facing set independently - the two have never been
required to match pixel-for-pixel (see generate_app_icons.py's own
docstring), so swapping this one's mark is a self-contained change.

THE SHAPE ITSELF: THE REAL LUCIDE PATH, NOT A REDRAWN APPROXIMATION
Parsed directly from frontend/node_modules/lucide-react/dist/esm/icons/
sprout.js's own four SVG path strings (its 24x24 viewBox, unchanged) via
svgpathtools - a sprout, not the navbar's leaf: asked for explicitly as a
"something else" favicon, distinct from Navbar.jsx's <Leaf /> logo on
purpose, so a browser tab is never mistaken for the in-app brand mark.
Lucide's icon is four separate stroke paths, not one filled blob:
  - two closed paths (the two young leaves) - filled solid, same as the
    old leaf favicon's single blob
  - two open paths (the stem, and the short ground line at its base) -
    rendered as thick rounded strokes, since Pillow has no "fill from an
    open path" operation and a hairline at browser-tab size would vanish
    the same way the old leaf's vein-as-a-line would have without its own
    boosted stroke width.

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
# web) still share one green even though the mark itself now differs.
BG_COLOR = (31, 122, 68, 255)
MARK_COLOR = (255, 255, 255, 255)

# The four path strings straight from sprout.js, 24x24 viewBox
GROUND_D = "M7 20h10"
STEM_D = "M10 20c5.5-2.5.8-6.4 3-10"
LEAF_LEFT_D = "M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"
LEAF_RIGHT_D = "M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"

OUTPUT_SIZES = [16, 32, 48, 72, 96, 128, 192, 256, 512]
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
    box of all of them - the leaves, stem and ground line must move
    together, not be independently centred, or the stem drifts away from
    the leaves it is meant to be growing out of."""
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


def _draw_stroke(draw, points_px, width):
    """A rounded-cap, rounded-join stroke along a sampled point list -
    ImageDraw.line's own joints look faceted on a tight curve like the
    stem, so this draws overlapping circles at every sample point plus the
    connecting line segments, the same trick generate_app_icons.py's
    splash art uses for its own curves."""
    draw.line(points_px, fill=MARK_COLOR, width=width, joint="curve")
    r = width / 2
    for x, y in points_px:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=MARK_COLOR)


def _draw_master_icon():
    """The 512x512-at-8x master render, downscaled per output size below.
    One master for every size - the two leaves and the boosted-width stem
    and ground line all stay legible down to 16px without a separate
    simplified version, unlike the old leaf favicon's fine vein line."""
    groups = {
        "ground": _sample_path(GROUND_D),
        "stem": _sample_path(STEM_D),
        "leaf_left": _sample_path(LEAF_LEFT_D),
        "leaf_right": _sample_path(LEAF_RIGHT_D),
    }
    transform = _fit_transform(list(groups.values()), CANVAS, margin_ratio=0.18)
    px = {name: [transform(p) for p in points] for name, points in groups.items()}

    img = Image.new("RGBA", (CANVAS, CANVAS), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Leaves first (filled blobs), then the stem and ground line on top -
    # matches the stacking order lucide itself draws these paths in.
    draw.polygon(px["leaf_left"], fill=MARK_COLOR)
    draw.polygon(px["leaf_right"], fill=MARK_COLOR)

    # Lucide's own stroke is 2 of a 24-unit viewBox (~8.3%); boosted here so
    # the stem and ground line read as bold marks rather than hairlines
    # once downscaled to a 16px browser tab.
    stroke_width = round(CANVAS * 0.075)
    _draw_stroke(draw, px["stem"], stroke_width)
    _draw_stroke(draw, px["ground"], stroke_width)

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
