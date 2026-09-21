# Draw Steel Companion

A web-based character creator and combat tracker for the **Draw Steel** TTRPG by
MCDM Productions. Built for a small group of friends — the Director (GM) and
players use it at the table. The character sheet is the playing surface;
live combat sync layers on top of it.

**Live app:** https://drawsteel-companion.web.app

## Features

- **Character creator** — a 10-step wizard (ancestries, cultures, careers,
  classes, kits, complications) plus level-up math, and **Forge Steel `.ds-hero`
  import** for heroes built in the desktop tool.
- **Ability cards** — full availability + combat-state tag system (signature,
  once/encounter, once/turn, triggered, resource pips).
- **Live sessions** — Firestore-synced combat, negotiation, and montage runners;
  players never leave their sheet to track combat.
- **Campaign manager** — multi-campaign roster, XP/milestone/director
  advancement, encounter builder (combat/negotiation/montage) with a monster
  bestiary and Draw Steel encounter-value math.
- **Knowledge layer** — AI transcript ingestion into campaign entities
  (NPCs/threads/locations/factions) and an optional write-only Obsidian vault.

## Tech Stack

- **Frontend:** Vanilla JS, HTML, CSS — no framework. Mobile-responsive, served
  from `public/` by Firebase Hosting.
- **Backend:** Firebase — Firestore, Auth (Google Sign-In, redirect-based),
  Hosting, Cloud Functions (v2), Cloud Storage.
- **AI:** Anthropic API (`claude-sonnet-5`) for transcript ingestion.
- **Data source:** [Steel Compendium](https://github.com/SteelCompendium) markdown,
  parsed into Firestore by the seed scripts.
- **Node:** 22 (required by `functions/package.json`).

## Project Structure

```
public/            Static frontend (Firebase Hosting root)
  index.html       Cache-busts JS/CSS with ?v=N query params — bump on every change
  css/             Design-system layers (tokens, base, components, wizard, sheet…)
  js/              app.js, auth.js, character.js, abilities.js, session.js,
                   campaign.js, monster-search.js, knowledge.js, vault.js,
                   ds-hero-import.js, character-import.js, wizard-data.js
functions/         Cloud Functions (cleanup, transcript ingestion, campaign delete)
scripts/           One-off Admin SDK seed scripts + Node test suites
firestore.rules    Security rules (per-collection ownership)
```

## Running the Tests

The suites are pure Node — no `npm install`, no browser. They require the source
files directly and use the built-in `vm`/`fs` modules.

```bash
node scripts/test-encounter-math.js
node scripts/test-vault.js
node scripts/test-ds-hero.js
node scripts/test-wizard-consistency.js
node scripts/test-campaign-model.js
```

CI runs all five on every push and pull request (`.github/workflows/test.yml`).

## Seed Scripts

`/abilities` and `/monsters` are populated by running the Admin SDK scripts
locally (never via Cloud Functions). Requires application-default credentials.

```bash
node scripts/seed-local.js                              # abilities
node scripts/seed-monsters.js --collection monsters_staging   # then verify report
node scripts/seed-monsters.js --promote monsters_staging      # then promote
node scripts/seed-beastheart.js                         # Beastheart abilities
```

Re-seeding monsters is always staging-first — never write `/monsters` directly.

## Deployment

- **Hosting** deploys automatically on push to `main` via
  `.github/workflows/deploy.yml`. It needs a `FIREBASE_TOKEN` repository secret:

  ```bash
  npx firebase-tools login:ci
  ```

  Copy the printed token into GitHub → Settings → Secrets and variables →
  Actions → new secret named `FIREBASE_TOKEN`.

- **Functions, rules, and storage stay manual:**

  ```bash
  firebase deploy --only functions,firestore,storage
  ```

## Local / Operator Setup

1. **Firebase config** — copy `public/js/firebase-config.example.js` to
   `public/js/firebase-config.js` and paste in your project's config. The real
   file is gitignored; these are client keys (security lives in the Firestore
   rules), and the example documents the shape.
2. **Cloud Storage** — enable it once in the Firebase console ("Get Started")
   before deploying storage rules or using transcript ingestion.
3. **Anthropic key** — the ingestion function reads `ANTHROPIC_API_KEY` from
   Firebase Secrets:

   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```

## License / Attribution

Draw Steel Companion is an independent product published under the DRAW STEEL
Creator License and is not affiliated with MCDM Productions, LLC.
DRAW STEEL © MCDM Productions, LLC.
