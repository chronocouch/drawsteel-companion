/**
 * Draw Steel Companion — Monster Seed Script
 *
 * Downloads the SteelCompendium/data-bestiary-json repo as a zip,
 * parses every Statblocks/*.json file, and writes them to Firestore.
 *
 * Usage:
 *   node scripts/seed-monsters.js --dry-run
 *       Parse + verify only. No Firestore connection needed.
 *   node scripts/seed-monsters.js --collection monsters_staging
 *       Seed into a fresh collection. Never seed directly into /monsters —
 *       verify the staging collection first, then promote.
 *   node scripts/seed-monsters.js --promote monsters_staging
 *       Copy the verified staging collection into /monsters, deleting any
 *       /monsters doc not present in staging.
 *
 * Prerequisites for writing:
 *   1. gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *   2. npm install in scripts/ (firebase-admin must be available)
 *   3. Your Firebase project ID set in .firebaserc or FIREBASE_PROJECT_ID
 */

const https    = require('https');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { execSync } = require('child_process');

// ── Download helpers ─────────────────────────────────────────────────────────

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => { out.close(); resolve(); });
        out.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

async function downloadRepo() {
  const zipUrl  = 'https://github.com/SteelCompendium/data-bestiary-json/archive/refs/heads/main.zip';
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'drawsteel-monsters-'));
  const zipPath = path.join(tmpDir, 'repo.zip');

  process.stdout.write('  Downloading bestiary repo zip...');
  await downloadToFile(zipUrl, zipPath);
  console.log(' done');

  process.stdout.write('  Extracting...');
  execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`);
  console.log(' done');

  // Zip extracts to data-bestiary-json-main/
  return path.join(tmpDir, 'data-bestiary-json-main');
}

// ── Slug helper ──────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Role / organization split ────────────────────────────────────────────────
// Each `roles` element fuses organization and role ("Horde Hexer", "Solo").
// Split on whitespace and classify tokens against two closed vocabularies.
// Both fields are nullable: Leader/Solo monsters carry no role, and a handful
// of monsters (Xorannox's eyes) carry a role but no organization.

const ORGANIZATIONS = ['minion', 'horde', 'platoon', 'elite', 'leader', 'solo'];
const ROLES = ['ambusher', 'artillery', 'brute', 'controller', 'defender',
               'harrier', 'hexer', 'mount', 'support'];

function splitRolesOrg(rawRoles) {
  let organization = null;
  let role         = null;
  const unrecognized = [];

  for (const el of rawRoles || []) {
    for (const token of String(el).trim().split(/\s+/)) {
      const t = token.toLowerCase();
      if (!t) continue;
      if (ORGANIZATIONS.includes(t))      organization = t;
      else if (ROLES.includes(t))         role = t;
      else                                unrecognized.push(token);
    }
  }
  return { organization, role, unrecognized };
}

// ── Parse "Fire 6" / "poison 10" → { type, value } ──────────────────────────

function parseResistanceList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(entry => {
    const m = String(entry).match(/^(.+?)\s+(\d+)$/);
    if (!m) return null;
    return { type: m[1].toLowerCase().trim(), value: parseInt(m[2], 10) };
  }).filter(Boolean);
}

// ── parseEV — four formats, per spec §5.4 ────────────────────────────────────
// Minion EV is priced per group of four; '-' means not purchasable.

function parseEV(raw) {
  const s = String(raw ?? '').trim();
  if (s === '-')       return { value: null, mode: 'non_purchasable' };
  if (/^\d+$/.test(s)) return { value: parseInt(s, 10), mode: 'per_creature' };
  const m = s.match(/^(\d+)\s+for\s+(4|four)\s+minions$/i);
  if (m)               return { value: parseInt(m[1], 10), mode: 'per_four_minions' };
  return { value: null, mode: 'unparsed' };
}

// ── Parse movement types ──────────────────────────────────────────────────────
// "movement" can be "Fly", "Climb", "Burrow", "Teleport", or undefined (walk)

function parseMovement(movement) {
  if (!movement) return [];
  return movement.split(/[,/]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

// ── Parse a single statblock JSON ────────────────────────────────────────────

function parseStatblock(json, factionName, maliceFeatureNames, issues) {
  if (!json || json.type !== 'statblock') return null;

  const rawRoles = json.roles || [];
  const { organization, role, unrecognized } = splitRolesOrg(rawRoles);
  const { value: ev, mode: evMode } = parseEV(json.ev);

  if (unrecognized.length) {
    issues.push({ monster: json.name, kind: 'unrecognized-role-token',
                  detail: `${unrecognized.join(', ')} (raw: ${JSON.stringify(rawRoles)})` });
  }
  if (evMode === 'unparsed') {
    issues.push({ monster: json.name, kind: 'unparsed-ev',
                  detail: `raw ev: ${JSON.stringify(json.ev)}` });
  }

  // Collect ability names from features
  const abilities = (json.features || [])
    .filter(f => f.feature_type === 'ability' && f.name)
    .map(f => f.name);

  return {
    name:            json.name || '',
    level:           json.level ?? 1,
    ev,
    evMode,
    organization,
    role,
    keywords:        Array.isArray(json.ancestry) ? json.ancestry : [],
    stamina:         parseInt(json.stamina, 10) || 0,
    speed:           json.speed ?? 5,
    size:            json.size || '1M',
    stability:       json.stability ?? 0,
    freeStrike:      json.free_strike ?? 0,
    characteristics: {
      MGT: json.might      ?? 0,
      AGL: json.agility    ?? 0,
      REA: json.reason     ?? 0,
      INU: json.intuition  ?? 0,
      PRS: json.presence   ?? 0,
    },
    immunities:      parseResistanceList(json.immunities),
    weaknesses:      parseResistanceList(json.weaknesses),
    movementTypes:   parseMovement(json.movement),
    // Derived from organization — kept so existing call sites survive
    isMinion:        organization === 'minion',
    isSolo:          organization === 'solo',
    faction:         factionName,
    abilities,
    maliceFeatures:  maliceFeatureNames,
  };
}

// ── Walk the Monsters/ directory ─────────────────────────────────────────────

function parseMaliceFeatureNames(featuresDir) {
  if (!fs.existsSync(featuresDir)) return [];
  const names = [];
  for (const file of fs.readdirSync(featuresDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const json = JSON.parse(fs.readFileSync(path.join(featuresDir, file), 'utf8'));
      for (const f of json.features || []) {
        if (f.name) names.push(f.name);
      }
    } catch (_) {}
  }
  return names;
}

// Statblocks dirs are not always directly under the faction dir — Rivals
// nests them per echelon (Rivals/<Echelon>/Statblocks/). Walk recursively.
function findStatblockFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findStatblockFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json') &&
               path.basename(dir) === 'Statblocks') {
      results.push(full);
    }
  }
  return results;
}

function parseAllMonsters(repoDir, issues) {
  const monstersDir = path.join(repoDir, 'Monsters');
  if (!fs.existsSync(monstersDir)) {
    throw new Error(`Monsters/ directory not found at ${monstersDir}`);
  }

  const allMonsters = [];
  const factionDirs = fs.readdirSync(monstersDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const factionName of factionDirs) {
    const factionDir  = path.join(monstersDir, factionName);
    const featuresDir = path.join(factionDir, 'Features');

    const maliceFeatureNames = parseMaliceFeatureNames(featuresDir);

    let count = 0;
    for (const filePath of findStatblockFiles(factionDir)) {
      try {
        const json    = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const monster = parseStatblock(json, factionName, maliceFeatureNames, issues);
        if (monster && monster.name) {
          allMonsters.push(monster);
          count++;
        }
      } catch (e) {
        issues.push({ monster: `${factionName}/${path.basename(filePath)}`, kind: 'file-parse-failure', detail: e.message });
      }
    }
    if (count > 0) process.stdout.write(`  ✓ ${factionName}: ${count}\n`);
  }

  return allMonsters;
}

// Doc ids derive from the name, but Rival statblocks reuse one name across
// four echelons — disambiguate every duplicate name with its level so no
// batch.set silently overwrites another monster.
function assignDocIds(monsters, issues) {
  const nameCounts = {};
  for (const m of monsters) nameCounts[m.name] = (nameCounts[m.name] || 0) + 1;

  const seen = new Set();
  for (const m of monsters) {
    let id = slugify(nameCounts[m.name] > 1 ? `${m.name} lv${m.level}` : m.name);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    m._docId = id;
  }
}

// ── Parse-error report + verification ────────────────────────────────────────
// A malformed file never blocks the run; it lands in this report instead.

function printReport(monsters, issues) {
  console.log('\n── Parse-error report ─────────────────────────────');
  if (issues.length === 0) {
    console.log('  (no parse errors)');
  } else {
    for (const i of issues) {
      console.log(`  ⚠️  [${i.kind}] ${i.monster}: ${i.detail}`);
    }
  }

  const evModes = {}, orgs = {}, roles = {};
  for (const m of monsters) {
    evModes[m.evMode] = (evModes[m.evMode] || 0) + 1;
    orgs[m.organization ?? 'null']  = (orgs[m.organization ?? 'null'] || 0) + 1;
    roles[m.role ?? 'null'] = (roles[m.role ?? 'null'] || 0) + 1;
  }
  console.log('\n── Distribution ───────────────────────────────────');
  console.log(`  Total monsters:  ${monsters.length}`);
  console.log('  evMode:        ', evModes);
  console.log('  organization:  ', orgs);
  console.log('  role:          ', roles);
}

// Monsters allowed to have neither organization nor role. The spec's verified
// corpus had none; upstream has since added Noncombatant (a level-0 bystander
// statblock with empty roles and ev '-'). Genuine drift lands here after review.
const KNOWN_NULL_NULL = ['Noncombatant'];

function verify(monsters, issues) {
  const failures = [];
  const unparsedEV   = monsters.filter(m => m.evMode === 'unparsed');
  const roleIssues   = issues.filter(i => i.kind === 'unrecognized-role-token');
  const nullRole     = monsters.filter(m => m.role === null);
  const nullOrg      = monsters.filter(m => m.organization === null);
  const rolesPresent = new Set(monsters.map(m => m.role).filter(Boolean));

  if (unparsedEV.length)  failures.push(`${unparsedEV.length} monsters with unparsed EV: ${unparsedEV.map(m => m.name).join(', ')}`);
  if (roleIssues.length)  failures.push(`${roleIssues.length} unrecognized role tokens`);
  for (const r of ['harrier', 'mount', 'support']) {
    if (!rolesPresent.has(r)) failures.push(`role '${r}' absent — role/org split is misclassifying`);
  }
  for (const m of nullOrg) {
    if (m.role === null && !KNOWN_NULL_NULL.includes(m.name)) {
      failures.push(`${m.name} has neither organization nor role and is not a documented exception`);
    }
  }

  console.log('\n── Verification (§13 tests 2–4) ───────────────────');
  console.log(`  Null role:         ${nullRole.length}  (spec snapshot: 52 Leaders + Solos)`);
  console.log(`  Null organization: ${nullOrg.length}  (spec snapshot: 6 — Xorannox's eyes)`);
  console.log(`  Distinct roles:    ${[...rolesPresent].sort().join(', ')}`);
  const nullNull = monsters.filter(m => m.role === null && m.organization === null);
  if (nullNull.length) {
    console.log(`  Documented null/null exceptions present: ${nullNull.map(m => m.name).join(', ')}`);
  }
  if (failures.length === 0) {
    console.log('  ✓ All checks passed');
    return true;
  }
  for (const f of failures) console.log(`  ✗ ${f}`);
  return false;
}

// ── Firestore ────────────────────────────────────────────────────────────────

function initFirestore() {
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'drawsteel-companion',
  });
  return { admin, db: admin.firestore() };
}

async function writeMonsters(db, admin, monsters, collectionName) {
  const BATCH_SIZE = 400;
  let written = 0;

  for (let i = 0; i < monsters.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = monsters.slice(i, i + BATCH_SIZE);

    for (const monster of chunk) {
      const { _docId, ...data } = monster;
      const ref = db.collection(collectionName).doc(_docId);
      batch.set(ref, {
        ...data,
        seededAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  Wrote ${written}/${monsters.length} monsters to /${collectionName}...`);
  }
}

// Copy a verified staging collection into /monsters, removing stale docs.
async function promote(db, sourceCollection) {
  console.log(`Promoting /${sourceCollection} → /monsters ...`);
  const sourceSnap = await db.collection(sourceCollection).get();
  if (sourceSnap.empty) {
    throw new Error(`/${sourceCollection} is empty — seed and verify it first.`);
  }
  const targetSnap = await db.collection('monsters').get();
  const sourceIds  = new Set(sourceSnap.docs.map(d => d.id));
  const staleIds   = targetSnap.docs.map(d => d.id).filter(id => !sourceIds.has(id));

  const BATCH_SIZE = 400;
  const docs = sourceSnap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_SIZE)) {
      batch.set(db.collection('monsters').doc(doc.id), doc.data());
    }
    await batch.commit();
    console.log(`  Copied ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length}`);
  }
  for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const id of staleIds.slice(i, i + BATCH_SIZE)) {
      batch.delete(db.collection('monsters').doc(id));
    }
    await batch.commit();
  }
  console.log(`  ✓ ${docs.length} docs promoted, ${staleIds.length} stale docs removed.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes('--dry-run');
  const collIdx = args.indexOf('--collection');
  const promIdx = args.indexOf('--promote');

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Draw Steel — Monster Seed Script            ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  if (promIdx !== -1) {
    const source = args[promIdx + 1];
    if (!source) { console.error('✗ --promote requires a source collection name'); process.exit(1); }
    const { db } = initFirestore();
    await promote(db, source);
    process.exit(0);
  }

  console.log('Downloading Steel Compendium bestiary...');
  const repoDir = await downloadRepo();

  console.log('\nParsing monsters by faction:');
  const issues   = [];
  const monsters = parseAllMonsters(repoDir, issues)
    .filter(m => m.evMode !== 'unparsed');  // log + exclude, never crash

  if (monsters.length === 0) {
    console.error('\n✗ No monsters found. Check your internet connection or repo structure.');
    process.exit(1);
  }

  assignDocIds(monsters, issues);
  printReport(monsters, issues);
  const ok = verify(monsters, issues);

  if (dryRun) {
    console.log('\n--dry-run: no Firestore writes performed.');
    process.exit(ok ? 0 : 1);
  }

  if (!ok) {
    console.error('\n✗ Verification failed — refusing to write. Fix the parse first.');
    process.exit(1);
  }

  const collectionName = collIdx !== -1 ? args[collIdx + 1] : 'monsters_staging';
  if (!collectionName) { console.error('✗ --collection requires a name'); process.exit(1); }
  if (collectionName === 'monsters') {
    console.error('✗ Refusing to seed directly into /monsters. Seed a staging');
    console.error('  collection, verify it, then run --promote <staging>.');
    process.exit(1);
  }

  const { admin, db } = initFirestore();
  console.log('\nConnecting to Firestore...');
  try {
    await db.collection('_seed_test').doc('ping').set({ ts: Date.now() });
    await db.collection('_seed_test').doc('ping').delete();
    console.log('✓ Firestore connection OK');
  } catch (e) {
    console.error('✗ Could not connect to Firestore:', e.message);
    console.error('Make sure application-default credentials are set up.');
    process.exit(1);
  }

  console.log(`\nWriting to Firestore /${collectionName}...`);
  await writeMonsters(db, admin, monsters, collectionName);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ✓ Monster seed complete!                    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n${monsters.length} monsters written to /${collectionName}.`);
  console.log('Verify in Firebase Console, then swap into place with:');
  console.log(`  node scripts/seed-monsters.js --promote ${collectionName}\n`);

  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n✗ Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { parseEV, splitRolesOrg, parseStatblock, slugify };
