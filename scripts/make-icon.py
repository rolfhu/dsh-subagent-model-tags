"""Render assets/icon-180.png from the same geometry as icon.svg.

The storefront catalog only accepts GitHub-hosted raster icons, while the
plugin ships an SVG, so this script redraws the icon at 180x180 with a 4x
supersampled render for clean edges. Run from the repository root:

    python scripts/make-icon.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SCALE = 5       # 36-unit viewBox -> 180 px
SS = 4          # supersampling factor for antialiasing
W = 36 * SCALE * SS

GRAY = (0x9A, 0xA8, 0xB6, 204)   # existing lines, 80% alpha
BLUE_FROM = np.array([0x67, 0xC7, 0xFE])
BLUE_TO = np.array([0x2F, 0x7D, 0xFF])


def px(value: float) -> float:
    return value * SCALE * SS


def main() -> None:
    image = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # First line: existing name line.
    draw.rounded_rectangle(
        [px(8), px(9.5), px(28), px(14.5)], radius=px(2.5), fill=GRAY)
    # Second line: existing name, then the new model name.
    draw.rounded_rectangle(
        [px(8), px(18.5), px(16), px(23.5)], radius=px(2.5), fill=GRAY)

    # Model-name bar with the horizontal gradient of the SVG.
    x0, x1 = int(px(17.5)), int(px(28.5))
    t = np.clip((np.arange(W) - x0) / max(1, x1 - x0), 0.0, 1.0)[:, None]
    rgb = (BLUE_FROM[None, :] * (1 - t) + BLUE_TO[None, :] * t).astype(np.uint8)
    gradient = np.zeros((W, W, 4), dtype=np.uint8)
    gradient[:, :, :3] = rgb[None, :, :]
    gradient[:, :, 3] = 255

    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [px(17.5), px(18.5), px(28.5), px(23.5)], radius=px(2.5), fill=255)
    image.paste(Image.fromarray(gradient), (0, 0), mask)

    out = image.resize((36 * SCALE, 36 * SCALE), Image.LANCZOS)
    target = Path(__file__).resolve().parent.parent / "assets" / "icon-180.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    out.save(target)
    print(f"wrote {target} ({out.width}x{out.height})")


if __name__ == "__main__":
    main()
