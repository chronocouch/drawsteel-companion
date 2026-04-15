/**
 * Draw Steel Companion App — Phase 0 Seed Script
 *
 * Fetches ability data from SteelCompendium/data-rules-md on GitHub
 * and writes it to your Firestore /abilities collection.
 *
 * Run once: node scripts/seed-local.js
 * Re-run when Steel Compendium updates with new rulebook data.
 *
 * Prerequisites:
 *   1. firebase login (done)
 *   2. npm install in this /scripts folder
 *   3. Your Firebase project ID set in ../.firebaserc
 */

const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ── Firebase init ────────────────────────────────────────────────────────────
// Uses your logged-in Firebase CLI credentials — no service account needed
const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  // Replace with your actual project ID if .firebaserc isn't picking it up
  projectId: process.env.FIREBASE_PROJECT_ID || 'drawsteel-companion',
});
const db = admin.firestore();

// ── GitHub raw content base ──────────────────────────────────────────────────
const GITHUB_RAW = 'https://raw.githubusercontent.com/SteelCompendium/data-rules-md/main';

// ── Class list — matches Steel Compendium folder names ──────────────────────
const CLASSES = [
  'Conduit',
  'Elementalist',
  'Fury',
  'Null',
  'Shadow',
  'Tactician',
  'Talent',
];

// ── Class metadata ───────────────────────────────────────────────────────────
const CLASS_META = {
  Conduit:      { resource: 'Piety',      accentColor: '#D4AC0D' },
  Elementalist: { resource: 'Essence',    accentColor: '#E67E22' },
  Fury:         { resource: 'Rage',       accentColor: '#C0392B' },
  Null:         { resource: 'Discipline', accentColor: '#717D7E' },
  Shadow:       { resource: 'Insight',    accentColor: '#6C3483' },
  Tactician:    { resource: 'Focus',      accentColor: '#2980B9' },
  Talent:       { resource: 'Clarity',    accentColor: '#9B59B6' },
};

// ── Repo download ────────────────────────────────────────────────────────────
// Downloads the Steel Compendium repo as a single zip (one HTTP request,
// no GitHub API rate limits) and extracts it to a temp directory.

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} downloading zip`));
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
  const zipUrl = 'https://github.com/SteelCompendium/data-rules-md/archive/refs/heads/main.zip';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawsteel-seed-'));
  const zipPath = path.join(tmpDir, 'repo.zip');

  process.stdout.write('  Downloading Steel Compendium repo zip...');
  await downloadToFile(zipUrl, zipPath);
  console.log(' done');

  process.stdout.write('  Extracting...');
  execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`);
  console.log(' done');

  // The zip extracts to a folder named data-rules-md-main
  const extractedDir = path.join(tmpDir, 'data-rules-md-main');
  return extractedDir;
}

// ── Markdown parser ──────────────────────────────────────────────────────────
// Parses a single Draw Steel ability file (YAML frontmatter + markdown body).
// Each file in the repo contains exactly one ability.
//
// Format:
//   ---
//   ability_type: Signature        (optional)
//   action_type: Main action
//   cost_amount: 5                 (optional)
//   cost_resource: Focus           (optional)
//   distance: Melee 1
//   keywords: [Melee, Strike, Weapon]
//   flavor: "Some flavor text"
//   item_id: brutal-slam
//   item_name: Brutal Slam
//   target: One creature
//   ---
//   ###### Ability Name
//   ...
//   **Power Roll + Might:**
//   - **≤11:** 3 + M damage; push 1
//   - **12-16:** 6 + M damage; push 2
//   - **17+:** 9 + M damage; push 4

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let inList = false;

  for (const line of lines) {
    const keyVal = line.match(/^(\w[\w_]*):\s*(.*)/);
    if (keyVal) {
      currentKey = keyVal[1];
      const val = keyVal[2].trim();
      if (val === '' || val === '[]') {
        fm[currentKey] = [];
        inList = true;
      } else {
        // Strip surrounding quotes
        fm[currentKey] = val.replace(/^["']|["']$/g, '');
        inList = false;
      }
    } else if (line.trim().startsWith('- ') && inList && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      fm[currentKey].push(line.trim().slice(2).replace(/^["']|["']$/g, ''));
    }
  }
  return fm;
}

function parseActionType(raw) {
  if (!raw) return 'action';
  const t = raw.toLowerCase().trim();
  if (t.includes('free triggered') || t.includes('free-triggered')) return 'free-triggered';
  if (t.includes('triggered')) return 'triggered';
  if (t.includes('maneuver')) return 'maneuver';
  if (t.includes('free')) return 'free';
  return 'action';
}

function parseAbilityFile(markdown, className) {
  const fm = parseFrontmatter(markdown);

  // Strip frontmatter block to get body
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');

  const name = fm.item_name || (body.match(/^#{1,6}\s+(.+)/m) || [])[1] || '';
  if (!name) return null;

  const ability = {
    id: fm.item_id || slugify(`${className}-${name}`),
    name,
    class: className,
    type: parseActionType(fm.action_type),
    cost: parseInt(fm.cost_amount, 10) || 0,
    isSignature: (fm.ability_type || '').toLowerCase() === 'signature',
    frequency: 'at-will',
    keywords: Array.isArray(fm.keywords) ? fm.keywords : [],
    distance: fm.distance || '',
    target: fm.target || '',
    tier1: '',
    tier2: '',
    tier3: '',
    effect: '',
    spendEffects: [],
    kitModifiers: [],
    flavor: fm.flavor || '',
  };

  // Frequency from body text
  const bodyLc = body.toLowerCase();
  if (bodyLc.includes('once per encounter') || bodyLc.includes('once/encounter')) {
    ability.frequency = 'once-per-encounter';
  } else if (bodyLc.includes('once per turn') || bodyLc.includes('once/turn')) {
    ability.frequency = 'once-per-turn';
  }

  // Power roll tiers — strip "≤11: " / "12-16: " / "17+: " range prefix from stored text
  const tierSection = body.match(/\*\*Power Roll[^:]*:\*\*([\s\S]*?)(?=\n\n\*\*|\n\n[^-]|$)/i);
  if (tierSection) {
    const tierLines = tierSection[1].split('\n').filter(l => /^\s*-/.test(l));
    // strip leading "- ", bold markers, and the roll range prefix ("≤11: ", "12-16: ", "17+: ")
    const clean = s => s.replace(/^-\s*/, '').replace(/\*\*/g, '').replace(/^\S+:\s*/, '').trim();
    if (tierLines[0]) ability.tier1 = clean(tierLines[0]);
    if (tierLines[1]) ability.tier2 = clean(tierLines[1]);
    if (tierLines[2]) ability.tier3 = clean(tierLines[2]);
  }

  // Parse body into paragraphs to extract Effect and Spend sections
  const paragraphs = body.split(/\n\n+/);
  for (const para of paragraphs) {
    const t = para.trim();

    const effectMatch = t.match(/^\*\*Effect:\*\*\s*([\s\S]+)/i);
    if (effectMatch) {
      ability.effect = effectMatch[1].replace(/\n/g, ' ').trim();
    }

    // "**Spend 1+ Insight:**" or "**Spend 2 Rage:**" etc.
    const spendMatch = t.match(/^\*\*(Spend[^*]+)\*\*:?\s*([\s\S]+)/i);
    if (spendMatch) {
      ability.spendEffects.push({
        label: spendMatch[1].trim(),
        text: spendMatch[2].replace(/\n/g, ' ').trim(),
      });
    }
  }

  return ability;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Seed a single class ──────────────────────────────────────────────────────
// Repo structure: Abilities/{ClassName}/{Level-Folder}/{AbilityName}.md
// Reads from the locally-extracted zip directory.

function findMdFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMdFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function seedClass(className, repoDir) {
  const classDir = path.join(repoDir, 'Abilities', className);
  const mdPaths = findMdFiles(classDir);

  const abilities = [];
  for (const filePath of mdPaths) {
    try {
      const markdown = fs.readFileSync(filePath, 'utf8');
      const parsed = parseAbilityFile(markdown, className);
      if (parsed) abilities.push(parsed);
    } catch (e) {
      console.log(`  ⚠️  Could not parse ${path.basename(filePath)}: ${e.message}`);
    }
  }

  console.log(`  ✓ ${className}: ${abilities.length} abilities`);
  return abilities;
}

// ── Write to Firestore ───────────────────────────────────────────────────────

async function writeAbilities(abilities) {
  const batchSize = 400; // Firestore batch limit is 500
  let written = 0;

  for (let i = 0; i < abilities.length; i += batchSize) {
    const batch = db.batch();
    const chunk = abilities.slice(i, i + batchSize);

    for (const ability of chunk) {
      const ref = db.collection('abilities').doc(ability.id);
      batch.set(ref, {
        ...ability,
        seededAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  Wrote ${written}/${abilities.length} abilities...`);
  }
}

// ── Also seed class metadata ─────────────────────────────────────────────────

async function seedClassMeta() {
  console.log('\n  Writing class metadata...');
  const batch = db.batch();

  for (const [className, meta] of Object.entries(CLASS_META)) {
    const ref = db.collection('classes').doc(className.toLowerCase());
    batch.set(ref, {
      name: className,
      ...meta,
      seededAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log('  ✓ Class metadata written');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Draw Steel — Phase 0 Seed Script            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\nConnecting to Firestore...');

  // Quick connection test
  try {
    await db.collection('_seed_test').doc('ping').set({ ts: Date.now() });
    await db.collection('_seed_test').doc('ping').delete();
    console.log('✓ Firestore connection OK');
  } catch (e) {
    console.error('✗ Could not connect to Firestore:', e.message);
    console.error('\nMake sure you have run: firebase login');
    console.error('And that your project ID is set in .firebaserc');
    process.exit(1);
  }

  console.log('\nDownloading Steel Compendium data...');
  const repoDir = await downloadRepo();

  const allAbilities = [];
  console.log('\nParsing abilities by class:');
  for (const className of CLASSES) {
    const abilities = seedClass(className, repoDir);
    allAbilities.push(...abilities);
  }

  console.log(`\n📊 Total abilities parsed: ${allAbilities.length}`);

  if (allAbilities.length === 0) {
    console.error('\n✗ No abilities found. Check your internet connection.');
    console.error('  The Steel Compendium GitHub repo may also have changed structure.');
    process.exit(1);
  }

  console.log('\nWriting to Firestore...');
  await writeAbilities(allAbilities);
  await seedClassMeta();

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ✓ Seed complete!                            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\nVerify in Firebase Console → Firestore → /abilities');
  console.log('You should see documents for each class.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n✗ Seed failed:', err);
  process.exit(1);
});
