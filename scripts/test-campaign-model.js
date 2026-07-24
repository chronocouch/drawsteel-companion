/**
 * Campaign data-model tests (multi-campaign step 1).
 *
 * Covers the pure/data-layer pieces: app-owned slug generation (including
 * collisions and filesystem-hostile names), the archived filter's
 * backward-compatibility with campaigns that predate the field, and
 * active-campaign resolution + fallback.
 *
 * Run: node scripts/test-campaign-model.js
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── Load campaign.js + vault.js in a sandbox with DOM stubs ─────────────────

const noop = () => {};
const fakeEl = new Proxy({}, {
  get: (_t, p) => (p === 'style' ? {} : (p === 'classList' ? { add: noop, remove: noop, toggle: noop } : noop)),
});

// Minimal in-memory Firestore double: enough for the data layer under test
function makeDb(state) {
  const docApi = (col, id) => ({
    async get() {
      const data = state[col]?.[id];
      return { exists: !!data, id, data: () => data };
    },
    async set(patch, opts) {
      state[col] = state[col] || {};
      state[col][id] = opts?.merge ? { ...(state[col][id] || {}), ...patch } : patch;
    },
    async update(patch) {
      state[col] = state[col] || {};
      state[col][id] = { ...(state[col][id] || {}), ...patch };
    },
    collection: () => collectionApi('_sub'),
  });
  const collectionApi = (col) => ({
    doc: (id) => docApi(col, id),
    where: (field, _op, value) => ({
      async get() {
        const rows = Object.entries(state[col] || {})
          .filter(([, d]) => d[field] === value)
          .map(([id, d]) => ({ id, data: () => d }));
        return { empty: rows.length === 0, docs: rows, forEach: (f) => rows.forEach(f) };
      },
    }),
    async add(data) {
      const id = 'gen' + (Object.keys(state[col] || {}).length + 1);
      state[col] = state[col] || {};
      state[col][id] = data;
      return { id };
    },
  });
  return { collection: collectionApi };
}

const state = { campaigns: {}, users: {} };
const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, Date, isNaN, parseInt, parseFloat,
  setTimeout: noop, clearTimeout: noop,
  document: { getElementById: () => fakeEl, querySelector: () => fakeEl, querySelectorAll: () => [], createElement: () => fakeEl, addEventListener: noop },
  window: {}, localStorage: { getItem: () => null, setItem: noop },
  db: makeDb(state),
  firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ seconds: 0 }) } } },
  AppState: { currentUser: { uid: 'dir1' }, currentCampaign: null, directorCampaigns: [] },
  SCREENS: {}, showScreen: noop, showToast: noop, showModal: noop, hideModal: noop,
  CLASS_COLORS: {}, MonsterSearch: { init: async () => {}, getById: () => null },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/vault.js'), 'utf8'), sandbox, { filename: 'vault.js' });
const campaignSrc = fs.readFileSync(path.join(__dirname, '..', 'public/js/campaign.js'), 'utf8');
vm.runInContext(campaignSrc, sandbox, { filename: 'campaign.js' });

const {
  campaignSlug, loadDirectorCampaigns, setActiveCampaign, getActiveCampaignId,
  ensureCampaignSlug, archiveCampaign, checkDirectorMode,
} = sandbox;

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${pass ? '✓' : '✗'} ${label}${pass ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failures++;
}

(async () => {
  // ── Slug generation ────────────────────────────────────────────────────────
  console.log('\nCampaign slug (app-owned, names the vault folder)');
  eq('plain name kept readable', campaignSlug('The Shattered Isles'), 'The Shattered Isles');
  eq('filesystem-hostile chars stripped', campaignSlug('Rise/Fall: Book #1?'), 'RiseFall Book 1');
  eq('collision gets a suffix', campaignSlug('Sunset', ['Sunset']), 'Sunset 2');
  eq('second collision increments', campaignSlug('Sunset', ['Sunset', 'Sunset 2']), 'Sunset 3');
  // Shares Vault.slugify's rules (and its 'Unnamed' fallback) so campaign and
  // entity folder names follow one convention. Unreachable in practice — the
  // create modal requires a name.
  eq('empty name falls back to the shared default', campaignSlug(''), 'Unnamed');

  // ── Archived filter, backward compatible ───────────────────────────────────
  console.log('\nCampaign list + archived filter');
  state.campaigns = {
    c1: { directorId: 'dir1', name: 'Old Campaign', createdAt: { seconds: 100 } },        // pre-dates `archived`
    c2: { directorId: 'dir1', name: 'Current', archived: false, createdAt: { seconds: 300 } },
    c3: { directorId: 'dir1', name: 'Shelved', archived: true,  createdAt: { seconds: 200 } },
    c4: { directorId: 'dir2', name: 'Someone Else', createdAt: { seconds: 400 } },
  };
  const active = await loadDirectorCampaigns('dir1');
  eq('archived excluded; legacy (no field) included', active.map(c => c.id), ['c2', 'c1']);
  eq('newest first', active[0].id, 'c2');
  const all = await loadDirectorCampaigns('dir1', { includeArchived: true });
  eq('includeArchived returns all three', all.map(c => c.id).sort(), ['c1', 'c2', 'c3']);
  eq("another director's campaign never returned", all.some(c => c.id === 'c4'), false);

  // ── Slug migration ─────────────────────────────────────────────────────────
  console.log('\nSlug backfill for pre-existing campaigns');
  const legacy = { id: 'c1', name: 'Old Campaign' };
  const slug = await ensureCampaignSlug(legacy, []);
  eq('slug generated', slug, 'Old Campaign');
  eq('persisted to the doc', state.campaigns.c1.slug, 'Old Campaign');
  const again = await ensureCampaignSlug({ id: 'c1', name: 'Renamed Later', slug: 'Old Campaign' }, []);
  eq('existing slug never regenerated on rename', again, 'Old Campaign');

  // ── Active campaign follows the profile ────────────────────────────────────
  console.log('\nActive campaign (synced to user profile)');
  await setActiveCampaign('c2');
  eq('written to the user doc', state.users.dir1.activeCampaignId, 'c2');
  eq('read back', await getActiveCampaignId('dir1'), 'c2');

  await checkDirectorMode('dir1');
  eq('resolves the stored active campaign', sandbox.AppState.currentCampaign.id, 'c2');

  // Falls back when the stored campaign is gone/archived
  await setActiveCampaign('c3');           // c3 is archived
  await checkDirectorMode('dir1');
  eq('archived active falls back to newest', sandbox.AppState.currentCampaign.id, 'c2');
  eq('fallback is persisted', state.users.dir1.activeCampaignId, 'c2');

  // ── Archive repoints the open campaign ─────────────────────────────────────
  console.log('\nArchiving');
  await archiveCampaign('c2');
  eq('archived flag set', state.campaigns.c2.archived, true);
  eq('open campaign repointed to a survivor', sandbox.AppState.currentCampaign.id, 'c1');
  eq('active id repointed too', state.users.dir1.activeCampaignId, 'c1');

  console.log(failures === 0 ? '\n✓ All campaign-model tests passed' : `\n✗ ${failures} test(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
