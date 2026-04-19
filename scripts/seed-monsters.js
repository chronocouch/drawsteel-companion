/**
 * Draw Steel Companion — Monster Seed Script
 *
 * Downloads the SteelCompendium/data-bestiary-json repo as a zip,
 * parses every Statblocks/*.json file, and writes to /monsters in Firestore.
 *
 * Run: node scripts/seed-monsters.js
 *
 * Prerequisites:
 *   1. firebase login
 *   2. npm install in project root (firebase-admin must be available)
 *   3. Your Firebase project ID set in .firebaserc
 */

const admin    = require('firebase-admin');
const https    = require('https');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { execSync } = require('child_process');

// ── Firebase init ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID || 'drawsteel-companion',
});
const db = admin.firestore();

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

// ── Role normalisation ───────────────────────────────────────────────────────
// Source roles can be "Solo", "Leader", "Minion Hexer", "Horde Controller", etc.
// We map to the canonical schema values and extract isMinion / isSolo flags.

const ROLE_MAP = [
  ['solo',       'solo'],
  ['leader',     'leader'],
  ['controller', 'controller'],
  ['defender',   'defender'],
  ['hexer',      'hexer'],
  ['artillery',  'artillery'],
  ['ambusher',   'ambusher'],
  ['harrier',    'ambusher'],   // "Horde Harrier" → ambusher
  ['skirmisher', 'ambusher'],
  ['brute',      'brute'],
  ['grunt',      'brute'],      // "Horde Grunt" → brute
  ['support',    'leader'],     // "Elite Support", "Platoon Support" → leader
  ['mount',      'brute'],      // "Elite Mount", "Platoon Mount" → brute
];

function normaliseRole(rawRoles) {
  const joined = (rawRoles || []).join(' ').toLowerCase();
  const isMinion = joined.includes('minion');
  const isSolo   = joined.includes('solo');

  for (const [key, canonical] of ROLE_MAP) {
    if (joined.includes(key)) {
      return { role: canonical, isMinion, isSolo };
    }
  }
  // Fallback: strip "Minion "/"Horde " prefixes and lowercase whatever remains
  const stripped = (rawRoles[0] || '')
    .replace(/^(Minion|Horde)\s+/i, '')
    .toLowerCase()
    .trim() || 'unknown';
  return { role: stripped, isMinion, isSolo };
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

// ── Parse EV — "3" or "3 for four minions" → 3 ──────────────────────────────

function parseEV(raw) {
  if (!raw) return 0;
  const m = String(raw).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// ── Parse movement types ──────────────────────────────────────────────────────
// "movement" can be "Fly", "Climb", "Burrow", "Teleport", or undefined (walk)

function parseMovement(movement) {
  if (!movement) return [];
  return movement.split(/[,/]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

// ── Parse a single statblock JSON ────────────────────────────────────────────

function parseStatblock(json, factionName, maliceFeatureNames) {
  if (!json || json.type !== 'statblock') return null;

  const rawRoles = json.roles || [];
  const { role, isMinion, isSolo } = normaliseRole(rawRoles);

  // Collect ability names from features
  const abilities = (json.features || [])
    .filter(f => f.feature_type === 'ability' && f.name)
    .map(f => f.name);

  return {
    name:            json.name || '',
    level:           json.level ?? 1,
    ev:              parseEV(json.ev),
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
    isMinion,
    isSolo,
    faction:         factionName,
    abilities,
    maliceFeatures:  maliceFeatureNames,
  };
}

// ── Walk the Monsters/ directory ─────────────────────────────────────────────

function findJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

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

function parseAllMonsters(repoDir) {
  const monstersDir = path.join(repoDir, 'Monsters');
  if (!fs.existsSync(monstersDir)) {
    throw new Error(`Monsters/ directory not found at ${monstersDir}`);
  }

  const allMonsters = [];
  const factionDirs = fs.readdirSync(monstersDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const factionName of factionDirs) {
    const factionDir    = path.join(monstersDir, factionName);
    const statblocksDir = path.join(factionDir, 'Statblocks');
    const featuresDir   = path.join(factionDir, 'Features');

    const maliceFeatureNames = parseMaliceFeatureNames(featuresDir);

    if (!fs.existsSync(statblocksDir)) continue;

    for (const file of fs.readdirSync(statblocksDir)) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(statblocksDir, file);
      try {
        const json    = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const monster = parseStatblock(json, factionName, maliceFeatureNames);
        if (monster && monster.name) {
          allMonsters.push(monster);
        }
      } catch (e) {
        console.log(`  ⚠️  Could not parse ${factionName}/${file}: ${e.message}`);
      }
    }

    if (fs.existsSync(statblocksDir)) {
      const count = fs.readdirSync(statblocksDir).filter(f => f.endsWith('.json')).length;
      if (count > 0) process.stdout.write(`  ✓ ${factionName}: ${count}\n`);
    }
  }

  return allMonsters;
}

// ── Write to Firestore ───────────────────────────────────────────────────────

async function writeMonsters(monsters) {
  const BATCH_SIZE = 400;
  let written = 0;

  for (let i = 0; i < monsters.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = monsters.slice(i, i + BATCH_SIZE);

    for (const monster of chunk) {
      const id  = slugify(monster.name);
      const ref = db.collection('monsters').doc(id);
      batch.set(ref, {
        ...monster,
        seededAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  Wrote ${written}/${monsters.length} monsters...`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Draw Steel — Monster Seed Script            ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log('Connecting to Firestore...');
  try {
    await db.collection('_seed_test').doc('ping').set({ ts: Date.now() });
    await db.collection('_seed_test').doc('ping').delete();
    console.log('✓ Firestore connection OK\n');
  } catch (e) {
    console.error('✗ Could not connect to Firestore:', e.message);
    console.error('Make sure you have run: firebase login');
    process.exit(1);
  }

  console.log('Downloading Steel Compendium bestiary...');
  const repoDir = await downloadRepo();

  console.log('\nParsing monsters by faction:');
  const monsters = parseAllMonsters(repoDir);

  if (monsters.length === 0) {
    console.error('\n✗ No monsters found. Check your internet connection or repo structure.');
    process.exit(1);
  }

  console.log(`\n📊 Total monsters parsed: ${monsters.length}`);

  // Distribution summary
  const roleCounts = {};
  for (const m of monsters) roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
  console.log('   Role distribution:', roleCounts);
  console.log('   Minions:', monsters.filter(m => m.isMinion).length);
  console.log('   Solos:  ', monsters.filter(m => m.isSolo).length);

  console.log('\nWriting to Firestore /monsters...');
  await writeMonsters(monsters);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ✓ Monster seed complete!                    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n${monsters.length} monsters written to /monsters collection.`);
  console.log('Verify in Firebase Console → Firestore → /monsters\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n✗ Seed failed:', err);
  process.exit(1);
});
