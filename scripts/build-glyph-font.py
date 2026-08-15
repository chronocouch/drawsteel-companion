#!/usr/bin/env python3
"""
Rebuild the MCDM block-attribute glyphs with even, symmetric side padding.

WHY
    The block attribute glyphs (keys a i m p r) are a black box with the
    attribute letter knocked out. As shipped, the letter is not centred in
    its box and the right-hand gap is uniformly tighter than the left:

        key   box    letter   gapL   gapR   off-centre
        a     810      514     180    116      +64
        i     467      124     230    113     +117
        m     913      570     230    113     +117
        p     723      384     230    109     +121
        r     733      397     230    106     +124

    At 15px that right gap is ~1.7px. On `i` — whose letterform is a bare
    124-unit stem — the result is a black slab you cannot read as a letter.
    The uppercase set (A I M P R) is unaffected: those are true 1000x1000
    squares and already look right.

WHAT THIS DOES
    For each lowercase block glyph:
      1. widens the box to  letterWidth + 2 * SIDE_PADDING
      2. re-centres the letter inside it
      3. sets the advance width equal to the box width, so composite chips
         like "i<v" (Intuition < average potency) still butt up seamlessly

    Vertical metrics are untouched.

LICENCE
    Draw Steel Glyphs is (c) 2025 MCDM Productions, CC BY-SA 4.0. That
    licence permits modification, and requires that (a) changes are
    indicated and (b) the derivative is distributed under the same licence.
    Both are satisfied by shipping this script alongside the output and
    keeping the original file in the repo.

USAGE
    python3 scripts/build-glyph-font.py
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/fonts/DrawSteelGlyphs-Regular.otf"
DST = ROOT / "public/fonts/DrawSteelGlyphs-Even.otf"

# Uniform inside-the-box padding, in font units (upem 1000).
# 200 gives ~3px of breathing room each side at a 15px render.
SIDE_PADDING = 200

TARGETS = "aimpr"


def split_contours(recording):
    out, cur = [], []
    for op, args in recording:
        cur.append((op, args))
        if op == "closePath":
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def contour_bounds(glyphset, contour):
    pen = BoundsPen(glyphset)
    for op, args in contour:
        getattr(pen, op)(*args)
    return pen.bounds


def transform_contour(contour, scale_x, dx):
    """Scale x about the origin, then translate."""
    out = []
    for op, args in contour:
        out.append((op, tuple((x * scale_x + dx, y) for x, y in args)))
    return out


def main():
    if not SRC.exists():
        sys.exit(f"source font not found: {SRC}")

    font = TTFont(SRC)
    glyphset = font.getGlyphSet()
    charstrings = font["CFF "].cff[font["CFF "].cff.fontNames[0]].CharStrings
    hmtx = font["hmtx"]
    cmap = font.getBestCmap()

    print(f"{'key':4}{'oldBox':>8}{'newBox':>8}{'gapL':>7}{'gapR':>7}{'overlap':>9}")
    for ch in TARGETS:
        name = cmap.get(ord(ch))
        if name is None:
            print(f"  skip {ch!r}: not in cmap")
            continue

        rec = RecordingPen()
        glyphset[name].draw(rec)
        contours = split_contours(rec.value)
        if len(contours) < 2:
            print(f"  skip {ch!r}: expected box + letter, got {len(contours)} contour(s)")
            continue

        box, letters = contours[0], contours[1:]
        bx0, _, bx1, _ = contour_bounds(glyphset, box)
        letter_bounds = [contour_bounds(glyphset, c) for c in letters]
        lx0 = min(b[0] for b in letter_bounds)
        lx1 = max(b[2] for b in letter_bounds)

        old_box_w = bx1 - bx0
        letter_w = lx1 - lx0
        new_box_w = letter_w + 2 * SIDE_PADDING

        # box: pure horizontal scale (it is a rectangle, so this is exact)
        scale = new_box_w / old_box_w
        new_box = transform_contour(box, scale, -bx0 * scale)
        # letter: translate only, so the letterform is never distorted
        dx = SIDE_PADDING - lx0
        new_letters = [transform_contour(c, 1.0, dx) for c in letters]

        # The original font sets advance slightly NARROWER than the box, so
        # adjacent boxes overlap a few units and composite chips like "i<v"
        # never show an anti-aliasing hairline at the seam. Preserve it.
        old_adv = hmtx[name][0]
        overlap = old_box_w - old_adv

        old_cs = charstrings[name]
        pen = T2CharStringPen(new_box_w, None)
        for contour in [new_box] + new_letters:
            for op, args in contour:
                getattr(pen, op)(*args)
        new_cs = pen.getCharString()
        # carry over the CFF private dict / subrs, or the font cannot compile
        new_cs.private = old_cs.private
        new_cs.globalSubrs = old_cs.globalSubrs
        charstrings[name] = new_cs
        hmtx[name] = (int(round(new_box_w - overlap)), 0)

        print(f"{ch:4}{old_box_w:>8.0f}{new_box_w:>8.0f}"
              f"{SIDE_PADDING:>7}{SIDE_PADDING:>7}{overlap:>9.0f}")

    font.save(DST)
    print(f"\nwrote {DST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
