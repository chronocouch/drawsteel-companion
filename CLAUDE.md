# Draw Steel Companion App — Claude Code Context

## What This Project Is
A web-based character creator and combat tracker for the TTRPG **Draw Steel** by MCDM Productions.
Built for a small group of friends. The Director (GM) and players use this at the table.

Published under the **DRAW STEEL Creator License**. Attribution required in footer:
> "[App Name] is an independent product published under the DRAW STEEL Creator License and is not affiliated with MCDM Productions, LLC. DRAW STEEL © 2024 MCDM Productions, LLC."

## North Star
**D&D Beyond** — the character sheet IS the playing surface. Combat sync layers on top of
the sheet, not the other way around. Players never leave their character to track combat.

## Tech Stack
- **Frontend**: Vanilla JS, HTML, CSS — no framework. Mobile-responsive.
- **Backend**: Firebase (Firestore, Auth, Hosting, Cloud Functions)
- **Auth**: Google Sign-In only
- **Data source**: Steel Compendium GitHub (SteelCompendium/data-rules-md) — markdown parsed into Firestore
- **Node version**: 22 (functions/package.json must specify `"node": "22"`)

## Project Structure
```
drawsteel/
├── CLAUDE.md               ← You are here
├── SETUP.md                ← Step-by-step setup guide
├── .firebaserc             ← Firebase project alias
├── firebase.json           ← Hosting + Functions config
├── firestore.rules         ← Security rules
├── firestore.indexes.json  ← Must have empty indexes array
├── public/                 ← Static frontend (Firebase Hosting serves this)
│   ├── index.html
│   ├── css/
│   │   └── main.css
│   └── js/
│       ├── app.js          ← Entry point, router
│       ├── auth.js         ← Google Sign-In
│       ├── character.js    ← Character sheet + wizard
│       ├── abilities.js    ← Ability card viewer + tag system
│       ├── session.js      ← Combat session, live sync
│       └── firebase-config.js  ← YOUR FIREBASE CONFIG GOES HERE
├── functions/              ← Cloud Functions
│   ├── package.json        ← node engine MUST be "22"
│   ├── index.js            ← Function exports
│   └── src/
│       └── seed.js         ← Phase 0: populates /abilities from Steel Compendium
└── scripts/
    └── seed-local.js       ← Run this once to seed Firestore: node scripts/seed-local.js
```

## Firestore Data Model

### /users/{userId}
```
{ displayName, email, createdAt }
```

### /users/{userId}/characters/{characterId}
```
{
  name, ancestry, culture, career, class, kit, complication,
  characteristics: { MGT, AGL, REA, INU, PRS },
  maxHP, currentHP,
  heroicResource: { name, current, max },
  abilityIds: string[],
  conditions: string[],
  classAccentColor: string,   // hex color for UI theming
  wizardStep: number,         // 1-10, tracks creation progress
  createdAt
}
```

### /abilities/{abilityId}  [global, seeded once]
```
{
  name, class,
  type: 'action' | 'maneuver' | 'triggered' | 'free-triggered' | 'free',
  cost: number,               // heroic resource cost; 0 = free
  isSignature: boolean,
  frequency: 'at-will' | 'once-per-turn' | 'once-per-encounter',
  keywords: string[],
  distance: string,
  tier1, tier2, tier3: string,
  kitModifiers: [{ kitName, modification }],
  flavor: string
}
```

### /sessions/{sessionCode}
```
{
  directorId, active, round, createdAt,
  campaignId: string,           // NEW — links to /campaigns
  encounterId: string,          // NEW — links to /campaigns/.../encounters
  heroes: [{
    userId, characterId, displayName,
    currentHP, maxHP,
    heroicResource: { name, current, max },
    conditions: string[],
    // Per-turn (resets on End Turn):
    hasActed, hasManeuvered, hasUsedTriggered,
    hasUsedFreeTriggered, hasUsedFreeStrike: boolean,
    // Per-encounter (persists until session ends):
    usedOncePerEncounterAbilities: string[]
  }]
}
```

### /monsters/{monsterId}  [global, seeded from SteelCompendium/data-bestiary-json]
```
{
  name: string,
  level: number,
  ev: number,                   // encounter value for budget math
  role: string,                 // 'brute'|'controller'|'defender'|'hexer'|
                                //   'artillery'|'ambusher'|'leader'|'solo'
  keywords: string[],           // e.g. ['Humanoid', 'Goblin']
  stamina: number,
  speed: number,
  size: string,                 // '1M', '1S', '2', etc.
  stability: number,
  freeStrike: number,
  characteristics: { MGT, AGL, REA, INU, PRS },
  immunities: [{ type, value }],
  weaknesses: [{ type, value }],
  movementTypes: string[],      // ['fly', 'teleport', etc.]
  isMinion: boolean,
  isSolo: boolean,
  faction: string,              // 'Goblins', 'Demons', etc.
  abilities: string[],          // ability names (text only for now)
  maliceFeatures: string[]      // faction malice feature names
}
```

### /campaigns/{campaignId}
```
{
  name: string,                 // 'The Shattered Isles Campaign'
  directorId: string,           // uid of the GM
  advancementMode:              // 'xp' | 'milestone' | 'director'
    'xp' | 'milestone' | 'director',
  createdAt: timestamp,
  isActive: boolean,            // only one active campaign per director

  // Hero roster — manually managed by GM
  heroes: [{
    heroId: string,             // optional: links to /users/.../characters
    userId: string,             // optional: the player's uid
    displayName: string,        // shown in encounter builder
    class: string,
    ancestry: string,
    level: number,
    xp: number,                 // cumulative, permanent
    currentVictories: number,   // resets at Respite
    recoveries: { current, max },  // resets at Respite
    notes: string,              // GM background notes on this hero
    isLinked: boolean           // true if heroId points to a live character
  }],

  // Session history
  sessionLog: [{
    date: timestamp,
    summary: string,            // GM freetext
    victoriesEarned: number,
    respiteTaken: boolean
  }]
}
```

### /campaigns/{campaignId}/encounters/{encounterId}
```
{
  name: string,                 // 'Goblin Ambush at the Bridge'
  status: 'draft'|'ready'|'active'|'complete',
  type: 'combat'|'negotiation'|'montage'|'custom',
  order: number,                // GM-set ordering within campaign
  createdAt: timestamp,
  completedAt: timestamp,

  // Combat encounter fields
  difficulty: 'trivial'|'easy'|'standard'|'hard'|'extreme',
  goalType: string,             // 'defeat_all'|'protect'|'survive'|'escape'|'custom'
  goalDescription: string,      // freetext
  expectedVictories: number,    // 0, 1, or 2
  encounterBudget: number,      // computed from party ES + difficulty
  budgetSpent: number,          // sum of all monster EVs

  // Monster roster
  groups: [{
    groupId: string,
    monsterId: string,          // references /monsters collection
    monsterName: string,        // denormalized for display
    count: number,
    ev: number,                 // encounter value per monster
    totalEV: number,            // count × ev
    isSquad: boolean,
    squadStamina: number,       // if squad: pooled HP
    isBoss: boolean,
    notes: string
  }],

  // Custom NPCs (GM-created, not from compendium)
  customNPCs: [{
    name: string,
    stamina: number,
    ev: number,
    isBoss: boolean,
    notes: string
  }],

  // Negotiation fields (when type === 'negotiation')
  negotiation: {
    npcName: string,
    patience: number,           // rounds before NPC gives up
    startingInterest: number,   // 1–5
    currentInterest: number,
    motivations: string[],
    pitfalls: string[],
    outcome: string
  },

  // Terrain / environment notes
  terrain: string,
  mapNotes: string,

  // Live session link
  sessionCode: string,          // populated when 'Start Encounter' is tapped
  victoriesAwarded: number,     // recorded after completion
  gmNotes: string
}
```

## Ability Card Tag System
Each card has two tag layers:

**Availability tags** (always visible):
- `SIGNATURE` — gold, no cost, never locked
- `ONCE/ENCOUNTER` — orange, locks after use until session ends
- `ONCE/TURN` — blue, resets on End Turn
- `TRIGGERED` — purple, greyed on your own turn
- Resource pips — green if affordable, red if not

**Combat state tags** (session only):
- `ACTION AVAILABLE` → `ACTION SPENT` — teal → grey, locks all other action cards
- `MANEUVER AVAILABLE` → `MANEUVER SPENT` — same pattern
- Five buckets: action, maneuver, triggered, free-triggered, free-strike

## Visual Design
- Dark base: `#0F1117` background, deep navy cards
- Class accent colors (see class-colors.js)
- Teal = available/ready, Red = spent/danger, Gold = signature
- Card collapsed: shows name, type badge, resource pips, tier 2 summary
- Card expanded: all three tiers, kit modifiers, USE THIS ABILITY button

## Class Accent Colors
```
Fury:         #C0392B  (Blood Red)    resource: Rage
Tactician:    #2980B9  (Steel Blue)   resource: Focus
Shadow:       #6C3483  (Deep Purple)  resource: Insight
Conduit:      #D4AC0D  (Holy Gold)    resource: Piety
Elementalist: #E67E22  (Ember Orange) resource: Essence
Null:         #717D7E  (Void Grey)    resource: Discipline
Talent:       #9B59B6  (Psionic Violet) resource: Clarity
```

## Build Phases
- **Phase 0**: Seed /abilities from Steel Compendium (scripts/seed-local.js)
- **Phase 1**: Auth + character shell
- **Phase 2**: 10-step creation wizard
- **Phase 3**: Ability card viewer with full tag system
- **Phase 4**: Session mode + live Firestore sync
- **Phase 5**: Polish — class theming, mobile UX, kit modifiers

## Known Firebase Gotchas
- Node engine must be `"22"` in functions/package.json
- firestore.indexes.json must have `{ "indexes": [], "fieldOverrides": [] }`
- Firebase deploy port may need to be 22 depending on network
- firebase-config.js must be manually pasted — never commit real credentials
- After any file replacement, re-paste the Firebase config block

## How to Talk to Claude Code
Claude Code works best with specific, scoped instructions. Examples:
- "Build the ability card component in public/js/abilities.js"
- "Write the Firestore security rules in firestore.rules"
- "Add the End Turn flow to session.js"
- "Run the seed script and show me the output"

Always tell Claude Code which phase you're working on and which file to edit.
