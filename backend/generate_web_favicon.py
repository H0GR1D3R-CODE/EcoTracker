"""
EcoTrack/backend/generate_web_favicon.py

One-off asset generator (same category as generate_app_icons.py,
generate_og_image.py - not part of the running app). Regenerates
frontend/public/icons/icon-{size}.webp, the favicon and PWA manifest icon
set actually served to browsers.

THE MARK: THE SAME LEAF AS THE NAVBAR, ON THE SAME PAPER
Two changes back this became a sprout, deliberately distinct from
Navbar.jsx's <Leaf /> logo. Reverted on request: shown a screenshot of the
navbar wordmark itself and asked for "exactly like this" - so this is once
again lucide-react's own Leaf path, parsed straight out of
frontend/node_modules/lucide-react/dist/esm/icons/leaf.js (its 24x24
viewBox, unchanged) via svgpathtools, not a redrawn approximation.

WHY A CREAM GROUND, NOT A GREEN TILE
The earlier leaf favicon (and the sprout after it) sat on a solid green
square - the ordinary app-icon-tile convention. Asked for "formal and
premium" this time, which reads differently: a colour-blocked tile is the
loud, generic-app convention; the mark actually looks like this - green
ink on paper - everywhere else it appears (the navbar, the footer, on the
page's own --eco-bg). So the favicon's ground is that exact light-theme
background colour instead of the brand green, with the leaf drawn in the
brand green on top of it. Still a filled solid glyph rather than lucide's
own stroke outline - a 2px stroke does not survive down to 16px, the same
reason the original version of this file gave.

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

# Exact values from frontend/src/index.css's [data-theme='light'] block -
# --eco-bg and --eco-primary. The favicon never switches with the visitor's
# theme (it's a static file), so it fixes on light - the theme the mark
# itself was designed against (5.94:1 contrast, per that block's own
# comment) and the one the reference screenshot showed.
BG_COLOR = (239, 237, 228, 255)   # --eco-bg  #efede4, warm linen
LEAF_COLOR = (29, 107, 62, 255)   # --eco-primary  #1d6b3e, deep forest

# The two path strings straight from leaf.js, 24x24 viewBox
LEAF_BLOB_D = "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
LEAF_VEIN_D = "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"

# 16 and 32 render from their own SIMPLE master (see _draw_master_icon's
# detailed=False branch) rather than being Lanczos-downscaled from the same
# 512px master everything else uses. The vein line survives that downscale
# as a few stray anti-aliased pixels, not a line - at actual browser-tab
# size that reads as visual noise on the leaf rather than a leaf marking.
TINY_SIZES = {16, 32}
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


def _draw_master_icon(detailed=True, margin_ratio=0.16):
    """
    The 512x512-at-8x master render, downscaled per output size below.

    detailed=False drops the vein line and gives the blob a touch more room
    (a smaller margin_ratio) - what actually reads as "a leaf" at 16-32px is
    the bold silhouette, and the vein has no pixels left to survive that
    downscale anyway, so keeping it there only adds speckling.
    """
    blob_points = _sample_path(LEAF_BLOB_D)
    vein_points = _sample_path(LEAF_VEIN_D)

    fit_groups = [blob_points, vein_points] if detailed else [blob_points]
    transform = _fit_transform(fit_groups, CANVAS, margin_ratio=margin_ratio)
    blob_px = [transform(p) for p in blob_points]

    img = Image.new("RGBA", (CANVAS, CANVAS), BG_COLOR)
    draw = ImageDraw.Draw(img)

    draw.polygon(blob_px, fill=LEAF_COLOR)

    if detailed:
        vein_px = [transform(p) for p in vein_points]
        # The vein, cut back through in the ground colour - a stroke width
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
    master = _draw_master_icon(detailed=True)
    tiny_master = _draw_master_icon(detailed=False, margin_ratio=0.11)

    for size in OUTPUT_SIZES:
        source = tiny_master if size in TINY_SIZES else master
        resized = source.resize((size, size), Image.LANCZOS)
        out_path = os.path.join(OUTPUT_DIR, f"icon-{size}.webp")
        resized.save(out_path, "WEBP", quality=92)
        print(f"wrote {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()
