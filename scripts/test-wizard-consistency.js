/**
 * Proves the character CREATOR's level-up math agrees with the Forge Steel
 * IMPORT engine (which is validated against real exports by test-ds-hero.js).
 * A hero built + leveled in the wizard must end up with the same Stamina,
 * characteristics, and recoveries as the same hero imported at that level.
 *
 * Loads the real wizard functions from character.js in a VM with DOM stubs
 * (same technique as test-encounter-math.js) so we test shipping code, not a
 * copy. Only covers creator-supported classes with a fixture (Tactician,
 * Elementalist) — the classes without a fixture can't be machine-verified.
 *
 * Run: node scripts/test-wizard-consistency.js
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const DSHero = require('../public/js/ds-hero-import.js');

// ── Load wizard-data.js + character.js in a forgiving sandbox ────────────────

const noop = () => {};
const fakeEl = new Proxy({}, {
  get: (_t, prop) => (prop === 'style' ? {} : (prop === 'classList' ? { add: noop, remove: noop, toggle: noop } : noop)),
});
const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, Date, isNaN, parseInt, parseFloat,
  setTimeout: noop, clearTimeout: noop,
  document: {
    getElementById: () => fakeEl, querySelector: () => fakeEl,
    querySelectorAll: () => [], createElement: () => fakeEl,
    addEventListener: noop, documentElement: { style: { setProperty: noop } },
  },
  window: {}, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  db: {}, firebase: {}, AppState: {}, SCREENS: {},
  showScreen: noop, showToast: noop, showModal: noop, hideModal: noop,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/wizard-data.js'), 'utf8'), sandbox, { filename: 'wizard-data.js' });
// `const` top-level bindings aren't attached to the VM context — append an
// epilogue in the same script scope so the pure stat pieces are reachable.
const charSrc = fs.readFileSync(path.join(__dirname, '..', 'public/js/character.js'), 'utf8')
  + '\n;globalThis.__wizard = { computeMaxHP, computeCharacteristicsForLevel, CLASS_RECOVERIES };';
vm.runInContext(charSrc, sandbox, { filename: 'character.js' });

const { computeMaxHP, computeCharacteristicsForLevel, CLASS_RECOVERIES } = sandbox.__wizard;

// ── Helpers ──────────────────────────────────────────────────────────────────

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${pass ? '✓' : '✗'} ${label}${pass ? '' : ` — wizard ${JSON.stringify(actual)} vs engine ${JSON.stringify(expected)}`}`);
  if (!pass) failures++;
}

function baseChars(hero) {
  const m = { Might: 'MGT', Agility: 'AGL', Reason: 'REA', Intuition: 'INU', Presence: 'PRS' };
  const out = { MGT: 0, AGL: 0, REA: 0, INU: 0, PRS: 0 };
  for (const c of hero.class.characteristics || []) out[m[c.characteristic]] = c.value;
  return out;
}
function kitNames(hero) {
  const walk = (a, o = []) => { for (const raw of a || []) { const f = raw.feature || raw; o.push(f); if (f.data?.features) walk(f.data.features.map(x => x.feature || x), o); if (f.data?.selected) walk(f.data.selected.map(x => x.feature || x), o); } return o; };
  const feats = walk(hero.class.featuresByLevel.filter(l => l.level <= hero.class.level).flatMap(l => l.features));
  const kits = feats.filter(f => f.type === 'Kit').flatMap(f => f.data?.selected || []).map(k => k.name);
  return [kits[0] || null, kits[1] || null];
}

// Classes whose per-level advancement is fully DETERMINISTIC — no build-time
// stat choices — so the wizard can reproduce the importer exactly. Tactician
// has two fixed primaries and no stamina-granting feature choices.
const DETERMINISTIC = [
  ['bert__2_.ds-hero', 'Tactician L3'],
  ['bert__3_.ds-hero', 'Tactician L4'],
];

console.log('Deterministic classes — wizard must match the import engine exactly');
for (const [file, label] of DETERMINISTIC) {
  console.log(`\n${label}`);
  const hero = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', file), 'utf8'));
  const { character: engine } = DSHero.project(hero);
  const [k1, k2] = kitNames(hero);
  eq('maxStamina', computeMaxHP(hero.class.name, k1, hero.class.level, k2), engine.maxHP);
  eq('characteristics', computeCharacteristicsForLevel(baseChars(hero), hero.class.level, hero.class.name), engine.characteristics);
  eq('recoveries', CLASS_RECOVERIES[hero.class.name], engine.recoveries.max);
}

// Elementalist advancement involves player CHOICES the wizard doesn't model:
// which non-primary to boost at 4th level, and which Enchantment (some grant
// Stamina). The deterministic parts still match; the rest is documented, not
// a failure — it's the "wizard doesn't capture per-level choices" limitation.
console.log('\nChoice-driven classes — deterministic parts match, choices documented');
for (const [file, label] of [['Scorpo.ds-hero', 'Elementalist L5'], ['Scorpo__1_.ds-hero', 'Elementalist L7']]) {
  console.log(`\n${label}`);
  const hero = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', file), 'utf8'));
  const { character: engine } = DSHero.project(hero);
  eq('recoveries (deterministic)', CLASS_RECOVERIES[hero.class.name], engine.recoveries.max);
  const wHP = computeMaxHP(hero.class.name, ...(() => { const [a, b] = kitNames(hero); return [a, hero.class.level, b]; })());
  const wCh = computeCharacteristicsForLevel(baseChars(hero), hero.class.level, hero.class.name);
  if (wHP !== engine.maxHP) console.log(`  · stamina differs by ${engine.maxHP - wHP} — build-choice feature (e.g. Enchantment of Battle grants Stamina); wizard doesn't model enchantment picks`);
  if (JSON.stringify(wCh) !== JSON.stringify(engine.characteristics)) console.log(`  · characteristics differ — 4th-level lets a single-primary class boost one extra characteristic of choice; wizard applies primaries only`);
}

console.log(failures === 0
  ? '\n✓ Wizard math matches the validated import engine on all deterministic values'
  : `\n✗ ${failures} mismatch(es) on values the wizard SHOULD compute exactly`);
process.exit(failures === 0 ? 0 : 1);
