"""Normalize vehicle PNG sprite dimensions to GTA2-style constraints.

Rationale
---------
GTA2 vehicle sprites stored in .sty are typically constrained to even dimensions and a
maximum sprite rectangle around 128x64. Keeping your PNGs within those limits makes it
easier to swap in extracted GTA2 sprites later without breaking your render assumptions.

Behavior
--------
- Scans: assets/vehicles/*.png
- If an image exceeds MAX_WxMAX_H, it is downscaled with NEAREST (pixel-art friendly)
  to fit inside the max rectangle while preserving aspect ratio.
- Forces the resulting width and height to be even numbers (>=2).

Usage
-----
From project root:
  python3 tools/normalize_vehicle_sprites.py

Optional:
  python3 tools/normalize_vehicle_sprites.py --maxw 128 --maxh 64
"""

from __future__ import annotations

import argparse
import glob
import os
from dataclasses import dataclass

from PIL import Image


@dataclass
class Change:
    name: str
    before: tuple[int, int]
    after: tuple[int, int]
    scale: float


def _even_at_least_2(n: int) -> int:
    n = max(2, int(n))
    return n if n % 2 == 0 else n - 1


def normalize_folder(folder: str, maxw: int, maxh: int) -> list[Change]:
    changes: list[Change] = []

    for path in sorted(glob.glob(os.path.join(folder, "*.png"))):
        name = os.path.basename(path)
        im = Image.open(path)
        im.load()
        w, h = im.size

        scale = min(1.0, maxw / w, maxh / h)
        nw, nh = w, h

        if scale < 1.0:
            nw = int(round(w * scale))
            nh = int(round(h * scale))

        nw = _even_at_least_2(nw)
        nh = _even_at_least_2(nh)

        # Never exceed bounds after rounding
        nw = min(nw, maxw)
        nh = min(nh, maxh)

        if (nw, nh) != (w, h):
            out = im.resize((nw, nh), Image.Resampling.NEAREST)
            out.save(path)
            changes.append(Change(name=name, before=(w, h), after=(nw, nh), scale=scale))

    return changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--maxw", type=int, default=128)
    ap.add_argument("--maxh", type=int, default=64)
    ap.add_argument("--folder", type=str, default=os.path.join("assets", "vehicles"))
    args = ap.parse_args()

    changes = normalize_folder(args.folder, args.maxw, args.maxh)

    print(f"Checked {args.folder} (MAX={args.maxw}x{args.maxh}).")
    if not changes:
        print("No changes needed.")
        return 0

    print(f"Changed {len(changes)} file(s):")
    for c in changes:
        print(f"- {c.name}: {c.before[0]}x{c.before[1]} -> {c.after[0]}x{c.after[1]} (scale={c.scale:.3f})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
