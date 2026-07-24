/**
 * Part III tests against the real vault module (§13 tests 10, 14-adjacent):
 * sentinel preservation, session-note format, zip integrity, doc-size bound.
 *
 * Run: node scripts/test-vault.js
 */

const Vault = require('../public/js/vault.js');

let failures = 0;
function check(label, cond, detail) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond ? '' : ` — ${detail || 'failed'}`}`);
  if (!cond) failures++;
}

// ── Test 10: hand-written text below the sentinel survives byte-identical ────

console.log('\nTest 10 — sentinel preservation');
const entity = {
  entityType: 'npc', name: 'Harim', slug: 'Harim',
  aliases: ['Harim', 'the cobbler'], status: 'alive', disposition: 'friendly',
  firstAppeared: 2, lastTouched: 7, summary: 'A nervous cobbler with a secret.',
  appearances: [{ sessionNumber: 7, noteSlug: 'S07 - 2026-07-18' }],
};
const head1 = Vault.generateEntityHead(entity);

const HAND_WRITTEN = "\n\n## Director's Notes\n\nHarim is secretly the duke's brother.\n- owes the party 50gp\n\t(tab-indented line)\nTrailing spaces here:   \n";
const firstWrite = Vault.mergePreservedTail(head1, null);
const withNotes  = head1 + HAND_WRITTEN;

// regenerate after a status change
const head2 = Vault.generateEntityHead({ ...entity, status: 'missing', lastTouched: 9 });
const regenerated = Vault.mergePreservedTail(head2, withNotes);

check('regenerated note ends with the hand-written tail byte-identical',
  regenerated.endsWith(HAND_WRITTEN));
check('regenerated frontmatter reflects the change',
  regenerated.includes('status: missing') && regenerated.includes('last_appeared: 9'));
check('exactly one generated block',
  regenerated.split(Vault.SENTINEL_START).length === 2 &&
  regenerated.split(Vault.SENTINEL_END).length === 2);
check('new file gets the default Director\'s Notes section',
  firstWrite.endsWith("\n\n## Director's Notes\n\n"));
check('file with no sentinel is treated as new (never clobbered mid-file)',
  Vault.mergePreservedTail(head2, 'random user file with no markers')
    .endsWith("\n\n## Director's Notes\n\n"));

// ── Session note format (§7.3: fixed headings, fixed order, wikilinks) ───────

console.log('\nSession note format');
const note = Vault.generateSessionNote({
  sessionNumber: 7, dateStr: '2026-07-18', partyLevel: 2, victories: 3,
  heroesPresent: ['Ilse', 'Korrin'],
  npcsTouched: ['Harim'], threadsTouched: ['Missing Merchants'],
  locationsVisited: ['Broadhurst'], encountersRun: ['ENC - Mage Tower Ground Floor'],
  sections: {
    whatHappened: ['The party reached Broadhurst.', 'Harim confessed.'],
    keyDecisions: [{ decision: 'Spared the bandit', likelyConsequence: 'He will return' }],
    npcDevelopments: ['Harim revealed his brother.'],
    openThreads: ['Who hired the bandits?'],
    stateOfPlay: 'The party holds the tower.',
    directorNotes: ['Prep the duke.'],
  },
});
const headingOrder = ['## What Happened', '## Key Decisions', '## NPC Developments',
  '## Open Threads', '## State of Play', '## Director Notes'];
let lastIdx = -1, orderOk = true;
for (const h of headingOrder) {
  const i = note.indexOf(h);
  if (i === -1 || i < lastIdx) { orderOk = false; break; }
  lastIdx = i;
}
check('all six headings present in fixed order', orderOk);
check('frontmatter carries real wikilinks', note.includes('"[[Harim]]"') && note.includes('"[[Missing Merchants]]"'));
check('session_number in frontmatter', note.includes('session_number: 7'));

// ── Test 14-adjacent: note document stays small (transcript NOT embedded) ────

console.log('\nDocument size bound');
const noteDocLike = JSON.stringify({
  sessionNumber: 7, dateStr: '2026-07-18',
  sections: note, transcriptPath: 'campaigns/x/transcripts/y.txt', transcriptBytes: 250000,
});
check('sessionNote-shaped doc under 50 KB', noteDocLike.length < 50 * 1024,
  `${noteDocLike.length} bytes`);

// ── Zip fallback integrity ───────────────────────────────────────────────────

console.log('\nZip fallback');
const files = [
  { path: 'Campaign/NPCs/Harim.md', content: regenerated },
  { path: 'Campaign/Sessions/S07 - 2026-07-18.md', content: note },
];
const zip = Vault.buildZip(files);
check('zip starts with local file header signature',
  zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 0x03 && zip[3] === 0x04);
const eocdIdx = zip.length - 22;
check('zip ends with EOCD record',
  zip[eocdIdx] === 0x50 && zip[eocdIdx + 1] === 0x4b && zip[eocdIdx + 2] === 0x05 && zip[eocdIdx + 3] === 0x06);
check('EOCD entry count is 2', zip[eocdIdx + 10] === 2 && zip[eocdIdx + 11] === 0);
check('crc32 known vector', Vault.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926);

// ── Slug stability ───────────────────────────────────────────────────────────

console.log('\nSlugs');
check('slug strips filesystem-hostile chars', Vault.slugify('Who: hired/the*bandits?') === 'Who hiredthebandits');
check('slug keeps display case + spaces', Vault.slugify('Missing Merchants') === 'Missing Merchants');

console.log(failures === 0 ? '\n✓ All vault tests passed' : `\n✗ ${failures} test(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
