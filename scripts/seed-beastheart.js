/**
 * Seed Beastheart class abilities into Firestore /abilities collection.
 *
 * Run once: node scripts/seed-beastheart.js
 *
 * Schema matches existing seeded abilities (see seed-local.js parseAbilityFile):
 *   name, class, type, cost, isSignature, frequency,
 *   keywords, distance, target, tier1, tier2, tier3,
 *   effect, spendEffects, kitModifiers, flavor, level
 */

const admin = require('firebase-admin');

const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID || 'drawsteel-companion',
});
const db = admin.firestore();

const BEASTHEART_ABILITIES = [
  {
    id: 'beastheart-relentless-companion',
    name: 'Relentless Companion',
    class: 'Beastheart',
    level: 1,
    isSignature: true,
    type: 'action',
    cost: 0,
    frequency: 'at-will',
    keywords: ['Animal', 'Companion'],
    distance: 'Self + Companion',
    target: 'One creature',
    tier1: 'You and your companion each make a free strike against the same target.',
    tier2: 'You and your companion each make a free strike. Each deals bonus damage equal to your Intuition score.',
    tier3: 'You and your companion each make a free strike. Each deals bonus damage equal to twice your Intuition score.',
    effect: 'Your companion can move up to their speed before or after either strike.',
    spendEffects: [],
    kitModifiers: [],
    flavor: '',
  },
  {
    id: 'beastheart-pack-tactics',
    name: 'Pack Tactics',
    class: 'Beastheart',
    level: 1,
    isSignature: false,
    type: 'action',
    cost: 3,
    frequency: 'at-will',
    keywords: ['Animal', 'Companion'],
    distance: 'Self + Companion',
    target: 'One creature',
    tier1: 'You and your companion both make a free strike against the same target. If both hit, push the target 3 squares.',
    tier2: 'You and your companion both make a free strike with a +2 damage bonus. If both hit, push the target 3 squares and knock them prone.',
    tier3: 'You and your companion both make a free strike with a +4 damage bonus. If both hit, push the target 5 squares and knock them prone.',
    effect: 'Spend 3 Ferocity.',
    spendEffects: [],
    kitModifiers: [],
    flavor: '',
  },
  {
    id: 'beastheart-ferocious-roar',
    name: 'Ferocious Roar',
    class: 'Beastheart',
    level: 1,
    isSignature: false,
    type: 'action',
    cost: 3,
    frequency: 'at-will',
    keywords: ['Animal', 'Companion', 'Fear'],
    distance: 'Burst 3 around companion',
    target: 'All enemies in area',
    tier1: 'Your companion releases a terrifying roar. Enemies within 3 squares of your companion take 3 + Might psychic damage and are Frightened until end of their next turn.',
    tier2: 'Enemies within 3 squares take 5 + Might psychic damage and are Frightened (save ends).',
    tier3: 'Enemies within 4 squares take 7 + Might psychic damage and are Frightened (save ends). Frightened enemies also take a bane on their saves against this effect.',
    effect: 'Spend 3 Ferocity.',
    spendEffects: [],
    kitModifiers: [],
    flavor: '',
  },
  {
    id: 'beastheart-wild-frenzy',
    name: 'Wild Frenzy',
    class: 'Beastheart',
    level: 1,
    isSignature: false,
    type: 'action',
    cost: 5,
    frequency: 'at-will',
    keywords: ['Animal', 'Companion'],
    distance: 'Self + Companion',
    target: 'Multiple creatures',
    tier1: 'Your companion makes two free strikes against different targets. You make one free strike against any target.',
    tier2: 'Your companion makes two free strikes with +3 damage against different targets. You make one free strike with +2 damage.',
    tier3: 'Your companion makes three free strikes with +3 damage each. You make one free strike with +4 damage.',
    effect: 'Spend 5 Ferocity.',
    spendEffects: [],
    kitModifiers: [],
    flavor: '',
  },
  {
    id: 'beastheart-apex-predator',
    name: 'Apex Predator',
    class: 'Beastheart',
    level: 1,
    isSignature: false,
    type: 'action',
    cost: 5,
    frequency: 'at-will',
    keywords: ['Animal', 'Companion', 'Move'],
    distance: 'Self + Companion',
    target: 'One creature each',
    tier1: 'You and your companion each move up to your speed, then make a free strike. Strikes deal +2 bonus damage if the target is Slowed, Prone, Grabbed, or Bleeding.',
    tier2: 'You and your companion each move up to your speed + 2, then make a free strike with +3 damage. Conditional bonus increases to +4.',
    tier3: 'You and your companion each move up to your speed + 3, then each make two free strikes with +3 damage. Conditional bonus increases to +5.',
    effect: 'Spend 5 Ferocity.',
    spendEffects: [],
    kitModifiers: [],
    flavor: '',
  },
];

async function seedBeastheartAbilities() {
  console.log('Seeding Beastheart abilities...');

  const batch = db.batch();
  for (const ability of BEASTHEART_ABILITIES) {
    const { id, ...data } = ability;
    const ref = db.collection('abilities').doc(id);
    batch.set(ref, data, { merge: true });
    console.log(`  Queued: ${data.name} (${data.isSignature ? 'signature' : `${data.cost}pt heroic`})`);
  }

  await batch.commit();
  console.log(`\nDone — seeded ${BEASTHEART_ABILITIES.length} Beastheart abilities.`);
  process.exit(0);
}

seedBeastheartAbilities().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
