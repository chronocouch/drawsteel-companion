/**
 * campaign.js — Campaign Manager (Phase H)
 *
 * Manages the Director-facing campaign screen:
 *   H1  Three-panel layout (party / encounters / info)
 *   H2  addHeroToCampaign — link player or add manually
 *   H3  openHeroDetail — live character read + GM notes
 *   H4  performCampaignRespite — victories → XP, recoveries restore
 *   H5  updatePartyBar — avg level, victories, malice preview
 */

// ── XP thresholds (XP = cumulative victories in XP mode) ─────────────────────
// Index n = total XP required to reach level n (levels 2–10 only)
const LEVEL_XP_THRESHOLDS = [0, 0, 10, 25, 45, 70, 100, 135, 175, 220, 270];

function xpToLevel(xp) {
  for (let n = LEVEL_XP_THRESHOLDS.length - 1; n >= 2; n--) {
    if (xp >= LEVEL_XP_THRESHOLDS[n]) return n;
  }
  return 1;
}

// ── Check for existing campaign — called from app.js after auth ──────────────

async function checkDirectorMode(uid) {
  try {
    const snap = await db.collection('campaigns')
      .where('directorId', '==', uid)
      .limit(1)
      .get();
    const dirBtn = document.getElementById('director-mode-btn');
    if (!snap.empty) {
      AppState.currentCampaign = { id: snap.docs[0].id, ...snap.docs[0].data() };
      if (dirBtn) dirBtn.classList.remove('hidden');
    } else {
      // Show a subtle setup link even with no campaign
      if (dirBtn) dirBtn.classList.remove('hidden');
    }
  } catch (e) {
    console.warn('checkDirectorMode:', e);
  }
}

// ── Open campaign screen ──────────────────────────────────────────────────────

async function openCampaignScreen() {
  const user = AppState.currentUser;
  if (!user) return;

  if (!AppState.currentCampaign) {
    showCreateCampaignModal();
    return;
  }

  try {
    const snap = await db.collection('campaigns').doc(AppState.currentCampaign.id).get();
    if (!snap.exists) {
      AppState.currentCampaign = null;
      showCreateCampaignModal();
      return;
    }
    AppState.currentCampaign = { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error('Error loading campaign:', e);
    showToast('Could not load campaign.', 'danger');
    return;
  }

  // Load encounters subcollection
  AppState.currentCampaign._encounters = await loadEncounters(AppState.currentCampaign.id);

  showScreen(SCREENS.CAMPAIGN);
  renderCampaignScreen();
}

// ── Create campaign modal ─────────────────────────────────────────────────────

function showCreateCampaignModal() {
  showModal(`
    <div class="create-campaign-modal">
      <h2>New Campaign</h2>
      <div class="wizard-field">
        <label class="wizard-label">Campaign Name</label>
        <input type="text" id="campaign-name-input" class="wizard-text-input"
          placeholder="The Shattered Isles Campaign" maxlength="60" autocomplete="off" />
      </div>
      <div class="wizard-field">
        <label class="wizard-label">Advancement Mode</label>
        <div class="adv-mode-group">
          ${[
            { v: 'milestone', l: 'Milestone', d: 'Level up when the Director decides' },
            { v: 'director',  l: 'Director',  d: 'GM awards levels manually' },
            { v: 'xp',        l: 'XP',        d: 'Victories convert to XP at Respite' },
          ].map(m => `
            <label class="adv-mode-option">
              <input type="radio" name="adv-mode" value="${m.v}" ${m.v === 'milestone' ? 'checked' : ''} />
              <div class="adv-mode-content">
                <span class="adv-mode-name">${m.l}</span>
                <span class="adv-mode-desc">${m.d}</span>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
      <button class="btn btn-primary" id="create-campaign-confirm-btn" style="width:100%;margin-top:8px">
        Create Campaign
      </button>
    </div>
  `);

  setTimeout(() => document.getElementById('campaign-name-input')?.focus(), 60);

  document.getElementById('create-campaign-confirm-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('campaign-name-input').value.trim();
    if (!name) { showToast('Enter a campaign name.', 'danger'); return; }
    const advancementMode = document.querySelector('input[name="adv-mode"]:checked')?.value || 'milestone';
    await createCampaign(name, advancementMode);
  });
}

async function createCampaign(name, advancementMode) {
  const user = AppState.currentUser;
  const btn  = document.getElementById('create-campaign-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  try {
    const docRef = await db.collection('campaigns').add({
      name,
      directorId: user.uid,
      advancementMode,
      isActive: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      heroes: [],
      sessionLog: [],
    });

    AppState.currentCampaign = {
      id: docRef.id, name, directorId: user.uid,
      advancementMode, isActive: true, heroes: [], sessionLog: [], _encounters: [],
    };

    document.getElementById('director-mode-btn')?.classList.remove('hidden');
    hideModal();
    showScreen(SCREENS.CAMPAIGN);
    renderCampaignScreen();
  } catch (e) {
    console.error('Error creating campaign:', e);
    showToast('Could not create campaign.', 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Campaign'; }
  }
}

// ── Load encounters subcollection ─────────────────────────────────────────────

async function loadEncounters(campaignId) {
  try {
    const snap = await db.collection('campaigns').doc(campaignId)
      .collection('encounters')
      .orderBy('order')
      .get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  } catch (e) {
    // 'order' index may not exist yet — fall back to unordered
    try {
      const snap = await db.collection('campaigns').doc(campaignId)
        .collection('encounters').get();
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (_) {
      return [];
    }
  }
}

// ── Render full campaign screen ───────────────────────────────────────────────

function renderCampaignScreen() {
  const campaign = AppState.currentCampaign;
  if (!campaign) return;

  const titleEl = document.getElementById('campaign-header-title');
  if (titleEl) titleEl.textContent = campaign.name || 'Campaign';

  updatePartyBar(campaign);
  renderHeroRoster(campaign);
  renderEncounterList(campaign);
  renderCampaignInfo(campaign);
}

// ── H5: Party status bar ──────────────────────────────────────────────────────

function updatePartyBar(campaign) {
  const bar = document.getElementById('campaign-party-bar');
  if (!bar) return;

  const heroes = campaign.heroes || [];
  if (heroes.length === 0) {
    bar.innerHTML = '<span class="party-bar-empty">No heroes yet — add your party below</span>';
    return;
  }

  const avgLevel  = (heroes.reduce((s, h) => s + (h.level || 1), 0) / heroes.length).toFixed(1);
  const totalVic  = heroes.reduce((s, h) => s + (h.currentVictories || 0), 0);
  const maliceEst = heroes.length + Math.round(parseFloat(avgLevel));

  bar.innerHTML = `
    <div class="party-bar-stat">
      <span class="party-bar-label">Heroes</span>
      <span class="party-bar-value">${heroes.length}</span>
    </div>
    <span class="party-bar-sep">·</span>
    <div class="party-bar-stat">
      <span class="party-bar-label">Avg Level</span>
      <span class="party-bar-value">${avgLevel}</span>
    </div>
    <span class="party-bar-sep">·</span>
    <div class="party-bar-stat">
      <span class="party-bar-label">Victories</span>
      <span class="party-bar-value party-bar-victories">${totalVic}</span>
    </div>
    <span class="party-bar-sep">·</span>
    <div class="party-bar-stat">
      <span class="party-bar-label">Malice/Rnd</span>
      <span class="party-bar-value">${maliceEst}+</span>
    </div>
    <span class="party-bar-sep">·</span>
    <div class="party-bar-stat">
      <span class="party-bar-label">Mode</span>
      <span class="party-bar-value">${campaign.advancementMode || 'milestone'}</span>
    </div>
  `;
}

// ── H2: Hero roster ───────────────────────────────────────────────────────────

function renderHeroRoster(campaign) {
  const container = document.getElementById('hero-roster-list');
  if (!container) return;

  const heroes = campaign.heroes || [];
  if (heroes.length === 0) {
    container.innerHTML = '<p class="panel-empty">No heroes yet.<br>Add your party members above.</p>';
    return;
  }

  container.innerHTML = heroes.map((hero, idx) => {
    const accent = CLASS_COLORS[hero.class]?.accent || '#2980B9';
    return `
      <div class="campaign-hero-card" data-hero-idx="${idx}">
        <div class="hero-card-accent" style="background:${accent}"></div>
        <div class="hero-card-body">
          <div class="hero-card-name">
            ${hero.displayName}
            ${hero.isLinked ? '<span class="hero-linked-badge">LINKED</span>' : ''}
          </div>
          <div class="hero-card-meta">
            ${hero.class || '—'} · ${hero.ancestry || '—'} · Level ${hero.level || 1}
          </div>
          <div class="hero-card-stats">
            <span class="hero-card-stat">
              <span class="hero-stat-label">Victories</span>
              <span class="hero-stat-value">${hero.currentVictories || 0}</span>
            </span>
            <span class="hero-card-stat">
              <span class="hero-stat-label">XP</span>
              <span class="hero-stat-value">${hero.xp || 0}</span>
            </span>
            <span class="hero-card-stat">
              <span class="hero-stat-label">Recoveries</span>
              <span class="hero-stat-value">${hero.recoveries?.current ?? '?'}/${hero.recoveries?.max ?? '?'}</span>
            </span>
          </div>
        </div>
        <button class="hero-card-detail-btn" title="Details">›</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.campaign-hero-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.heroIdx, 10);
      if (!isNaN(idx)) openHeroDetail(campaign, idx);
    });
  });
}

// ── I3: Budget math ───────────────────────────────────────────────────────────

function heroES(level)  { return 4 + (2 * (level || 1)); }
function partyES(heroes) { return heroes.reduce((s, h) => s + heroES(h.level), 0); }

function encounterBudgets(heroes) {
  if (!heroes.length) return { total: 0, avgHeroES: 0, trivialMax: 0, easyMax: 0, standardMax: 0, hardMax: 0 };
  const es       = partyES(heroes);
  const avgHeroES = es / heroes.length;
  return { total: es, avgHeroES, trivialMax: es - avgHeroES, easyMax: es, standardMax: es + avgHeroES, hardMax: es + (3 * avgHeroES) };
}

function computeDifficulty(spent, budgets) {
  if (spent < budgets.trivialMax)    return 'trivial';
  if (spent < budgets.easyMax)       return 'easy';
  if (spent <= budgets.standardMax)  return 'standard';
  if (spent <= budgets.hardMax)      return 'hard';
  return 'extreme';
}

function difficultyTarget(diff, budgets) {
  const map = { trivial: budgets.trivialMax, easy: budgets.easyMax, standard: budgets.standardMax, hard: budgets.hardMax, extreme: budgets.hardMax * 1.5 };
  return Math.round(map[diff] ?? budgets.standardMax);
}

function round1Malice(heroes) {
  if (!heroes.length) return 0;
  const avgVic = Math.floor(heroes.reduce((s, h) => s + (h.currentVictories ?? 0), 0) / heroes.length);
  return heroes.length + avgVic;
}

const DIFFICULTY_COLOR = {
  trivial: 'var(--text-dim)', easy: 'var(--color-available)',
  standard: 'var(--color-gold)', hard: '#e67e22', extreme: 'var(--color-danger)',
};

const GOAL_TYPES = [
  { v: 'defeat_all',      l: 'Defeat All Enemies'  },
  { v: 'protect',         l: 'Protect the Thing'    },
  { v: 'stop_action',     l: 'Stop the Action'      },
  { v: 'complete_action', l: 'Complete the Action'  },
  { v: 'escort',          l: 'Escort'               },
  { v: 'survive_rounds',  l: 'Survive X Rounds'     },
  { v: 'custom',          l: 'Custom'               },
];

function computeSpent(enc) {
  const g = (enc.groups     || []).reduce((s, g) => s + (g.totalEV || g.ev * g.count || 0), 0);
  const n = (enc.customNPCs || []).reduce((s, n) => s + (n.ev || 0), 0);
  return g + n;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// ── Encounter list ────────────────────────────────────────────────────────────

function renderEncounterList(campaign) {
  const container = document.getElementById('encounter-list');
  if (!container) return;

  const encounters = campaign._encounters || [];
  const heroes     = campaign.heroes     || [];
  const budgets    = encounterBudgets(heroes);

  if (encounters.length === 0) {
    container.innerHTML = '<p class="panel-empty">No encounters yet.<br>Build your first encounter above.</p>';
    return;
  }

  container.innerHTML = encounters.map((enc, idx) => {
    const spent      = enc.budgetSpent || 0;
    const budget     = enc.encounterBudget || 0;
    const diff       = enc.difficulty || 'standard';
    const diffColor  = DIFFICULTY_COLOR[diff] || DIFFICULTY_COLOR.standard;
    const groupCount = (enc.groups || []).length + (enc.customNPCs || []).length;
    return `
      <div class="encounter-card" data-enc-idx="${idx}">
        <div class="encounter-card-order">
          <button class="enc-order-btn" data-dir="up"   data-idx="${idx}">▲</button>
          <span  class="enc-order-pos">${idx + 1}</span>
          <button class="enc-order-btn" data-dir="down" data-idx="${idx}">▼</button>
        </div>
        <div class="encounter-card-body">
          <div class="encounter-card-row1">
            <span class="encounter-card-name">${enc.name || 'Unnamed Encounter'}</span>
            <div class="encounter-card-badges">
              <span class="enc-badge enc-type-badge">${(enc.type || 'combat').toUpperCase()}</span>
              <span class="enc-badge enc-status-badge enc-status-${enc.status || 'draft'}">${(enc.status || 'draft').toUpperCase()}</span>
              <span class="enc-badge enc-diff-badge" style="color:${diffColor};border-color:${diffColor}">${diff.toUpperCase()}</span>
            </div>
          </div>
          <div class="encounter-card-row2">
            <span class="enc-meta-stat">${groupCount} group${groupCount !== 1 ? 's' : ''}</span>
            <span class="enc-meta-sep">·</span>
            <span class="enc-meta-stat">${spent}/${budget > 0 ? budget : '?'} EV</span>
            <span class="enc-meta-sep">·</span>
            <span class="enc-meta-stat">${enc.expectedVictories ?? 1}V expected</span>
          </div>
        </div>
        <div class="encounter-card-actions">
          ${enc.status === 'ready' ? `
            <button class="btn btn-primary btn-small encounter-start-btn" data-enc-idx="${idx}" data-enc-id="${enc.id}">Start</button>
          ` : ''}
          <button class="encounter-edit-btn" data-enc-idx="${idx}" title="Edit">✏</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.enc-order-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.idx, 10);
      reorderEncounters(campaign, i, btn.dataset.dir === 'up' ? i - 1 : i + 1);
    });
  });

  container.querySelectorAll('.encounter-start-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.encIdx, 10);
      if (!isNaN(idx)) startEncounterFromCampaign(campaign, campaign._encounters[idx]);
    });
  });

  container.querySelectorAll('.encounter-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.encounter-start-btn')) return;
      const idx = parseInt(card.dataset.encIdx, 10);
      if (!isNaN(idx)) openEncounterEditor(campaign, campaign._encounters[idx]);
    });
  });
}

async function reorderEncounters(campaign, fromIdx, toIdx) {
  const encs = campaign._encounters;
  if (toIdx < 0 || toIdx >= encs.length) return;
  const [moved] = encs.splice(fromIdx, 1);
  encs.splice(toIdx, 0, moved);
  encs.forEach((e, i) => { e.order = i + 1; });
  renderEncounterList(campaign);
  try {
    const batch = db.batch();
    encs.forEach(e => batch.update(
      db.collection('campaigns').doc(campaign.id).collection('encounters').doc(e.id),
      { order: e.order }
    ));
    await batch.commit();
  } catch (e) { console.error('Reorder failed:', e); }
}

// ── Campaign info + session log ───────────────────────────────────────────────

function renderCampaignInfo(campaign) {
  const container = document.getElementById('campaign-info-content');
  if (!container) return;

  const log = campaign.sessionLog || [];

  container.innerHTML = `
    <div class="info-section">
      <div class="panel-header">
        <span class="panel-title">Info</span>
      </div>
      <div class="info-rows">
        <div class="info-row">
          <span class="info-label">Campaign</span>
          <span class="info-value">${campaign.name || '—'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Advancement</span>
          <span class="info-value">${campaign.advancementMode || 'milestone'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Heroes</span>
          <span class="info-value">${(campaign.heroes || []).length}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Encounters</span>
          <span class="info-value">${(campaign._encounters || []).length}</span>
        </div>
      </div>
    </div>

    <div class="info-section" style="margin-top:20px">
      <div class="panel-header">
        <span class="panel-title">Session Log</span>
        <button class="btn btn-ghost btn-small" id="add-log-btn">+ Entry</button>
      </div>
      <div class="session-log-list">
        ${log.length === 0
          ? '<p class="panel-empty">No sessions logged yet.</p>'
          : [...log].reverse().map(entry => `
              <div class="log-entry">
                <div class="log-entry-header">
                  <span class="log-date">${
                    entry.date?.toDate?.()?.toLocaleDateString?.('en-US', { month:'short', day:'numeric', year:'numeric' })
                    || 'Session'
                  }</span>
                  <span class="log-victories">${entry.victoriesEarned || 0}V</span>
                  ${entry.respiteTaken ? '<span class="log-respite-tag">⛺ Respite</span>' : ''}
                </div>
                ${entry.summary ? `<p class="log-summary">${entry.summary}</p>` : ''}
              </div>
            `).join('')
        }
      </div>
    </div>
  `;

  document.getElementById('add-log-btn')?.addEventListener('click', () => showAddLogModal(campaign));
}

function showAddLogModal(campaign) {
  showModal(`
    <div class="add-log-modal">
      <h2>Session Entry</h2>
      <div class="wizard-field">
        <label class="wizard-label">Summary</label>
        <textarea id="log-summary-input" class="campaign-textarea" rows="3"
          placeholder="What happened this session?"></textarea>
      </div>
      <div class="wizard-two-mini">
        <div class="wizard-field">
          <label class="wizard-label">Victories Earned</label>
          <input type="number" id="log-victories-input" class="wizard-text-input" value="0" min="0" />
        </div>
        <div class="wizard-field" style="align-self:flex-end">
          <label class="ms-squad-toggle" style="padding-bottom:6px">
            <input type="checkbox" id="log-respite-check" />
            <span class="ms-squad-label">Respite taken</span>
          </label>
        </div>
      </div>
      <button class="btn btn-primary" id="log-confirm-btn" style="width:100%;margin-top:8px">
        Save Entry
      </button>
    </div>
  `);

  document.getElementById('log-confirm-btn')?.addEventListener('click', async () => {
    const summary         = document.getElementById('log-summary-input').value.trim();
    const victoriesEarned = parseInt(document.getElementById('log-victories-input').value, 10) || 0;
    const respiteTaken    = document.getElementById('log-respite-check').checked;

    const entry = {
      date: firebase.firestore.FieldValue.serverTimestamp(),
      summary,
      victoriesEarned,
      respiteTaken,
    };

    const updatedLog = [...(campaign.sessionLog || []), entry];
    try {
      await db.collection('campaigns').doc(campaign.id).update({ sessionLog: updatedLog });
      campaign.sessionLog = updatedLog;
      hideModal();
      renderCampaignInfo(campaign);
      showToast('Session entry saved.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Could not save entry.', 'danger');
    }
  });
}

// ── H2: Add hero ──────────────────────────────────────────────────────────────

function addHeroToCampaign(campaignId) {
  let activeTab = 'link';

  function renderTabContent() {
    const el = document.getElementById('add-hero-tab-content');
    if (!el) return;

    if (activeTab === 'link') {
      el.innerHTML = `
        <div class="wizard-field">
          <label class="wizard-label">Player Email</label>
          <div class="email-search-row">
            <input type="email" id="hero-email-input" class="wizard-text-input"
              placeholder="player@example.com" autocomplete="off" />
            <button class="btn btn-secondary btn-small" id="hero-email-search-btn">Search</button>
          </div>
        </div>
        <div id="email-search-results" class="email-search-results"></div>
      `;
      document.getElementById('hero-email-search-btn')?.addEventListener('click', searchPlayerByEmail);
      document.getElementById('hero-email-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') searchPlayerByEmail();
      });
      setTimeout(() => document.getElementById('hero-email-input')?.focus(), 60);
    } else {
      el.innerHTML = `
        <div class="wizard-field">
          <label class="wizard-label">Name</label>
          <input type="text" id="manual-hero-name" class="wizard-text-input" placeholder="Hero name" />
        </div>
        <div class="wizard-two-mini">
          <div class="wizard-field">
            <label class="wizard-label">Class</label>
            <select id="manual-hero-class" class="hp-damage-type-select">
              <option value="">— Select —</option>
              ${Object.keys(CLASS_COLORS).map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="wizard-field">
            <label class="wizard-label">Ancestry</label>
            <input type="text" id="manual-hero-ancestry" class="wizard-text-input" placeholder="e.g. Human" />
          </div>
        </div>
        <div class="wizard-field">
          <label class="wizard-label">Level</label>
          <input type="number" id="manual-hero-level" class="wizard-text-input" value="1" min="1" max="10" />
        </div>
        <button class="btn btn-primary" id="manual-hero-confirm-btn" style="width:100%;margin-top:8px">
          Add Hero
        </button>
      `;
      document.getElementById('manual-hero-confirm-btn')?.addEventListener('click', () => saveManualHero(campaignId));
      setTimeout(() => document.getElementById('manual-hero-name')?.focus(), 60);
    }
  }

  showModal(`
    <div class="add-hero-modal">
      <h2>Add Hero</h2>
      <div class="add-hero-tabs">
        <button class="add-hero-tab active" data-tab="link">Link Player</button>
        <button class="add-hero-tab" data-tab="manual">Add Manually</button>
      </div>
      <div id="add-hero-tab-content" class="add-hero-tab-content"></div>
    </div>
  `);

  renderTabContent();

  document.querySelectorAll('.add-hero-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.add-hero-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderTabContent();
    });
  });
}

async function searchPlayerByEmail() {
  const email   = document.getElementById('hero-email-input')?.value.trim().toLowerCase();
  const results = document.getElementById('email-search-results');
  if (!email || !results) return;

  results.innerHTML = '<p class="panel-empty">Searching…</p>';

  try {
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userSnap.empty) {
      results.innerHTML = '<p class="panel-empty">No player found with that email.</p>';
      return;
    }

    const userDoc  = userSnap.docs[0];
    const userData = userDoc.data();
    const userId   = userDoc.id;

    const charSnap = await db.collection('users').doc(userId)
      .collection('characters').orderBy('createdAt', 'desc').get();

    if (charSnap.empty) {
      results.innerHTML = `<p class="panel-empty">${userData.displayName || email} has no characters yet.</p>`;
      return;
    }

    results.innerHTML = `
      <p class="email-found-label">Found: <strong>${userData.displayName || email}</strong></p>
      <div class="char-pick-list">
        ${charSnap.docs.map(doc => {
          const c = doc.data();
          return `
            <button class="char-pick-row" data-char-id="${doc.id}" data-user-id="${userId}">
              <span class="char-pick-name">${c.name || 'Unnamed'}</span>
              <span class="char-pick-meta">${c.class || '—'} · Lv ${c.level || 1}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;

    results.querySelectorAll('.char-pick-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const charDoc = charSnap.docs.find(d => d.id === btn.dataset.charId);
        if (!charDoc) return;
        const c = charDoc.data();
        saveHeroToCampaign({
          heroId:           charDoc.id,
          userId,
          displayName:      c.name || userData.displayName || email,
          class:            c.class || '',
          ancestry:         c.ancestry || '',
          level:            c.level ?? 1,
          xp:               0,
          currentVictories: c.victories ?? 0,
          recoveries:       c.recoveries ?? { current: 8, max: 8 },
          notes:            '',
          isLinked:         true,
        });
      });
    });
  } catch (e) {
    console.error('Email search error:', e);
    results.innerHTML = '<p class="panel-empty error-text">Search failed. Try again.</p>';
  }
}

async function saveManualHero(campaignId) {
  const name     = document.getElementById('manual-hero-name')?.value.trim();
  const heroClass = document.getElementById('manual-hero-class')?.value || '';
  const ancestry = document.getElementById('manual-hero-ancestry')?.value.trim() || '';
  const level    = parseInt(document.getElementById('manual-hero-level')?.value, 10) || 1;

  if (!name) { showToast('Enter a hero name.', 'danger'); return; }

  await saveHeroToCampaign({
    heroId: '', userId: '',
    displayName:      name,
    class:            heroClass,
    ancestry,
    level,
    xp:               0,
    currentVictories: 0,
    recoveries:       { current: 8, max: 8 },
    notes:            '',
    isLinked:         false,
  });
}

async function saveHeroToCampaign(hero) {
  const campaign = AppState.currentCampaign;
  if (!campaign) return;

  const updatedHeroes = [...(campaign.heroes || []), hero];
  try {
    await db.collection('campaigns').doc(campaign.id).update({ heroes: updatedHeroes });
    campaign.heroes = updatedHeroes;
    hideModal();
    renderHeroRoster(campaign);
    updatePartyBar(campaign);
    showToast(`${hero.displayName} added to party.`, 'success');
  } catch (e) {
    console.error('Error adding hero:', e);
    showToast('Could not add hero.', 'danger');
  }
}

// ── H3: Hero detail panel ─────────────────────────────────────────────────────

async function openHeroDetail(campaign, heroIdx) {
  const hero = campaign.heroes[heroIdx];
  if (!hero) return;

  const accent   = CLASS_COLORS[hero.class]?.accent || '#2980B9';
  const level    = hero.level || 1;
  const xp       = hero.xp || 0;
  const nextXP   = LEVEL_XP_THRESHOLDS[level + 1] ?? null;
  const xpPct    = nextXP ? Math.min(100, Math.round((xp / nextXP) * 100)) : 100;

  // Fetch live character data for linked heroes
  let liveHTML = '';
  if (hero.isLinked && hero.userId && hero.heroId) {
    try {
      const charSnap = await db.collection('users').doc(hero.userId)
        .collection('characters').doc(hero.heroId).get();
      if (charSnap.exists) {
        const c = charSnap.data();
        const hpPct   = c.maxHP > 0 ? Math.round((c.currentHP / c.maxHP) * 100) : 0;
        const hpColor = hpPct > 60 ? 'var(--color-heal)' : hpPct > 25 ? '#f39c12' : 'var(--color-danger)';
        liveHTML = `
          <div class="hero-detail-live">
            <div class="hero-detail-live-label">◆ Live Character</div>
            <div class="hero-detail-live-grid">
              <div class="hero-detail-live-stat">
                <span class="hero-detail-stat-label">Stamina</span>
                <span class="hero-detail-stat-value" style="color:${hpColor}">
                  ${c.currentHP ?? 0}/${c.maxHP ?? 0}
                </span>
              </div>
              <div class="hero-detail-live-stat">
                <span class="hero-detail-stat-label">${c.heroicResource?.name || 'Resource'}</span>
                <span class="hero-detail-stat-value">
                  ${c.heroicResource?.current ?? 0}/${c.heroicResource?.max ?? 0}
                </span>
              </div>
              <div class="hero-detail-live-stat">
                <span class="hero-detail-stat-label">Recoveries</span>
                <span class="hero-detail-stat-value">
                  ${c.recoveries?.current ?? 0}/${c.recoveries?.max ?? 0}
                </span>
              </div>
              <div class="hero-detail-live-stat">
                <span class="hero-detail-stat-label">Victories</span>
                <span class="hero-detail-stat-value">${c.victories ?? 0}</span>
              </div>
            </div>
            ${c.conditions?.length ? `
              <div class="hero-detail-conditions">
                ${c.conditions.map(cond => `<span class="condition-badge">${cond}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        `;
      }
    } catch (e) {
      console.warn('Live character fetch failed:', e);
    }
  }

  showModal(`
    <div class="hero-detail-modal">

      <div class="hero-detail-header" style="border-left-color:${accent}">
        <div class="hero-detail-name">${hero.displayName}</div>
        <div class="hero-detail-meta">
          ${hero.class || '—'} · ${hero.ancestry || '—'} · Level ${level}
          ${hero.isLinked ? '&nbsp;<span class="hero-linked-badge">LINKED</span>' : ''}
        </div>
      </div>

      <div class="hero-detail-xp-section">
        <div class="hero-detail-xp-row">
          <span class="hero-detail-stat-label">XP</span>
          <span class="hero-detail-stat-value">${xp}${nextXP ? ` / ${nextXP}` : ' (max level)'}</span>
        </div>
        <div class="xp-bar-track">
          <div class="xp-bar-fill" style="width:${xpPct}%;background:${accent}"></div>
        </div>
      </div>

      ${liveHTML}

      <div class="hero-detail-vic-section">
        <span class="hero-detail-stat-label">Victories (this session)</span>
        <div class="hero-vic-controls">
          <button class="recovery-adj" id="hero-vic-minus">−</button>
          <span id="hero-vic-count" class="hero-vic-value">${hero.currentVictories || 0}</span>
          <button class="recovery-adj" id="hero-vic-plus">+</button>
          <button class="btn btn-ghost btn-small" id="hero-vic-save-btn">Save</button>
        </div>
      </div>

      <div class="hero-detail-notes-section">
        <label class="hero-detail-notes-label">GM Notes</label>
        <textarea id="hero-notes-input" class="campaign-textarea" rows="3"
          placeholder="Background, secrets, story hooks…">${hero.notes || ''}</textarea>
        <button class="btn btn-ghost btn-small" id="save-hero-notes-btn" style="margin-top:6px">
          Save Notes
        </button>
      </div>

      <div class="hero-detail-footer">
        <button class="btn btn-ghost btn-small btn-danger-ghost" id="remove-hero-btn">
          Remove from Campaign
        </button>
      </div>

    </div>
  `);

  // Victory counter
  let localVic = hero.currentVictories || 0;
  const vicCountEl = document.getElementById('hero-vic-count');
  document.getElementById('hero-vic-minus')?.addEventListener('click', () => {
    if (localVic > 0) { localVic--; if (vicCountEl) vicCountEl.textContent = localVic; }
  });
  document.getElementById('hero-vic-plus')?.addEventListener('click', () => {
    localVic++;
    if (vicCountEl) vicCountEl.textContent = localVic;
  });
  document.getElementById('hero-vic-save-btn')?.addEventListener('click', async () => {
    campaign.heroes[heroIdx] = { ...hero, currentVictories: localVic };
    await db.collection('campaigns').doc(campaign.id).update({ heroes: campaign.heroes });
    renderHeroRoster(campaign);
    updatePartyBar(campaign);
    showToast('Victories updated.', 'success');
  });

  // Save notes
  document.getElementById('save-hero-notes-btn')?.addEventListener('click', async () => {
    const notes = document.getElementById('hero-notes-input').value;
    campaign.heroes[heroIdx] = { ...hero, notes };
    await db.collection('campaigns').doc(campaign.id).update({ heroes: campaign.heroes });
    showToast('Notes saved.', 'success');
  });

  // Remove hero
  document.getElementById('remove-hero-btn')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${hero.displayName} from the campaign?`)) return;
    campaign.heroes.splice(heroIdx, 1);
    await db.collection('campaigns').doc(campaign.id).update({ heroes: campaign.heroes });
    hideModal();
    renderHeroRoster(campaign);
    updatePartyBar(campaign);
    showToast(`${hero.displayName} removed.`, 'info');
  });
}

// ── H4: Respite ───────────────────────────────────────────────────────────────

function showCampaignRespiteModal() {
  const campaign = AppState.currentCampaign;
  if (!campaign) return;

  const heroes = campaign.heroes || [];
  if (heroes.length === 0) { showToast('No heroes in party.', 'danger'); return; }

  const summary = heroes.map((hero) => {
    const currentXP   = hero.xp || 0;
    const victories   = hero.currentVictories || 0;
    const newXP       = currentXP + victories;
    const currentLevel = hero.level || 1;
    const newLevel    = campaign.advancementMode === 'xp'
      ? Math.max(currentLevel, xpToLevel(newXP))
      : currentLevel;
    const levelsUp = newLevel - currentLevel;
    return { hero, victories, currentXP, newXP, currentLevel, newLevel, levelsUp };
  });

  showModal(`
    <div class="respite-modal">
      <h2>⛺ Respite</h2>
      <p class="respite-desc">All recoveries restore. Victories convert to XP. Conditions clear.</p>
      <div class="respite-summary">
        ${summary.map(r => `
          <div class="respite-hero-row ${r.levelsUp > 0 ? 'respite-levelup' : ''}">
            <span class="respite-hero-name">${r.hero.displayName}</span>
            <div class="respite-hero-changes">
              <span class="respite-vic">${r.victories}V</span>
              <span class="respite-arrow">→</span>
              <span class="respite-xp">+${r.victories} XP (${r.currentXP} → ${r.newXP})</span>
              ${r.levelsUp > 0
                ? `<span class="respite-levelup-badge">🎉 Level ${r.currentLevel} → ${r.newLevel}</span>`
                : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-primary" id="respite-confirm-btn" style="width:100%;margin-top:16px">
        Confirm Respite
      </button>
    </div>
  `);

  document.getElementById('respite-confirm-btn')?.addEventListener('click', () =>
    performCampaignRespite(campaign, summary)
  );
}

async function performCampaignRespite(campaign, summary) {
  const btn = document.getElementById('respite-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Applying…'; }

  try {
    const updatedHeroes = campaign.heroes.map((hero, idx) => {
      const r = summary[idx];
      if (!r) return hero;
      return {
        ...hero,
        xp:               r.newXP,
        level:            r.newLevel,
        currentVictories: 0,
        recoveries:       { ...hero.recoveries, current: hero.recoveries?.max ?? 8 },
      };
    });

    await db.collection('campaigns').doc(campaign.id).update({ heroes: updatedHeroes });
    campaign.heroes = updatedHeroes;

    // For linked heroes: also update the live character document
    await Promise.all(
      summary
        .filter(r => r.hero.isLinked && r.hero.userId && r.hero.heroId)
        .map(r =>
          db.collection('users').doc(r.hero.userId)
            .collection('characters').doc(r.hero.heroId)
            .update({
              victories:            0,
              'recoveries.current': r.hero.recoveries?.max ?? 8,
            })
            .catch(e => console.warn(`Could not update ${r.hero.displayName}:`, e))
        )
    );

    hideModal();
    renderCampaignScreen();
    showToast('Respite complete — recoveries restored!', 'success');
  } catch (e) {
    console.error('Respite failed:', e);
    showToast('Respite failed. Try again.', 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Respite'; }
  }
}

// ── Add encounter ─────────────────────────────────────────────────────────────

function showAddEncounterModal() {
  const campaign = AppState.currentCampaign;
  if (!campaign) return;

  showModal(`
    <div class="add-encounter-modal">
      <h2>New Encounter</h2>
      <div class="wizard-field">
        <label class="wizard-label">Name</label>
        <input type="text" id="enc-name-input" class="wizard-text-input"
          placeholder="Goblin Ambush at the Bridge" maxlength="60" autocomplete="off" />
      </div>
      <div class="wizard-two-mini">
        <div class="wizard-field">
          <label class="wizard-label">Type</label>
          <select id="enc-type-select" class="hp-damage-type-select">
            <option value="combat">Combat</option>
            <option value="negotiation">Negotiation</option>
            <option value="montage">Montage</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="wizard-field">
          <label class="wizard-label">Difficulty</label>
          <select id="enc-diff-select" class="hp-damage-type-select">
            <option value="standard" selected>Standard</option>
            <option value="trivial">Trivial</option>
            <option value="easy">Easy</option>
            <option value="hard">Hard</option>
            <option value="extreme">Extreme</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" id="enc-create-btn" style="width:100%;margin-top:8px">
        Create & Edit →
      </button>
    </div>
  `);

  setTimeout(() => document.getElementById('enc-name-input')?.focus(), 60);

  document.getElementById('enc-create-btn')?.addEventListener('click', async () => {
    const name       = document.getElementById('enc-name-input')?.value.trim();
    const type       = document.getElementById('enc-type-select')?.value || 'combat';
    const difficulty = document.getElementById('enc-diff-select')?.value || 'standard';
    if (!name) { showToast('Enter an encounter name.', 'danger'); return; }

    const budgets = encounterBudgets(campaign.heroes || []);
    const encData = {
      name, type, difficulty,
      status:            'draft',
      order:             (campaign._encounters?.length || 0) + 1,
      createdAt:         firebase.firestore.FieldValue.serverTimestamp(),
      groups:            [],
      customNPCs:        [],
      encounterBudget:   difficultyTarget(difficulty, budgets),
      budgetSpent:       0,
      goalType:          'defeat_all',
      goalDescription:   '',
      expectedVictories: 1,
      terrain:           '',
      mapNotes:          '',
      gmNotes:           '',
      sessionCode:       '',
      victoriesAwarded:  0,
    };

    const btn = document.getElementById('enc-create-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

    try {
      const ref = await db.collection('campaigns').doc(campaign.id)
        .collection('encounters').add(encData);
      if (!campaign._encounters) campaign._encounters = [];
      const newEnc = { id: ref.id, ...encData };
      campaign._encounters.push(newEnc);
      hideModal();
      renderEncounterList(campaign);
      openEncounterEditor(campaign, newEnc);
    } catch (e) {
      console.error('Error creating encounter:', e);
      showToast('Could not create encounter.', 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Create & Edit →'; }
    }
  });
}

// ── I2: Encounter Editor ──────────────────────────────────────────────────────

let _saveDebounce = null;

function queueSave(campaign, enc) {
  clearTimeout(_saveDebounce);
  _saveDebounce = setTimeout(() => _saveEncounterNow(campaign, enc), 500);
}

async function _saveEncounterNow(campaign, enc) {
  if (!enc?.id) return;
  try {
    const { id, ...fields } = enc;
    await db.collection('campaigns').doc(campaign.id)
      .collection('encounters').doc(id)
      .update({ ...fields, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    console.error('Auto-save failed:', e);
  }
}

function openEncounterEditor(campaign, enc) {
  document.getElementById('encounter-editor-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id        = 'encounter-editor-overlay';
  overlay.className = 'encounter-editor-overlay';
  document.getElementById('campaign-screen')?.appendChild(overlay);
  renderEncounterEditor(campaign, enc, overlay);
}

function closeEncounterEditor(campaign, enc) {
  if (_saveDebounce) { clearTimeout(_saveDebounce); _saveDebounce = null; _saveEncounterNow(campaign, enc); }
  document.getElementById('encounter-editor-overlay')?.remove();
}

function renderEncounterEditor(campaign, enc, overlay) {
  const heroes  = campaign.heroes || [];
  const budgets = encounterBudgets(heroes);
  enc.encounterBudget = difficultyTarget(enc.difficulty || 'standard', budgets);
  enc.budgetSpent     = computeSpent(enc);

  overlay.innerHTML = `
    <div class="enc-editor-header">
      <button class="btn btn-ghost btn-icon" id="enc-editor-back">←</button>
      <span class="enc-editor-title" id="enc-editor-title-display">${esc(enc.name || 'New Encounter')}</span>
      <span class="enc-editor-status enc-status-${enc.status || 'draft'}" id="enc-status-display">${(enc.status || 'draft').toUpperCase()}</span>
      <button class="btn btn-primary btn-small" id="enc-mark-ready-btn">
        ${enc.status === 'ready' ? '✓ Ready' : 'Mark Ready'}
      </button>
    </div>

    <div class="enc-editor-body">

      <div class="enc-editor-col enc-editor-left">
        <div class="enc-section-title">Setup</div>

        <div class="enc-field">
          <label class="enc-label">Name</label>
          <input type="text" id="enc-name-field" class="wizard-text-input"
            value="${esc(enc.name || '')}" placeholder="Encounter name…" maxlength="60" autocomplete="off" />
        </div>

        <div class="enc-field-row">
          <div class="enc-field">
            <label class="enc-label">Type</label>
            <select id="enc-type-field" class="hp-damage-type-select">
              ${['combat','negotiation','montage','custom'].map(t =>
                `<option value="${t}" ${enc.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="enc-field">
            <label class="enc-label">Difficulty</label>
            <select id="enc-diff-field" class="hp-damage-type-select">
              ${['trivial','easy','standard','hard','extreme'].map(d =>
                `<option value="${d}" ${enc.difficulty === d ? 'selected' : ''}>${d.charAt(0).toUpperCase()+d.slice(1)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="enc-field">
          <label class="enc-label">Goal</label>
          <select id="enc-goal-field" class="hp-damage-type-select">
            ${GOAL_TYPES.map(g =>
              `<option value="${g.v}" ${enc.goalType === g.v ? 'selected' : ''}>${g.l}</option>`
            ).join('')}
          </select>
        </div>

        <div class="enc-field" id="enc-goal-custom-field" style="${enc.goalType === 'custom' ? '' : 'display:none'}">
          <label class="enc-label">Custom Goal</label>
          <input type="text" id="enc-goal-desc-field" class="wizard-text-input"
            value="${esc(enc.goalDescription || '')}" placeholder="Describe the goal…" autocomplete="off" />
        </div>

        <div class="enc-field-row">
          <div class="enc-field">
            <label class="enc-label">Expected Victories</label>
            <select id="enc-victories-field" class="hp-damage-type-select">
              ${[0,1,2].map(v =>
                `<option value="${v}" ${enc.expectedVictories === v ? 'selected' : ''}>${v}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="enc-field">
          <label class="enc-label">Terrain / Map Notes</label>
          <textarea id="enc-terrain-field" class="campaign-textarea" rows="2"
            placeholder="Difficult terrain, elevation, hazards…">${esc(enc.terrain || '')}</textarea>
        </div>

        <div class="enc-field">
          <label class="enc-label">GM Notes (private)</label>
          <textarea id="enc-gmnotes-field" class="campaign-textarea" rows="3"
            placeholder="Tactics, story hooks, secret objectives…">${esc(enc.gmNotes || '')}</textarea>
        </div>
      </div>

      <div class="enc-editor-col enc-editor-center">
        <div class="enc-section-title">Monster Roster</div>
        ${buildBudgetBarHTML(enc, budgets)}
        <div id="enc-roster-list" class="enc-roster-list">
          ${buildRosterHTML(enc, heroes)}
        </div>
        <div class="enc-roster-actions">
          <button class="btn btn-ghost btn-small" id="enc-add-monster-btn">+ Add Monster</button>
          <button class="btn btn-ghost btn-small" id="enc-add-npc-btn">+ Custom NPC</button>
        </div>
        <div id="enc-custom-npc-form" class="enc-custom-npc-form hidden">
          <div class="enc-npc-form-row">
            <input type="text"   id="npc-name-input"    class="wizard-text-input" placeholder="NPC name" style="flex:1" />
            <input type="number" id="npc-stamina-input" class="wizard-text-input enc-mini-input" placeholder="HP"  min="1" />
            <input type="number" id="npc-ev-input"      class="wizard-text-input enc-mini-input" placeholder="EV"  min="0" />
          </div>
          <div class="enc-npc-form-row">
            <label class="ms-squad-toggle">
              <input type="checkbox" id="npc-boss-check" />
              <span class="ms-squad-label">Boss</span>
            </label>
            <button class="btn btn-primary btn-small" id="npc-add-confirm-btn">Add</button>
            <button class="btn btn-ghost   btn-small" id="npc-add-cancel-btn">Cancel</button>
          </div>
        </div>
      </div>

      <div class="enc-editor-col enc-editor-right">
        <div class="enc-section-title">Challenge Preview</div>
        ${buildChallengePreviewHTML(campaign, enc, budgets)}
      </div>

    </div>
  `;

  wireEncounterEditor(campaign, enc, overlay);
}

// ── Builder HTML helpers ──────────────────────────────────────────────────────

function buildBudgetBarHTML(enc, budgets) {
  const spent  = enc.budgetSpent || 0;
  const budget = Math.max(enc.encounterBudget || 1, 1);
  const pct    = Math.min(100, Math.round((spent / budget) * 100));
  const barColor = spent > budget * 1.1 ? 'var(--color-danger)'
    : spent > budget * 0.85 ? 'var(--color-gold)' : 'var(--color-available)';
  return `
    <div class="enc-budget-bar-section">
      <div class="enc-budget-bar-header">
        <span class="enc-budget-label">Budget</span>
        <span class="enc-budget-numbers" id="enc-budget-numbers">
          <span class="enc-budget-spent" style="color:${barColor}">${spent}</span>
          <span class="enc-budget-sep">/</span>
          <span class="enc-budget-total">${budget}</span>
          <span class="enc-budget-ev-label">EV</span>
        </span>
      </div>
      <div class="enc-budget-bar-track">
        <div class="enc-budget-bar-fill" id="enc-budget-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>
  `;
}

function buildRosterHTML(enc, heroes) {
  const groups   = enc.groups     || [];
  const npcs     = enc.customNPCs || [];
  const avgLevel = heroes.length ? heroes.reduce((s, h) => s + (h.level || 1), 0) / heroes.length : 1;
  const warnLevel = avgLevel + 2;

  if (groups.length === 0 && npcs.length === 0) {
    return '<p class="panel-empty">No monsters yet.<br>Add monsters to build this encounter.</p>';
  }

  const groupHTML = groups.map((g, idx) => {
    const totalEV = g.totalEV ?? (g.ev * g.count);
    const isHigh  = (g.monsterLevel || 0) > warnLevel;
    return `
      <div class="enc-group-card ${isHigh ? 'enc-group-warning' : ''}" data-group-idx="${idx}">
        <div class="enc-group-header">
          <span class="enc-group-name">${esc(g.monsterName || 'Unknown')}</span>
          ${isHigh ? '<span class="enc-level-warn-icon" title="Monster exceeds party level +2">⚠</span>' : ''}
          <button class="enc-group-remove" data-type="group" data-group-idx="${idx}" title="Remove">✕</button>
        </div>
        <div class="enc-group-details">
          <div class="enc-group-count-ctrl">
            <button class="enc-count-btn" data-group-idx="${idx}" data-delta="-1">−</button>
            <span class="enc-count-val" id="enc-count-val-${idx}">${g.count}</span>
            <button class="enc-count-btn" data-group-idx="${idx}" data-delta="1">+</button>
          </div>
          <span class="enc-group-ev">${g.ev} EV each</span>
          <span class="enc-group-total-ev" id="enc-total-ev-${idx}">${totalEV} EV total</span>
          <label class="ms-squad-toggle">
            <input type="checkbox" class="enc-squad-check" data-group-idx="${idx}" ${g.isSquad ? 'checked' : ''} />
            <span class="ms-squad-label">Squad</span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  const npcHTML = npcs.map((n, idx) => `
    <div class="enc-group-card enc-npc-card" data-npc-idx="${idx}">
      <div class="enc-group-header">
        <span class="enc-group-name">${esc(n.name || 'Custom NPC')}</span>
        <span class="enc-npc-tag">CUSTOM</span>
        ${n.isBoss ? '<span class="enc-boss-tag">BOSS</span>' : ''}
        <button class="enc-group-remove" data-type="npc" data-npc-idx="${idx}" title="Remove">✕</button>
      </div>
      <div class="enc-group-details">
        <span class="enc-group-ev">${n.stamina} HP</span>
        <span class="enc-group-total-ev">${n.ev} EV</span>
      </div>
    </div>
  `).join('');

  return groupHTML + npcHTML;
}

function buildChallengePreviewHTML(campaign, enc, budgets) {
  const heroes    = campaign.heroes || [];
  const spent     = enc.budgetSpent || 0;
  const diff      = computeDifficulty(spent, budgets);
  const diffColor = DIFFICULTY_COLOR[diff] || DIFFICULTY_COLOR.standard;
  const malice    = round1Malice(heroes);
  const groups    = enc.groups || [];
  const avgLevel  = heroes.length ? heroes.reduce((s, h) => s + (h.level || 1), 0) / heroes.length : 1;
  const anyHighLevel = groups.some(g => (g.monsterLevel || 0) > avgLevel + 2);
  const vicLabel  = enc.expectedVictories === 0 ? 'No victories'
    : enc.expectedVictories === 2 ? '2 victories' : '1 victory';

  const heroRows = heroes.length
    ? heroes.map(h => `
        <div class="preview-hero-row">
          <span class="preview-hero-name">${esc(h.displayName || 'Hero')}</span>
          <span class="preview-hero-class">${esc(h.class || '—')}</span>
          <span class="preview-hero-es">ES ${heroES(h.level)}</span>
        </div>
      `).join('')
    : '<p class="panel-empty" style="padding:8px 0">No heroes in party.</p>';

  return `
    <div class="preview-section">
      <div class="preview-section-label">Party ES</div>
      <div class="preview-hero-list">${heroRows}</div>
      <div class="preview-total-row">
        <span>Total Party ES</span>
        <span class="preview-total-es">${budgets.total}</span>
      </div>
    </div>

    <div class="preview-section">
      <div class="preview-section-label">This Encounter</div>
      <div class="preview-stat-row">
        <span>Auto Difficulty</span>
        <span class="preview-difficulty" style="color:${diffColor}">${diff.toUpperCase()}</span>
      </div>
      <div class="preview-stat-row">
        <span>Round 1 Malice</span>
        <span>${malice}+</span>
      </div>
      <div class="preview-stat-row">
        <span>Expected Reward</span>
        <span class="preview-victories">${vicLabel}</span>
      </div>
    </div>

    ${anyHighLevel ? `
      <div class="preview-warning-banner">
        ⚠ One or more monsters exceed party level + 2. Consider reducing difficulty.
      </div>
    ` : ''}
  `;
}

function refreshBudgetDisplay(enc, budgets) {
  const spent  = enc.budgetSpent || 0;
  const budget = Math.max(enc.encounterBudget || 1, 1);
  const pct    = Math.min(100, Math.round((spent / budget) * 100));
  const barColor = spent > budget * 1.1 ? 'var(--color-danger)'
    : spent > budget * 0.85 ? 'var(--color-gold)' : 'var(--color-available)';

  const fillEl    = document.getElementById('enc-budget-bar-fill');
  const numbersEl = document.getElementById('enc-budget-numbers');
  if (fillEl) { fillEl.style.width = `${pct}%`; fillEl.style.background = barColor; }
  if (numbersEl) {
    numbersEl.innerHTML = `
      <span class="enc-budget-spent" style="color:${barColor}">${spent}</span>
      <span class="enc-budget-sep">/</span>
      <span class="enc-budget-total">${budget}</span>
      <span class="enc-budget-ev-label">EV</span>
    `;
  }
}

function refreshChallengePreview(campaign, enc, budgets) {
  const col = document.querySelector('#encounter-editor-overlay .enc-editor-right');
  if (!col) return;
  col.innerHTML = `<div class="enc-section-title">Challenge Preview</div>${buildChallengePreviewHTML(campaign, enc, budgets)}`;
}

// ── Wire encounter editor events ──────────────────────────────────────────────

function wireEncounterEditor(campaign, enc, overlay) {
  document.getElementById('enc-editor-back')?.addEventListener('click', () => {
    closeEncounterEditor(campaign, enc);
    renderEncounterList(campaign);
  });

  document.getElementById('enc-mark-ready-btn')?.addEventListener('click', async () => {
    enc.status = enc.status === 'ready' ? 'draft' : 'ready';
    const statusEl = document.getElementById('enc-status-display');
    const readyBtn = document.getElementById('enc-mark-ready-btn');
    if (statusEl) { statusEl.className = `enc-editor-status enc-status-${enc.status}`; statusEl.textContent = enc.status.toUpperCase(); }
    if (readyBtn) readyBtn.textContent = enc.status === 'ready' ? '✓ Ready' : 'Mark Ready';
    await _saveEncounterNow(campaign, enc);
    renderEncounterList(campaign);
    showToast(`Encounter ${enc.status}.`, 'success');
  });

  document.getElementById('enc-name-field')?.addEventListener('input', e => {
    enc.name = e.target.value;
    const titleEl = document.getElementById('enc-editor-title-display');
    if (titleEl) titleEl.textContent = enc.name || 'New Encounter';
    queueSave(campaign, enc);
    renderEncounterList(campaign);
  });

  document.getElementById('enc-type-field')?.addEventListener('change', e => {
    enc.type = e.target.value;
    queueSave(campaign, enc);
    renderEncounterList(campaign);
  });

  document.getElementById('enc-diff-field')?.addEventListener('change', e => {
    enc.difficulty = e.target.value;
    const budgets = encounterBudgets(campaign.heroes || []);
    enc.encounterBudget = difficultyTarget(enc.difficulty, budgets);
    refreshBudgetDisplay(enc, budgets);
    refreshChallengePreview(campaign, enc, budgets);
    queueSave(campaign, enc);
    renderEncounterList(campaign);
  });

  document.getElementById('enc-goal-field')?.addEventListener('change', e => {
    enc.goalType = e.target.value;
    const customField = document.getElementById('enc-goal-custom-field');
    if (customField) customField.style.display = enc.goalType === 'custom' ? '' : 'none';
    queueSave(campaign, enc);
  });

  document.getElementById('enc-goal-desc-field')?.addEventListener('input', e => {
    enc.goalDescription = e.target.value;
    queueSave(campaign, enc);
  });

  document.getElementById('enc-victories-field')?.addEventListener('change', e => {
    enc.expectedVictories = parseInt(e.target.value, 10);
    queueSave(campaign, enc);
    renderEncounterList(campaign);
  });

  document.getElementById('enc-terrain-field')?.addEventListener('input', e => {
    enc.terrain = e.target.value;
    queueSave(campaign, enc);
  });

  document.getElementById('enc-gmnotes-field')?.addEventListener('input', e => {
    enc.gmNotes = e.target.value;
    queueSave(campaign, enc);
  });

  document.getElementById('enc-add-monster-btn')?.addEventListener('click', () => {
    MonsterSearch.showMonsterSearch((monster, count, isSquad) => {
      // Monster search replaces the modal; re-show editor overlay after selection
      document.getElementById('encounter-editor-overlay')?.remove();
      const newOverlay = document.createElement('div');
      newOverlay.id = 'encounter-editor-overlay';
      newOverlay.className = 'encounter-editor-overlay';
      document.getElementById('campaign-screen')?.appendChild(newOverlay);
      renderEncounterEditor(campaign, enc, newOverlay);
      addMonsterGroup(campaign, enc, monster, count, isSquad);
    });
  });

  document.getElementById('enc-add-npc-btn')?.addEventListener('click', () => {
    document.getElementById('enc-custom-npc-form')?.classList.toggle('hidden');
  });

  document.getElementById('npc-add-confirm-btn')?.addEventListener('click', () => {
    const name    = document.getElementById('npc-name-input')?.value.trim();
    const stamina = parseInt(document.getElementById('npc-stamina-input')?.value, 10) || 10;
    const ev      = parseInt(document.getElementById('npc-ev-input')?.value, 10) || 0;
    const isBoss  = document.getElementById('npc-boss-check')?.checked ?? false;
    if (!name) { showToast('Enter NPC name.', 'danger'); return; }
    if (!enc.customNPCs) enc.customNPCs = [];
    enc.customNPCs.push({ name, stamina, ev, isBoss });
    enc.budgetSpent = computeSpent(enc);

    const rosterEl = document.getElementById('enc-roster-list');
    if (rosterEl) rosterEl.innerHTML = buildRosterHTML(enc, campaign.heroes || []);
    document.getElementById('enc-custom-npc-form')?.classList.add('hidden');

    const budgets = encounterBudgets(campaign.heroes || []);
    refreshBudgetDisplay(enc, budgets);
    refreshChallengePreview(campaign, enc, budgets);
    wireGroupCards(campaign, enc);
    queueSave(campaign, enc);
    renderEncounterList(campaign);
  });

  document.getElementById('npc-add-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('enc-custom-npc-form')?.classList.add('hidden');
  });

  wireGroupCards(campaign, enc);
}

function wireGroupCards(campaign, enc) {
  document.querySelectorAll('#enc-roster-list .enc-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx   = parseInt(btn.dataset.groupIdx, 10);
      const delta = parseInt(btn.dataset.delta, 10);
      const group = enc.groups[idx];
      if (!group) return;
      group.count   = Math.max(1, group.count + delta);
      group.totalEV = group.ev * group.count;
      enc.budgetSpent = computeSpent(enc);

      const countEl = document.getElementById(`enc-count-val-${idx}`);
      const totalEl = document.getElementById(`enc-total-ev-${idx}`);
      if (countEl) countEl.textContent = group.count;
      if (totalEl) totalEl.textContent = `${group.totalEV} EV total`;

      const budgets = encounterBudgets(campaign.heroes || []);
      refreshBudgetDisplay(enc, budgets);
      refreshChallengePreview(campaign, enc, budgets);
      queueSave(campaign, enc);
      renderEncounterList(campaign);
    });
  });

  document.querySelectorAll('#enc-roster-list .enc-squad-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.dataset.groupIdx, 10);
      if (enc.groups[idx]) {
        enc.groups[idx].isSquad = chk.checked;
        if (chk.checked) enc.groups[idx].squadStamina = (enc.groups[idx].stamina || 0) * enc.groups[idx].count;
        queueSave(campaign, enc);
      }
    });
  });

  document.querySelectorAll('#enc-roster-list .enc-group-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.type === 'group') {
        enc.groups.splice(parseInt(btn.dataset.groupIdx, 10), 1);
      } else {
        enc.customNPCs.splice(parseInt(btn.dataset.npcIdx, 10), 1);
      }
      enc.budgetSpent = computeSpent(enc);

      const rosterEl = document.getElementById('enc-roster-list');
      if (rosterEl) rosterEl.innerHTML = buildRosterHTML(enc, campaign.heroes || []);
      wireGroupCards(campaign, enc);

      const budgets = encounterBudgets(campaign.heroes || []);
      refreshBudgetDisplay(enc, budgets);
      refreshChallengePreview(campaign, enc, budgets);
      queueSave(campaign, enc);
      renderEncounterList(campaign);
    });
  });
}

function addMonsterGroup(campaign, enc, monster, count, isSquad) {
  if (!enc.groups) enc.groups = [];
  enc.groups.push({
    groupId:      `${monster.id}-${Date.now()}`,
    monsterId:    monster.id,
    monsterName:  monster.name,
    monsterLevel: monster.level,
    count,
    ev:           monster.ev,
    totalEV:      monster.ev * count,
    isSquad,
    squadStamina: isSquad ? monster.stamina * count : 0,
    isBoss:       monster.isSolo || false,
    notes:        '',
  });
  enc.budgetSpent = computeSpent(enc);

  const rosterEl = document.getElementById('enc-roster-list');
  if (rosterEl) rosterEl.innerHTML = buildRosterHTML(enc, campaign.heroes || []);
  wireGroupCards(campaign, enc);

  const budgets = encounterBudgets(campaign.heroes || []);
  refreshBudgetDisplay(enc, budgets);
  refreshChallengePreview(campaign, enc, budgets);
  queueSave(campaign, enc);
  renderEncounterList(campaign);
}

// ── Wire static campaign screen buttons (called once at module init) ───────────

document.getElementById('campaign-respite-btn')
  ?.addEventListener('click', showCampaignRespiteModal);

document.getElementById('add-hero-btn')
  ?.addEventListener('click', () => {
    if (AppState.currentCampaign) addHeroToCampaign(AppState.currentCampaign.id);
  });

document.getElementById('add-encounter-btn')
  ?.addEventListener('click', showAddEncounterModal);

document.getElementById('director-mode-btn')
  ?.addEventListener('click', openCampaignScreen);

// ── J1: Start Encounter from Campaign ────────────────────────────────────────

async function startEncounterFromCampaign(campaign, enc) {
  const user = AppState.currentUser;
  if (!user) return;

  const btns = document.querySelectorAll(`.encounter-start-btn[data-enc-id="${enc.id}"]`);
  btns.forEach(b => { b.disabled = true; b.textContent = 'Starting…'; });

  try {
    // Fetch monster staminas for groups
    const monsterIds = [...new Set((enc.groups || []).map(g => g.monsterId).filter(Boolean))];
    const monsterMap = {};
    if (monsterIds.length) {
      const chunks = [];
      for (let i = 0; i < monsterIds.length; i += 10) chunks.push(monsterIds.slice(i, i + 10));
      for (const chunk of chunks) {
        const snap = await db.collection('monsters')
          .where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
        snap.forEach(d => { monsterMap[d.id] = d.data(); });
      }
    }

    // Build enemies array from encounter groups
    const enemies = [];
    for (const g of (enc.groups || [])) {
      const m      = monsterMap[g.monsterId] || {};
      const baseHP = m.stamina || 20;
      const maxHP  = g.isSquad ? (g.squadStamina || baseHP * g.count) : baseHP;
      enemies.push({
        id:                 g.groupId || `grp-${Date.now()}-${Math.random()}`,
        name:               g.isSquad ? `${g.monsterName} (Squad ×${g.count})` : g.monsterName,
        maxHP,
        currentHP:          maxHP,
        count:              g.count,
        isSquad:            g.isSquad || false,
        conditions:         [],
        isActivated:        false,
        isBoss:             g.isBoss || false,
        villainActionsUsed: [],
        monsterId:          g.monsterId,
      });
    }
    for (const n of (enc.customNPCs || [])) {
      enemies.push({
        id: `npc-${Date.now()}-${Math.random()}`,
        name: n.name, maxHP: n.stamina || 20, currentHP: n.stamina || 20,
        count: 1, isSquad: false, conditions: [], isActivated: false,
        isBoss: n.isBoss || false, villainActionsUsed: [],
      });
    }

    // Build heroes array from campaign roster
    const heroes = campaign.heroes.map(h => ({
      userId:      h.userId || '',
      characterId: h.heroId || '',
      displayName: h.displayName,
      class:       h.class || '',
      currentHP:   0,
      maxHP:       0,
      heroicResource: { name: (typeof CLASS_COLORS !== 'undefined' && CLASS_COLORS[h.class]?.resource) || 'Resource', current: 0, max: 10 },
      recoveries:  h.recoveries || { current: 8, max: 8 },
      conditions:  [],
      hasActed: false, hasManeuvered: false, hasUsedTriggered: false,
      hasUsedFreeTriggered: false, hasUsedFreeStrike: false,
      isActivated: false,
      usedOncePerEncounterAbilities: [],
      usedOncePerTurnAbilities: [],
    }));

    // Starting malice = avg victories of party
    const startMalice = campaign.heroes.length
      ? Math.floor(campaign.heroes.reduce((s, h) => s + (h.currentVictories || 0), 0) / campaign.heroes.length)
      : 0;

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await db.collection('sessions').doc(code).set({
      directorId:  user.uid,
      active:      true,
      round:       1,
      heroTokens:  1,
      malice:      startMalice,
      activeSide:  null,
      enemies,
      heroes,
      userIds:     [user.uid],
      campaignId:  campaign.id,
      encounterId: enc.id,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });

    enc.sessionCode = code;
    enc.status      = 'active';
    await db.collection('campaigns').doc(campaign.id)
      .collection('encounters').doc(enc.id)
      .update({ status: 'active', sessionCode: code });
    renderEncounterList(campaign);

    // Store runner context for End Encounter
    AppState.currentRunnerCampaign  = campaign;
    AppState.currentRunnerEncounter = enc;
    AppState.currentSession = { code, isDirector: true, isRunnerMode: true };

    if (typeof joinSessionListeners === 'function') joinSessionListeners(code);
    showScreen(SCREENS.ENCOUNTER_RUNNER);

    const titleEl = document.getElementById('runner-title');
    const codeEl  = document.getElementById('runner-session-code');
    if (titleEl) titleEl.textContent = enc.name || 'Encounter';
    if (codeEl)  codeEl.textContent  = code;

    showModal(`
      <div class="session-started-modal">
        <h2>Encounter Started!</h2>
        <p class="respite-desc">Share this code with your players:</p>
        <div class="session-code-display">${code}</div>
        <p class="respite-desc" style="margin-top:8px">Players: character sheet → Join Session</p>
        <button class="btn btn-primary" onclick="hideModal()" style="width:100%;margin-top:12px">Let's Go!</button>
      </div>
    `);

  } catch (e) {
    console.error('startEncounterFromCampaign:', e);
    showToast('Could not start encounter.', 'danger');
    btns.forEach(b => { b.disabled = false; b.textContent = 'Start'; });
  }
}

// ── J3: End Encounter ─────────────────────────────────────────────────────────

function showEndEncounterModal(campaign, enc, sessionCode) {
  const defaultVic = enc?.expectedVictories ?? 1;

  showModal(`
    <div class="end-encounter-modal">
      <h2>End Encounter</h2>
      <p class="respite-desc">Award victories and mark outcome.</p>

      <div class="enc-field" style="gap:8px">
        <label class="enc-label">Objective Outcome</label>
        <div class="outcome-group">
          ${[
            { v:'yes',     l:'Yes',     d:'Objectives achieved',      vic: defaultVic },
            { v:'partial', l:'Partial', d:'Some objectives met',      vic: Math.min(1, defaultVic) },
            { v:'no',      l:'No',      d:'Objectives not achieved',  vic: 0 },
          ].map(o => `
            <label class="outcome-option ${o.v === 'yes' ? 'active' : ''}" data-vic="${o.vic}">
              <input type="radio" name="outcome" value="${o.v}" ${o.v === 'yes' ? 'checked' : ''} />
              <div class="outcome-content">
                <span class="outcome-label-text">${o.l}</span>
                <span class="outcome-desc-text">${o.d}</span>
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="enc-field">
        <label class="enc-label">Victories Awarded</label>
        <div class="hero-vic-controls" style="margin-top:4px">
          <button class="recovery-adj" id="end-vic-minus">−</button>
          <span id="end-vic-count" class="hero-vic-value">${defaultVic}</span>
          <button class="recovery-adj" id="end-vic-plus">+</button>
        </div>
      </div>

      <button class="btn btn-primary" id="end-enc-confirm-btn" style="width:100%;margin-top:8px">
        Confirm &amp; Award
      </button>
    </div>
  `);

  let vicCount = defaultVic;
  const vicEl = () => document.getElementById('end-vic-count');

  document.querySelectorAll('.outcome-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.outcome-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      opt.querySelector('input[type="radio"]').checked = true;
      vicCount = parseInt(opt.dataset.vic, 10);
      const el = vicEl(); if (el) el.textContent = vicCount;
    });
  });

  document.getElementById('end-vic-minus')?.addEventListener('click', () => {
    if (vicCount > 0) { vicCount--; const el = vicEl(); if (el) el.textContent = vicCount; }
  });
  document.getElementById('end-vic-plus')?.addEventListener('click', () => {
    vicCount++;
    const el = vicEl(); if (el) el.textContent = vicCount;
  });

  document.getElementById('end-enc-confirm-btn')?.addEventListener('click', () =>
    performEndEncounter(campaign, enc, sessionCode, vicCount)
  );
}

async function performEndEncounter(campaign, enc, sessionCode, vicCount) {
  const btn = document.getElementById('end-enc-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    // Award victories to all campaign heroes
    const updatedHeroes = (campaign?.heroes || []).map(h => ({
      ...h,
      currentVictories: (h.currentVictories || 0) + vicCount,
    }));
    if (campaign) {
      await db.collection('campaigns').doc(campaign.id).update({ heroes: updatedHeroes });
      campaign.heroes = updatedHeroes;
    }

    // Mark encounter complete
    if (enc && campaign) {
      await db.collection('campaigns').doc(campaign.id)
        .collection('encounters').doc(enc.id)
        .update({
          status:           'complete',
          victoriesAwarded: vicCount,
          completedAt:      firebase.firestore.FieldValue.serverTimestamp(),
        });
      enc.status = 'complete';
      enc.victoriesAwarded = vicCount;
    }

    // Deactivate session
    if (sessionCode) {
      await db.collection('sessions').doc(sessionCode).update({ active: false });
    }

    // Check level-up eligibility (XP mode)
    const levelUpNames = [];
    if (campaign?.advancementMode === 'xp') {
      for (const h of updatedHeroes) {
        const projXP   = (h.xp || 0) + (h.currentVictories || 0);
        const projLvl  = (typeof xpToLevel === 'function') ? xpToLevel(projXP) : h.level;
        if (projLvl > (h.level || 1)) levelUpNames.push(h.displayName);
      }
    }

    hideModal();
    if (typeof leaveSession === 'function') leaveSession();
    showScreen(SCREENS.CAMPAIGN);
    if (typeof renderCampaignScreen === 'function') renderCampaignScreen();

    showToast(`Encounter complete — +${vicCount} victories awarded!`, 'success');
    if (levelUpNames.length) showToast(`Level Up Available: ${levelUpNames.join(', ')}`, 'success');
    const needsRespite = updatedHeroes.some(h => (h.currentVictories || 0) >= 6);
    if (needsRespite) showToast('Party may want to consider a Respite soon.', 'info');

  } catch (e) {
    console.error('performEndEncounter:', e);
    showToast('Could not save outcome.', 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Award'; }
  }
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.checkDirectorMode       = checkDirectorMode;
window.openCampaignScreen      = openCampaignScreen;
window.showEndEncounterModal   = showEndEncounterModal;
window.startEncounterFromCampaign = startEncounterFromCampaign;
