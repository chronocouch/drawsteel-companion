#!/usr/bin/env python3
"""
Draw Steel Companion — design system linter.

Run:  python3 scripts/check-design-system.py
CI:   exits non-zero on any failure.

Checks three things, which are exactly the three ways the old system leaked:

  1. TOKEN INTEGRITY   every var(--x) resolves; no malformed hex.
  2. CONTRAST          every declared text/background pairing meets WCAG AA.
  3. DRIFT             no raw hex, no raw px font-size, no off-scale spacing
                       anywhere outside tokens.css.

Add a pairing to PAIRINGS whenever you introduce a new text-on-surface
combination. If it isn't listed here, nothing is checking it.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "public/css/tokens.css"
CSS_GLOB = "public/css/*.css"

# ── (text_token, background_token, minimum_ratio) ───────────────────────────
# 4.5 = AA normal text · 3.0 = AA large text / non-text UI contrast
PAIRINGS = [
    ("--ink-body",            "--surface-page",        4.5),
    ("--ink-body",            "--surface-app",         4.5),
    ("--ink-body",            "--surface-inset",       4.5),
    ("--ink-strong",          "--surface-page",        4.5),
    ("--ink-muted",           "--surface-page",        4.5),
    ("--ink-muted",           "--surface-bar",         4.5),
    ("--ink-faint",           "--surface-page",        3.0),
    ("--ink-link",            "--surface-page",        4.5),
    ("--accent-ink",          "--surface-page",        4.5),
    ("--accent-ink",          "--accent-wash",         4.5),
    ("--ink-on-reverse",      "--surface-reverse",     4.5),
    ("--ink-on-accent",       "--surface-accent",      4.5),
    ("--state-available-ink", "--state-available-bg",  4.5),
    ("--state-danger-ink",    "--state-danger-bg",     4.5),
    ("--state-warning-ink",   "--state-warning-bg",    4.5),
    ("--state-heal-ink",      "--state-heal-bg",       4.5),
    ("--state-spent",         "--state-spent-bg",      3.0),
    ("--tier-1",              "--surface-inset",       4.5),
    ("--tier-2",              "--surface-inset",       4.5),
    ("--tier-3",              "--surface-inset",       4.5),
    ("--econ-action-ink",     "--econ-action-bg",      4.5),
    ("--econ-maneuver-ink",   "--econ-maneuver-bg",    4.5),
    ("--econ-triggered-ink",  "--econ-triggered-bg",   4.5),
    ("--econ-free-ink",       "--econ-free-bg",        4.5),
    ("--econ-strike-ink",     "--econ-strike-bg",      4.5),
    ("--accent",              "--surface-page",        3.0),
    ("--line-soft",           "--surface-page",        1.3),
]

ALLOWED_SPACING = {0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 48}
ALLOWED_RADIUS = {0, 2, 3, 4, 999}


def parse_tokens(text):
    return dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", text))


def resolve(raw, value, depth=0):
    value = value.strip()
    if depth > 12:
        return None
    m = re.fullmatch(r"var\((--[\w-]+)\)", value)
    if m:
        return resolve(raw, raw.get(m.group(1), ""), depth + 1)
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", value) else None


def luminance(hexcolor):
    r, g, b = (int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))

    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main():
    failures = []
    src = TOKENS.read_text()
    raw = parse_tokens(src)

    # ── 1. integrity ────────────────────────────────────────────────────────
    for line_no, line in enumerate(src.splitlines(), 1):
        if re.search(r"#(?![0-9a-fA-F]{3}\b)(?![0-9a-fA-F]{6}\b)(?![0-9a-fA-F]{8}\b)[0-9a-zA-Z]{2,}", line):
            failures.append(f"integrity: malformed hex at tokens.css:{line_no}: {line.strip()}")

    defined = set(raw)
    for ref in set(re.findall(r"var\((--[\w-]+)", src)):
        if ref not in defined:
            failures.append(f"integrity: var({ref}) is referenced but never defined")

    # ── 2. contrast ─────────────────────────────────────────────────────────
    print(f"{'PAIRING':52} {'RATIO':>7}  {'MIN':>5}")
    print("-" * 70)
    for fg, bg, minimum in PAIRINGS:
        fgv, bgv = resolve(raw, raw.get(fg, "")), resolve(raw, raw.get(bg, ""))
        if not fgv or not bgv:
            failures.append(f"contrast: cannot resolve {fg} or {bg} to a hex value")
            continue
        ratio = contrast(fgv, bgv)
        ok = ratio >= minimum
        print(f"{'PASS' if ok else 'FAIL'}  {fg} on {bg:26} {ratio:6.2f}  {minimum:5.1f}")
        if not ok:
            failures.append(
                f"contrast: {fg} ({fgv}) on {bg} ({bgv}) is {ratio:.2f}:1, needs {minimum}:1"
            )

    # ── 3. drift ────────────────────────────────────────────────────────────
    print()
    for path in sorted(ROOT.glob(CSS_GLOB)):
        if path.name == "tokens.css":
            continue
        body = path.read_text()
        # strip comments so documented examples don't trip the linter
        body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
        rel = path.relative_to(ROOT)

        for hexval in set(re.findall(r"#[0-9a-fA-F]{3,8}\b", body)):
            failures.append(f"drift: raw hex {hexval} in {rel} — use a token")

        for rgbval in set(re.findall(r"rgba?\([\d.,\s%]+\)", body)):
            failures.append(f"drift: raw {rgbval} in {rel} — use a --wash-* token")

        for size in set(re.findall(r"font-size:\s*([\d.]+)px", body)):
            failures.append(f"drift: raw font-size {size}px in {rel} — use --size-*")

        for prop, val in re.findall(r"(padding|margin|gap|row-gap|column-gap):\s*([^;]+);", body):
            for num in re.findall(r"(-?[\d.]+)px", val):
                if abs(float(num)) not in ALLOWED_SPACING:
                    failures.append(f"drift: {prop}: {num}px in {rel} — off the space scale")

        for num in set(re.findall(r"border-radius:\s*([\d.]+)px", body)):
            if float(num) not in ALLOWED_RADIUS:
                failures.append(f"drift: border-radius {num}px in {rel} — use --radius-*")

    # ── report ──────────────────────────────────────────────────────────────
    if failures:
        print(f"\n{len(failures)} FAILURE(S):\n")
        for f in failures:
            print(f"  ✗ {f}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
