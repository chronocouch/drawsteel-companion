# Draw Steel Companion — Visual Style Guide

This file is the design reference for Claude Code when building or styling any UI component
in the Draw Steel Companion app. Read this before touching any CSS or HTML.

---

## Design Philosophy

The app should feel like the Draw Steel physical book came to life on a screen.
The book uses an **editorial dark-fantasy aesthetic** — dense with information but
never cluttered. Think: tactician's field manual, not generic app dashboard.

**Two modes coexist in the app:**
- **Playing surface (character sheet / combat):** Dark base, high contrast, information-dense.
  Inspired by the book's interior layout — every element earns its place.
- **Wizard / setup flows:** Can breathe more. Slightly warmer, more generous spacing,
  guided step-by-step.

Both modes share the same typographic and color system.

---

## Typography

### Font Stack

```css
/* Display — headings, class names, ability card names, UI labels */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap');

/* Body — descriptions, flavor text, rule text */
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

/* Condensed — badges, tabs, action economy labels, stat labels */
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700;800&display=swap');

/* Mono — numbers, HP values, resource counts, roll results */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap');
```

**Cinzel** — The book uses a heavy all-caps serif for headers and the logo.
Cinzel is the closest web equivalent: Roman inscription-style, weighty, authoritative.
Use for: page titles, ability card names, wizard step titles, section headers.

**EB Garamond** — The book body text is a warm humanist serif. EB Garamond matches
the editorial warmth. Use for: ability descriptions, tier text, flavor text, wizard
step descriptions, callout box content.

**Barlow Condensed** — The book uses a tight condensed sans for labels, side text,
and UI chrome. Already in use in the codebase. Keep for: badges, tab labels, action
economy bucket labels, filter pills, stat labels.

**JetBrains Mono** — Numbers. Always monospace for HP, resource counts, dice results.

### Type Scale

```css
:root {
  --text-display:   clamp(22px, 4vw, 32px);  /* Ability card names, wizard titles */
  --text-heading:   clamp(16px, 2.5vw, 22px); /* Section headers, sheet labels */
  --text-body:      15px;                      /* Descriptions, rule text */
  --text-small:     13px;                      /* Flavor text, secondary info */
  --text-label:     11px;                      /* Badges, stat labels */
  --text-mono:      14px;                      /* HP, resource, numbers */
  --text-mono-lg:   20px;                      /* Header HP/resource display */
}
```

### Type Rules

- Ability card names: `Cinzel` 700, tracked at `0.03em`
- Wizard step titles: `Cinzel` 900, slightly larger
- Section headers (Stats, Details tabs): `Cinzel` 700, `0.08em` tracking, uppercase
- Tier text (T1/T2/T3): `EB Garamond` 400, 15px, generous line-height (1.7)
- Flavor text: `EB Garamond` 400 italic, slightly dimmed color
- All CAPS UI text (badges, labels): `Barlow Condensed` 700, tracked at `0.1em`
- HP / resource numbers in header: `JetBrains Mono` 600, 22px
- Roll results / damage values: `JetBrains Mono` 700

---

## Color System

### Base Palette

Derived from the book's warm dark ink-on-parchment feel, adapted for dark-mode screen use.

```css
:root {
  /* ── Backgrounds ─────────────────────────────────────────── */
  --bg-base:          #0D0F14;   /* Deepest background — like deep charcoal ink */
  --bg-card:          #161A24;   /* Card surfaces */
  --bg-card-hover:    #1C2130;
  --bg-surface:       #12151E;   /* Sheet header, tab bar */
  --bg-elevated:      #1E2435;   /* Modals, expanded card panels */
  --bg-callout:       #1A1608;   /* Warm dark — book callout box equivalent */
  --bg-parchment:     #F5EDD8;   /* Used ONLY for special callout highlights */

  /* ── Text ────────────────────────────────────────────────── */
  --text-primary:     #E8E0CF;   /* Warm off-white — not pure white */
  --text-secondary:   #9A9080;   /* Dimmed — secondary info */
  --text-dim:         #5A5448;   /* Very dim — labels, decorative */
  --text-inverse:     #0D0F14;   /* On light backgrounds */
  --text-gold:        #C8A84B;   /* Warm gold — signature abilities, key highlights */
  --text-parchment:   #1A1108;   /* Dark text on parchment bg */

  /* ── Borders ─────────────────────────────────────────────── */
  --border-hairline:  #222838;   /* Barely visible structural lines */
  --border-subtle:    #2A3045;   /* Standard card borders */
  --border-visible:   #3A4060;   /* Emphasized borders */
  --border-gold:      #8A6A28;   /* Gold border for signature elements */
  --border-warm:      #6B5A38;   /* Warm brown — book callout box borders */

  /* ── Semantic / Action ───────────────────────────────────── */
  --color-available:  #1ABC9C;   /* Teal — ready, affordable, your turn */
  --color-spent:      #3A4050;   /* Muted — spent, used */
  --color-danger:     #C0392B;   /* Red — damage, danger, delete */
  --color-heal:       #27AE60;   /* Green — healing */
  --color-warning:    #E67E22;   /* Orange — once/encounter, winded */
  --color-gold:       #C8A84B;   /* Gold — signature, special */
  --color-purple:     #8E44AD;   /* Purple — triggered actions */

  /* ── Class accent — overridden per character ─────────────── */
  --class-accent:     #2980B9;
}
```

### Color Usage Rules

**Gold (`--color-gold`, `#C8A84B`):**
The book uses warm gold/tan as its primary accent — the spine color, callout headers,
decorative rules. Use gold for: signature ability badges, character name on sheet,
the wizard's active step indicator, selected state on important choices.

**Warm off-white (`--text-primary`, `#E8E0CF`):**
Not pure white. The book's body text has warmth. Never use `#FFFFFF` for text.

**Parchment (`--bg-parchment`):**
Use extremely sparingly. Only for the most important callout boxes — e.g. the Review
step of the wizard, a critical rules clarification. The book uses it for sidebar callouts.

**Avoid:** blue/purple gradients, neon greens, pure white backgrounds.

---

## Decorative Elements

These are lifted directly from the book's design language.

### Diamond Divider

The book uses a small diamond `◇` to separate sections within a topic.
Use this as a CSS divider, not a text character:

```css
.section-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  color: var(--border-gold);
}

.section-divider::before,
.section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--border-warm), transparent);
}

.section-divider::after {
  background: linear-gradient(to left, transparent, var(--border-warm), transparent);
}
```

Usage in HTML:
```html
<div class="section-divider">◇</div>
```

### Callout Box (Book Style)

The book uses thick top+bottom rules with a centered label:

```css
.callout-book {
  border-top: 2px solid var(--border-warm);
  border-bottom: 2px solid var(--border-warm);
  padding: 16px 20px;
  background: var(--bg-callout);
  margin: 16px 0;
}

.callout-book-title {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-align: center;
  color: var(--text-gold);
  text-transform: uppercase;
  margin-bottom: 10px;
}

.callout-book-body {
  font-family: var(--font-serif);
  font-size: 14px;
  font-style: italic;
  color: var(--text-secondary);
  line-height: 1.7;
}
```

Usage:
```html
<div class="callout-book">
  <div class="callout-book-title">Encounter Adjustments</div>
  <p class="callout-book-body">This encounter is designed for five heroes...</p>
</div>
```

### Tier Result Brackets

The book uses bracketed tier ranges for power roll outcomes: `[11]`, `[12–16]`, `[17+]`

```css
.tier-range {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 2px 6px;
  border: 1px solid var(--border-visible);
  background: var(--bg-elevated);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: 2px;
  flex-shrink: 0;
}
```

Use this in expanded ability card tier rows — replace the plain "Tier 1/2/3" labels with
`[11 or lower]`, `[12–16]`, `[17+]` in this style.

### Ability Card Left Border

Cards use a 3px left border in the class accent color. On hover or expanded state,
this border brightens. This is the primary "class coloring" element.

```css
.ability-card {
  border-left: 3px solid var(--class-accent);
  transition: border-left-width 0.15s, filter 0.15s;
}

.ability-card.expanded {
  border-left-width: 4px;
  filter: brightness(1.05);
}

.ability-card.unaffordable {
  border-left-color: var(--border-subtle);
  opacity: 0.6;
}

.ability-card.spent {
  border-left-color: var(--color-spent);
  opacity: 0.35;
}
```

---

## Component Patterns

### Ability Card

The most important component in the app. Full spec:

**Collapsed state:**
```
┌─ 3px class-color border
│  [CARD NAME — Cinzel 700 16px]       [TYPE BADGE] [FREQ BADGE] [●●○]
│  ─────────────────────────────────────────────────────────────────
│  Tier 2 summary text — EB Garamond 14px, secondary color
│  Keywords · Distance
└──────────────────────────────────────────────────────────────────
```

**Expanded state adds:**
```
┌── Expanded panel (slightly lighter bg)
│   [12–16]  Tier 2 text in full
│   [11 ↓]   Tier 1 text
│   [17+]    Tier 3 text
│
│   Kit: Mountain — +2 damage on tier 2+        (if applicable)
│
│   [       USE THIS ABILITY       ]             (if in session)
│
│   "Flavor text in italic EB Garamond..."
└──────────────────────────────────────────────────────────────────
```

### Badges

All badges use `Barlow Condensed` 700, 10–11px, letter-spacing 0.08em, all-caps.
Border-radius: 3px (slightly squared — not fully rounded).

```css
.badge {
  font-family: var(--font-condensed);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid currentColor;
}

/* Semantic variants */
.badge-action        { color: #1ABC9C; background: rgba(26,188,156,0.1); }
.badge-maneuver      { color: #3498DB; background: rgba(52,152,219,0.1); }
.badge-triggered     { color: #8E44AD; background: rgba(142,68,173,0.1); }
.badge-signature     { color: #C8A84B; background: rgba(200,168,75,0.12);
                       border-color: #8A6A28; }
.badge-ancestry      { color: #C8A84B; background: rgba(200,168,75,0.08);
                       border-color: #6B5A38; border-style: dashed; }
.badge-encounter     { color: #E67E22; background: rgba(230,126,34,0.1); }
.badge-spent         { color: #5A6070; background: rgba(90,96,112,0.15); }
```

### Wizard Step Cards (Pick Buttons)

The book's two-column layout with a list on left and detail panel on right:

```css
.wizard-pick-btn {
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.wizard-pick-btn:hover {
  background: var(--bg-card-hover);
  border-left-color: var(--text-dim);
}

.wizard-pick-btn.selected {
  background: var(--bg-elevated);
  border-color: var(--class-accent);
  border-left-color: var(--class-accent);
  border-left-width: 4px;
}

.wizard-pick-btn .pick-name {
  font-family: var(--font-display);  /* Cinzel */
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.wizard-pick-btn .pick-desc {
  font-family: var(--font-serif);    /* EB Garamond */
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
  line-height: 1.5;
}
```

### Stats Tab — Class Summary

Inspired by the book's "stat block" style:

- Class name in class accent color, `Cinzel` 700
- Class description in `EB Garamond` italic
- Stats in a 5-column grid, value in `JetBrains Mono` large, label in `Barlow Condensed` small
- A thin `--border-warm` rule between sections

### Session Indicator Banner

When in session, the banner reads "IN SESSION · Round N". Style with:
- Background: `rgba(26, 188, 156, 0.06)` — very subtle teal wash
- Left border: 3px `--color-available` (teal)
- Pulse dot: 8px circle with CSS animation
- Text: `Barlow Condensed` 700, 11px, tracked at 0.12em, teal

### Malice Tracker (Director)

Give this weight — it's a critical director mechanic. Style:
- Large monospace number for current Malice
- Red glow when Malice is high (≥ 10)
- "MALICE" label in `Barlow Condensed` tracked caps
- −/+ buttons use `Barlow Condensed`, not default font

---

## Motion & Interaction

Keep animations purposeful — not decorative.

```css
/* Standard transition — use for most state changes */
--transition-fast:   0.12s ease;
--transition-base:   0.2s ease;
--transition-slow:   0.35s ease;

/* Card expand */
.card-expanded {
  animation: slideDown 0.2s ease;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Toast notification */
.toast {
  animation: slideUp 0.25s ease;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Action bucket — when spent */
.bucket.spent {
  transition: opacity 0.2s ease, border-color 0.2s ease;
}

/* Resource pip fill */
.pip {
  transition: background 0.3s ease;
}
```

**Never animate:** card resorting (too jarring during combat), HP numbers (show immediately),
Firestore-synced values (show instantly — latency is already there).

---

## Mobile-First Rules

The app is used at a table on phones. These rules are non-negotiable.

```
Minimum tap target:     44px × 44px (all interactive elements)
Minimum font size:      13px (nothing smaller visible on screen)
Card padding:           12px horizontal, 10px vertical minimum
Header height:          60–68px (thumb reach from bottom)
Bottom session controls: sticky, full-width, above thumb zone
Scroll:                 only vertical, -webkit-overflow-scrolling: touch
```

**Resource +/− buttons:** Must be at least 44px wide × 44px tall. Currently undersized.

**Ability cards:** Tap anywhere on the card header to expand — not just a small chevron.

**Condition chips:** 36px minimum height, 8px gap between chips.

---

## CSS Variable Definitions

Add this full block to `:root` in `main.css`:

```css
:root {
  /* Fonts */
  --font-display:    'Cinzel', serif;
  --font-serif:      'EB Garamond', Georgia, serif;
  --font-condensed:  'Barlow Condensed', sans-serif;
  --font-mono:       'JetBrains Mono', monospace;

  /* Already defined above — colors, spacing, etc. */

  /* Border radius */
  --radius-sm:  3px;   /* Badges, small elements — slightly squared like the book */
  --radius-md:  6px;   /* Cards */
  --radius-lg:  10px;  /* Modals */

  /* Shadows */
  --shadow-card:   0 2px 8px rgba(0,0,0,0.4);
  --shadow-modal:  0 8px 32px rgba(0,0,0,0.6);
  --shadow-gold:   0 0 12px rgba(200,168,75,0.2);  /* For signature elements */
}
```

---

## What to Keep From Existing CSS

The existing `main.css` has solid foundations. Keep:
- The screen system (`.screen`, `.screen.active`)
- The scrollbar styling
- All Firebase-related JS logic (none of this is visual)
- The `--class-accent` per-character override pattern
- Action economy bucket structure

**Upgrade:**
- Replace `font-family: "Arial"` with the correct semantic font (display/serif/condensed/mono)
- Replace `border-radius: var(--radius-sm)` values — current `4px` cards should become `6px`
- Warm all `color: var(--text-primary)` values from cold white toward `#E8E0CF`
- Add `--bg-callout` for the wizard's callout boxes and stat panels

---

## Things to Avoid

- **Arial, Inter, Roboto, system-ui** — generic, wrong for this aesthetic
- **Pure white (`#FFFFFF`)** for text — too cold, use `#E8E0CF`
- **Pure black (`#000000`)** for backgrounds — use `#0D0F14`
- **Fully rounded buttons** (`border-radius: 999px`) — use `3–6px` max
- **Purple/blue gradients** — not in the book's palette
- **Drop shadows on text** — the book uses weight and contrast, not shadows
- **Emoji as decorative elements** — use CSS or SVG instead
- **Excessive animations** — one deliberate motion per interaction, no more

---

*This style guide is an independent product published under the DRAW STEEL Creator License
and is not affiliated with MCDM Productions, LLC. DRAW STEEL © 2024 MCDM Productions, LLC.*
