/**
 * Part I acceptance tests (§13 tests 3, 5, 6, 7) against the real code:
 *   - parseEV from scripts/seed-monsters.js
 *   - partyES / computeSpent / groupEV / slot math from public/js/campaign.js
 *
 * Run: node scripts/test-encounter-math.js
 * Exits non-zero on any failure.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const { parseEV, splitRolesOrg } = require('./seed-monsters.js');

// ── Load campaign.js in a sandbox with browser stubs ─────────────────────────

const nullEl = null;
const sandbox = {
  console, setTimeout, clearTimeout,
  document: {
    getElementById:   () => nullEl,
    querySelectorAll: () => [],
    querySelector:    () => nullEl,
    createElement:    () => ({ appendChild() {}, classList: { add() {}, toggle() {} }, style: {} }),
    addEventListener: () => {},
  },
  window: {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  db: {}, firebase: {}, AppState: {},
  MonsterSearch: { init: async () => {}, getById: () => null },
  showToast: () => {}, showModal: () => {}, hideModal: () => {},
  CLASS_COLORS: {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);

const campaignSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'campaign.js'), 'utf8');
vm.runInContext(campaignSrc, sandbox, { filename: 'campaign.js' });

const { partyES, computeSpent, groupEV, encounterSlotsUsed, encounterSlotsAvailable, encounterBudgets } = sandbox;

// ── Tiny assert ──────────────────────────────────────────────────────────────

let failures = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${pass ? '✓' : '✗'} ${label}${pass ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failures++;
}

// ── Test 3: parseEV over all four formats ────────────────────────────────────

console.log('\nTest 3 — parseEV formats');
check(`'3'`,                    parseEV('3'),                    { value: 3, mode: 'per_creature' });
check(`'3 for 4 minions'`,      parseEV('3 for 4 minions'),      { value: 3, mode: 'per_four_minions' });
check(`'3 for four minions'`,   parseEV('3 for four minions'),   { value: 3, mode: 'per_four_minions' });
check(`'-'`,                    parseEV('-'),                    { value: null, mode: 'non_purchasable' });
check(`garbage → unparsed`,     parseEV('lots'),                 { value: null, mode: 'unparsed' });

console.log('\nRole/org split spot checks');
check(`'Horde Hexer'`,   splitRolesOrg(['Horde Hexer']),   { organization: 'horde', role: 'hexer', unrecognized: [] });
check(`'Solo'`,          splitRolesOrg(['Solo']),          { organization: 'solo', role: null, unrecognized: [] });
check(`'Elite Support'`, splitRolesOrg(['Elite Support']), { organization: 'elite', role: 'support', unrecognized: [] });
check(`'Platoon Mount'`, splitRolesOrg(['Platoon Mount']), { organization: 'platoon', role: 'mount', unrecognized: [] });
check(`'Minion Harrier'`, splitRolesOrg(['Minion Harrier']), { organization: 'minion', role: 'harrier', unrecognized: [] });

// ── Test 5: Encounter Strength ───────────────────────────────────────────────

console.log('\nTest 5 — Encounter Strength');
const fiveLvl3 = Array.from({ length: 5 }, () => ({ level: 3, currentVictories: 0 }));
check('5 heroes Lv3, 0 Victories → 50', partyES(fiveLvl3), 50);
const fiveLvl3Vic4 = Array.from({ length: 5 }, () => ({ level: 3, currentVictories: 4 }));
check('same party, 4 Victories each → 70', partyES(fiveLvl3Vic4), 70);

// ── Test 6: EV total and hero slots ──────────────────────────────────────────

console.log('\nTest 6 — Cursespitters + Zombies');
const enc = {
  difficulty: 'standard',
  groups: [
    { monsterName: 'Goblin Cursespitter', organization: 'horde',  role: 'hexer',
      ev: 3, evMode: 'per_creature',      count: 3, monsterLevel: 1 },
    { monsterName: 'Rotting Zombie',      organization: 'minion', role: 'brute',
      ev: 3, evMode: 'per_four_minions',  count: 8, monsterLevel: 1 },
  ],
  customNPCs: [],
};
check('total EV 15', computeSpent(enc), 15);
check('hero slots 2.5', encounterSlotsUsed(enc, 1), 2.5);

// BUG-1 regression: 8 minions at "3 for 4" must cost 6, not 24
check('8 minions cost 2×3 EV', groupEV(enc.groups[1]), 6);

// ── Test 7: non_purchasable adds 0 EV ────────────────────────────────────────

console.log('\nTest 7 — non-purchasable monsters');
const before = computeSpent(enc);
enc.groups.push({ monsterName: "Xorannox Eye", organization: null, role: 'hexer',
                  ev: null, evMode: 'non_purchasable', count: 1, monsterLevel: 5 });
check('budgetSpent unchanged', computeSpent(enc), before);

// ── BUG-6/7 sanity: bands from heroES(avgLevel); allies raise ES ─────────────

console.log('\nBUG-6/7 sanity');
const b = encounterBudgets(fiveLvl3);
check('standard band = ES + heroES(avgLevel) = 60', b.standardMax, 60);
check('hard band = ES + 3×heroES(avgLevel) = 80', b.hardMax, 80);
check('2 allied Lv3 NPCs add 20 ES', partyES(fiveLvl3, { count: 2, level: 3 }), 70);
check('trivial difficulty subtracts 2 slots',
  encounterSlotsAvailable(fiveLvl3, { difficulty: 'trivial', alliedCount: 0 }, b.breakdown), 3);

// ── Result ───────────────────────────────────────────────────────────────────

console.log(failures === 0 ? '\n✓ All encounter-math tests passed' : `\n✗ ${failures} test(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
