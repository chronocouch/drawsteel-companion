#!/usr/bin/env python3
"""
Draw Steel Companion — unstyled-class check.

Run:  python3 scripts/check-unstyled-classes.py
CI:   exits non-zero if any reported class is unstyled.

The token linter checks that CSS is well-formed. This checks the other
direction: that markup the app actually emits has CSS behind it.

It has already caught three real bugs:
  · .ms-minion-warning  — its rule was stranded 600 lines away in an
                          unrelated section of main.css.
  · .enc-budget-bar-*   — styled, but against a token that resolved to the
                          same paper as the card behind it.
  · .neg-pip-filled-N   — emitted from a single-quoted template literal, so
                          the class name arrived with a literal "${n}" in it.

WHAT IS AND ISN'T A BUG
A class that exists only as a querySelector hook is fine and common — the
JS needs a handle, the element needs no styling. So this script does not
fail on everything unstyled; it fails on names that LOOK like they want
styling (a card, a panel, a badge, a button, a label, a bar) and have none.
Everything else is printed as a note.

Add a name to HOOKS when you have confirmed it is a handle, not a bug.

The backlog this script found when it was written is now cleared. Every
entry was a real gap -- markup the app has always emitted with no rule
behind it, absent from the original stylesheet too:
    .ability-card-header  .ability-card-name  .ability-type-badge
    .ability-card-meta    .ability-keywords   .career-detail-panel
    .enc-npc-card         .hp-modal-value     .levelup-stat-label
    .ms-minion-warning    .runner-hero-edit-modal
    .wizard-field         .wizard-label
Keep it at zero. A new name appearing here means someone shipped markup
without styling it.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS_GLOB = "public/css/*.css"
JS_GLOB = "public/js/*.js"
HTML = ROOT / "public/index.html"

# Confirmed query hooks — styled nowhere, on purpose.
HOOKS = {
    # knowledge.js reads these off one textarea and three checkboxes
    "kn-rv-section", "kn-rv-new", "kn-rv-change", "kn-rv-link",
    "kn-entity-modal", "kn-note-vault-btn", "kn-note-deltx-btn",
    # campaign.js column handles; .enc-editor-col carries the styling
    "enc-editor-left", "enc-editor-center",
    # modifiers whose base class carries everything: .companion-badge is
    # the whole style, and only -role differs from it
    "companion-badge-type", "companion-badge-size",
    # wrappers whose children carry the layout
    "hero-detail-xp-section",
    # spans inside a styled parent that positions them
    "enc-meta-stat", "montage-ch-desc", "montage-ch-remove", "neg-list-input",
    "confirm-modal-text", "hp-modal-controls", "char-resource",
    "char-btn-plus", "char-btn-minus", "kit-sig-tiers-display",
    "ability-card-meta", "ability-keywords",
    # buttons that already wear .btn; these are click handles only
    "campaign-open-btn", "campaign-archive-btn", "campaign-restore-btn",
    "encounter-delete-btn", "encounter-start-btn",
    "runner-add-enemy-turn", "enc-squad-check",
    # layout handles in index.html, positioned by their parent grid
    "panel-heroes", "panel-encounters", "header-actions", "modal-content",
    "runner-panel-heroes", "runner-panel-center",
}

# Names that read as styleable — if one of these is unstyled, it is a bug.
WANTS_STYLE = re.compile(
    r"-(card|panel|badge|btn|button|label|bar|track|fill|row|list|title|"
    r"header|footer|chip|pill|tag|banner|modal|warning|note|value|name)$"
)

VALID = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")


def defined_classes():
    css = "\n".join(p.read_text() for p in sorted(ROOT.glob(CSS_GLOB)))
    return set(re.findall(r"\.([a-zA-Z][\w-]*)", css))


def emitted_classes():
    out = {}

    def add(name, src):
        if VALID.match(name):
            out.setdefault(name, set()).add(src)

    for f in sorted(ROOT.glob(JS_GLOB)):
        text = f.read_text()
        for m in re.finditer(r'class="([^"]*)"', text):
            for c in m.group(1).split():
                add(c, f.name)
        for m in re.finditer(r"classList\.(?:add|remove|toggle)\(([^)]*)\)", text):
            for c in re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)):
                add(c, f.name)
    if HTML.exists():
        for m in re.finditer(r'class="([^"]*)"', HTML.read_text()):
            for c in m.group(1).split():
                add(c, HTML.name)
    return out


def main():
    defined = defined_classes()
    emitted = emitted_classes()
    missing = {c: v for c, v in emitted.items() if c not in defined and c not in HOOKS}

    bugs = sorted((c, v) for c, v in missing.items() if WANTS_STYLE.search(c))
    notes = sorted((c, v) for c, v in missing.items() if not WANTS_STYLE.search(c))

    if notes:
        print("UNSTYLED (probably query hooks — confirm, then add to HOOKS):")
        for c, v in notes:
            print(f"  .{c:<30} {', '.join(sorted(v))}")
        print()

    if bugs:
        print(f"{len(bugs)} UNSTYLED CLASS(ES) THAT LOOK LIKE THEY WANT STYLING:")
        for c, v in bugs:
            print(f"  ✗ .{c:<30} emitted by {', '.join(sorted(v))}, styled nowhere")
        return 1

    print("✓ every styleable class the app emits has a rule")
    return 0


if __name__ == "__main__":
    sys.exit(main())
