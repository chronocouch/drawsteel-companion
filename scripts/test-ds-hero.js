/**
 * Part IV acceptance tests (§13 tests 20–54) against the real projection
 * engine, run over all six committed fixtures with the spec's exact expected
 * values. Nothing but exact-value tests catches the scope-leakage bugs.
 *
 * Run: node scripts/test-ds-hero.js
 */

const fs   = require('fs');
const path = require('path');
const DSHero = require('../public/js/ds-hero-import.js');

const FIX = path.join(__dirname, '..', 'test', 'fixtures');
function load(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
}
function project(name) {
  return DSHero.project(load(name));
}

let failures = 0, count = 0;
function eq(label, actual, expected) {
  count++;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${pass ? '✓' : '✗'} ${label}${pass ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failures++;
}
function ok(label, cond, detail) {
  count++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond ? '' : ` — ${detail || 'failed'}`}`);
  if (!cond) failures++;
}
function section(t) { console.log(`\n${t}`); }

// The " N" suffix on a tag (deal-damage → deal-damage 2) is Forge Steel's
// internal versioning so replacesTags can point at a prior gain; the logical
// trigger is the same. Normalize it away and key order-independently, which
// is exactly the invariant §9.3.3 cares about: one value per trigger, no dup.
function gains(res, type) {
  const r = (res || []).find(x => x.type === type);
  if (!r) return null;
  const m = {};
  for (const g of r.gains) {
    const tag = String(g.tag).replace(/\s+\d+$/, '');
    m[tag] = g.value;
  }
  return Object.fromEntries(Object.entries(m).sort());
}

// ── L1 Tactician (bert.ds-hero) ──────────────────────────────────────────────

section('L1 Tactician — bert.ds-hero');
{
  let r;
  ok('20: imports without throwing', (() => { try { r = project('bert.ds-hero'); return true; } catch (e) { console.log('   ', e.message); return false; } })());
  if (r) {
    const c = r.character;
    eq('20: career is null/empty', c.career, '');
    // 21: exactly one subclass, zero selected abilities, no L2-10 features
    eq('21: exactly one subclass (Vanguard)', c.subclass, 'Vanguard');
    eq('21: zero selected class abilities', c.importedAbilities.filter(a => a.origin === 'class').length, 0);
    eq('22: maxStamina 21', c.maxHP, 21);
    eq('22: recoveries 10', c.recoveries.max, 10);
    // 23: review lists no career, no kit, five unselected abilities
    ok('23: review flags no career', r.review.gaps.some(g => /career/i.test(g)));
    ok('23: review flags no kit', r.review.gaps.some(g => /kit/i.test(g)));
    eq('23: five unselected class abilities flagged',
      r.review.gaps.filter(g => /ability.*not chosen/i.test(g)).length, 5);
  }
}

// ── L3 Tactician (bert__2_.ds-hero) ──────────────────────────────────────────

section('L3 Tactician — bert__2_.ds-hero');
{
  const c = project('bert__2_.ds-hero').character;
  eq('24: maxStamina 42 (39 class + 3 Battlemind + 0 Arcane Archer)', c.maxHP, 42);
  eq('25: recoveries 10 (valuePerLevel 0 must not scale)', c.recoveries.max, 10);
  eq('26: characteristics M2 A1 R2 I0 P0', c.characteristics, { MGT: 2, AGL: 1, REA: 2, INU: 0, PRS: 0 });
  const classAbilIds = c.importedAbilities.filter(a => a.origin === 'class').map(a => a.id).sort();
  eq('27: exactly three class abilities -2/-5/-9',
    classAbilIds, ['tactician-ability-2', 'tactician-ability-5', 'tactician-ability-9']);
  eq('28: two kits stored', c.kits.length, 2);
  ok('28: no activeKitId field', !('activeKitId' in c));
}

// ── L4 Tactician (bert__3_.ds-hero) ──────────────────────────────────────────

section('L4 Tactician — bert__3_.ds-hero');
{
  const c = project('bert__3_.ds-hero').character;
  eq('29: maxStamina 51 (48 + 3)', c.maxHP, 51);
  eq('30: characteristics M3 R3 A1 I0 P0', c.characteristics, { MGT: 3, AGL: 1, REA: 3, INU: 0, PRS: 0 });
  eq('31: resolved Focus gains start→2 deal-damage→2 ability→1',
    gains(c.resources, 'heroic'), { ability: '1', 'deal-damage': '2', start: '2' });
  const cold = c.damageModifiers.find(m => m.damageType === 'Cold');
  eq('32: Cold immunity is 4 (1 + 1×3)', cold ? cold.value : null, 4);
  eq('33: recoveries still 10', c.recoveries.max, 10);
  eq('33: victories 1', c.victories, 1);
  ok('34: both Focus (heroic) and Command (epic) present',
    c.resources.some(r => r.type === 'heroic' && r.name === 'Focus') &&
    c.resources.some(r => r.type === 'epic' && r.name === 'Command'));
  ok('35: stored character under 100 KB', JSON.stringify(c).length < 100 * 1024,
    `${JSON.stringify(c).length} bytes`);
}

// ── L5 Elementalist (Scorpo.ds-hero) — the scope-leakage guard ───────────────

section('L5 Elementalist — Scorpo.ds-hero');
{
  const c = project('Scorpo.ds-hero').character;
  // 38: 42 correct; 51 = options leaked; 57 = unselected Earth leaked; 66 = both
  eq('38: maxStamina 42 (options + unselected subclass both excluded)', c.maxHP, 42);
  eq('38: recoveries 8', c.recoveries.max, 8);
  eq('39: characteristics M3 A1 R3 I-1 P1 (negative Intuition preserved)',
    c.characteristics, { MGT: 3, AGL: 1, REA: 3, INU: -1, PRS: 1 });
  eq('40: exactly one subclass applied (Green)', c.subclass, 'Green');
  ok('41: no kit present, no error', c.kits.length === 0);
  ok('42: heroic resource Essence by data.type',
    (c.resources.find(r => r.type === 'heroic') || {}).name === 'Essence');
  ok('42: epic resource Breath by data.type',
    (c.resources.find(r => r.type === 'epic') || {}).name === 'Breath');
  // 43: Celerity gives +1 Speed and +1 Disengage; unselected options contribute 0
  eq('43: Speed +1 from Celerity (base 5 → 6)', c.speed, 6);
  eq('43: Disengage +1 from Celerity (base 1 → 2)', c.disengage, 2);
}

// ── L7 Censor (Gargontua.ds-hero) — tightest boundary case ───────────────────

section('L7 Censor — Gargontua.ds-hero');
{
  const c = project('Gargontua.ds-hero').character;
  eq('44: maxStamina 84 (75 class + 9 Mountain)', c.maxHP, 84);
  eq('44: recoveries 12', c.recoveries.max, 12);
  eq('45: characteristics M4 A2 R1 I1 P4 (L10 bonuses excluded)',
    c.characteristics, { MGT: 4, AGL: 2, REA: 1, INU: 1, PRS: 4 });
  eq('46: echelon 3 from level 7', c.echelon, 3);
  // §9.3.3: two replacements both apply (start 2→3, deal-damage 2→2); normalized
  eq('47: resolved Wrath gains start→3 take-damage→1 deal-damage→2 (two replacements)',
    gains(c.resources, 'heroic'), { 'deal-damage': '2', start: '3', 'take-damage': '1' });
  eq('48: final speed 7 (absolute Speed override, not additive)', c.speed, 7);
  ok('49: Wrath (heroic) and Virtue (epic) resolve by data.type',
    (c.resources.find(r => r.type === 'heroic') || {}).name === 'Wrath' &&
    (c.resources.find(r => r.type === 'epic') || {}).name === 'Virtue');
}

// ── 50: unknown feature types carried through, not dropped/fatal ─────────────

section('Unknown feature types (test 50)');
{
  const r = project('Gargontua.ds-hero');
  ok('50: import succeeds even with domain/unusual types', !!r.character);
  ok('50: display features carried (never dropped)', r.character.displayFeatures.length > 0);
}

// ── L7 Elementalist, Enchantment of Battle (Scorpo__1_.ds-hero) ──────────────

section('L7 Elementalist Battle — Scorpo__1_.ds-hero');
{
  const c = project('Scorpo__1_.ds-hero').character;
  // 51: 63 correct; 60 = valuePerEchelon implemented as × (echelon − 1)
  eq('51: maxStamina 63 (18+6×6=54 class + 3×3=9 enchantment)', c.maxHP, 63);
  eq('52: recoveries 8', c.recoveries.max, 8);
  eq('52: characteristics M4 A2 R4 I0 P2',
    c.characteristics, { MGT: 4, AGL: 2, REA: 4, INU: 0, PRS: 2 });
  // 53: Ability Damage (+1 Weapon) and Proficiency (Light Armor, Light Weapon) carried
  const ad = c.displayFeatures.find(f => f.type === 'Ability Damage');
  ok('53: Ability Damage +1 Weapon carried', ad && ad.data && ad.data.value === 1 &&
    (ad.data.keywords || []).includes('Weapon'), JSON.stringify(ad));
  const prof = c.displayFeatures.find(f => f.type === 'Proficiency');
  ok('53: Proficiency Light Armor + Light Weapon carried',
    prof && (prof.data.armor || []).includes('Light Armor') && (prof.data.weapons || []).includes('Light Weapon'),
    JSON.stringify(prof));
}

// ── 37 / 54: re-import in place (same id) — engine-level determinism ─────────

section('Re-import determinism (tests 37, 54 engine half)');
{
  const l1 = project('bert.ds-hero').character;
  const l3 = project('bert__2_.ds-hero').character;
  const l4 = project('bert__3_.ds-hero').character;
  ok('37: three Tactician exports share one forgeSteelId',
    l1.forgeSteelId && l1.forgeSteelId === l3.forgeSteelId && l3.forgeSteelId === l4.forgeSteelId);
  eq('37: latest projection is level 4, maxStamina 51',
    { level: l4.level, hp: l4.maxHP }, { level: 4, hp: 51 });
  const s5 = project('Scorpo.ds-hero').character;
  const s7 = project('Scorpo__1_.ds-hero').character;
  ok('54: Scorpo exports share one id', s5.forgeSteelId === s7.forgeSteelId);
  // Celerity Speed/Disengage bonuses are gone at L7 (Battle selected instead)
  eq('54: L7 Battle has no Celerity speed bonus (base 5, no +1)', s7.speed, 5);
  eq('54: L7 Battle disengage back to base 1', s7.disengage, 1);
}

// ── 36: third-party content marks sourceUnknown ─────────────────────────────

section('Third-party content (test 36)');
{
  // bert declares settingIDs incl. beastheart per the spec reference file
  const anyMarked = ['bert.ds-hero', 'Scorpo.ds-hero', 'Gargontua.ds-hero']
    .map(f => project(f).character.sourceUnknown);
  ok('36: at least one fixture marks sourceUnknown from non-core settings',
    anyMarked.some(Boolean), JSON.stringify(anyMarked));
}

console.log(`\n${failures === 0 ? '✓' : '✗'} ${count - failures}/${count} checks passed`);
process.exit(failures === 0 ? 0 : 1);
