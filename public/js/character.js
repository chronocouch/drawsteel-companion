/**
 * character.js — Character list, sheet display, and creation wizard
 *
 * Phase 1: Character list + empty character shell
 * Phase 2: Full 10-step wizard
 */

// ── Class accent colors ──────────────────────────────────────────────────────
const CLASS_COLORS = {
  'Conduit':      { accent: '#D4AC0D', resource: 'Piety' },
  'Elementalist': { accent: '#E67E22', resource: 'Essence' },
  'Fury':         { accent: '#C0392B', resource: 'Rage' },
  'Null':         { accent: '#717D7E', resource: 'Discipline' },
  'Shadow':       { accent: '#6C3483', resource: 'Insight' },
  'Tactician':    { accent: '#2980B9', resource: 'Focus' },
  'Talent':       { accent: '#9B59B6', resource: 'Clarity' },
};

// ── Load character list ──────────────────────────────────────────────────────

async function loadCharacterList(userId) {
  const list = document.getElementById('character-list');
  list.innerHTML = '<p class="loading-text">Loading heroes...</p>';

  try {
    const snapshot = await db
      .collection('users').doc(userId)
      .collection('characters')
      .orderBy('createdAt', 'desc')
      .get();

    if (snapshot.empty) {
      list.innerHTML = `
        <div class="empty-state">
          <p>No heroes yet.</p>
          <p>Tap <strong>+ New Hero</strong> to create your first character.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    snapshot.forEach(doc => {
      const char = { id: doc.id, ...doc.data() };
      list.appendChild(buildCharacterCard(char));
    });
  } catch (e) {
    console.error('Error loading characters:', e);
    list.innerHTML = '<p class="error-text">Error loading heroes. Check your connection.</p>';
  }
}

function buildCharacterCard(char) {
  const meta = CLASS_COLORS[char.class] || { accent: '#444', resource: 'Resource' };
  const card = document.createElement('div');
  card.className = 'character-card';
  card.style.setProperty('--class-color', meta.accent);
  card.innerHTML = `
    <div class="char-card-accent"></div>
    <div class="char-card-body">
      <div class="char-card-name">${char.name || 'Unnamed Hero'}</div>
      <div class="char-card-class">${char.class || 'Class not set'} · ${char.ancestry || ''}</div>
      <div class="char-card-hp">
        <span class="char-hp">${char.currentHP ?? '?'}/${char.maxHP ?? '?'} HP</span>
        <span class="char-resource" style="color:${meta.accent}">
          ${char.heroicResource?.current ?? 0} ${meta.resource}
        </span>
      </div>
      ${char.wizardStep < 10 ? `<span class="char-card-incomplete">In progress — step ${char.wizardStep}/10</span>` : ''}
    </div>
  `;
  card.addEventListener('click', () => openCharacterSheet(char));
  return card;
}

// ── Open character sheet ─────────────────────────────────────────────────────

function openCharacterSheet(char) {
  AppState.currentCharacter = char;
  const meta = CLASS_COLORS[char.class] || { accent: '#2980B9', resource: 'Resource' };

  // Set class accent color on root
  document.documentElement.style.setProperty('--class-accent', meta.accent);

  // Populate header
  document.getElementById('sheet-char-name').textContent = char.name || 'Unnamed Hero';
  document.getElementById('sheet-char-class').textContent = char.class || '';
  const currentHP = char.currentHP ?? 0;
  const maxHP     = char.maxHP ?? 0;
  document.getElementById('hp-current').textContent = currentHP;
  document.getElementById('hp-max').textContent = maxHP;

  // Apply HP danger state on open
  const hpDisp = document.getElementById('hp-display');
  if (hpDisp) {
    const pct = maxHP > 0 ? currentHP / maxHP : 1;
    hpDisp.classList.toggle('hp-danger',  pct <= 0.25 && currentHP > 0);
    hpDisp.classList.toggle('hp-warning', pct > 0.25 && pct <= 0.5);
    hpDisp.classList.toggle('hp-dead',    currentHP <= 0);
  }
  document.getElementById('resource-current').textContent = char.heroicResource?.current ?? 0;
  document.getElementById('resource-name').textContent = meta.resource;

  // Load ability cards
  loadAbilityCards(char);

  // Populate stats, details, and recovery
  populateStatsTab(char);
  populateDetailsTab(char);
  updateRecoveryDisplay(char);

  showScreen(SCREENS.CHARACTER_SHEET);
}

// ── Details tab ──────────────────────────────────────────────────────────────

function populateDetailsTab(char) {
  const container = document.getElementById('character-details');
  if (!container) return;

  const rows = [
    ['Ancestry',     char.ancestry     || '—'],
    ['Culture',      char.culture      || '—'],
    ['Career',       char.career       || '—'],
    ['Kit',          char.kit          || '—'],
    ['Complication', char.complication || '—'],
  ];

  // Auto-derived conditions from HP
  const maxHP    = char.maxHP ?? 0;
  const currHP   = char.currentHP ?? 0;
  const isWinded = maxHP > 0 && currHP <= Math.floor(maxHP / 2) && currHP > 0;
  const isDying  = currHP <= 0;

  const active = char.conditions ?? [];

  container.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Background</div>
      ${rows.map(([label, val]) => `
        <div class="detail-row">
          <span class="detail-label">${label}</span>
          <span class="detail-val">${val}</span>
        </div>
      `).join('')}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Conditions
        <span class="conditions-hint">tap to toggle</span>
      </div>
      <div class="conditions-grid" id="conditions-grid">
        ${STANDARD_CONDITIONS.map(c => `
          <button class="condition-chip ${active.includes(c) ? 'active' : ''}"
                  data-condition="${c}">${c}</button>
        `).join('')}
      </div>
      <div class="auto-conditions">
        <span class="condition-chip auto-chip ${isWinded ? 'winded-active' : ''}">Winded</span>
        <span class="condition-chip auto-chip ${isDying ? 'dying-active' : ''}">Dying</span>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Combat Stats</div>
      <div class="detail-row">
        <span class="detail-label">Recovery Value</span>
        <span class="detail-val">${Math.floor(maxHP / 3)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Winded at</span>
        <span class="detail-val">${Math.floor(maxHP / 2)} or below</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Max Stamina</span>
        <span class="detail-val">${maxHP}</span>
      </div>
    </div>
  `;

  // Wire condition toggles
  container.querySelectorAll('.condition-chip[data-condition]').forEach(btn => {
    btn.addEventListener('click', () => toggleCondition(btn.dataset.condition));
  });
}

// ── Condition management ──────────────────────────────────────────────────────

async function toggleCondition(name) {
  const char = AppState.currentCharacter;
  if (!char) return;

  const conditions = [...(char.conditions ?? [])];
  const idx = conditions.indexOf(name);
  if (idx >= 0) {
    conditions.splice(idx, 1);
  } else {
    conditions.push(name);
  }

  char.conditions = conditions;

  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id)
    .update({ conditions });

  if (AppState.currentSession) {
    updateHeroInSession({ conditions });
  }

  // Re-render conditions section only
  populateDetailsTab(char);
}

// ── Recovery + Catch Your Breath ─────────────────────────────────────────────

function updateRecoveryDisplay(char) {
  const c = char ?? AppState.currentCharacter;
  if (!c) return;

  const current = c.recoveries?.current ?? CLASS_RECOVERIES[c.class] ?? 8;
  const max     = c.recoveries?.max     ?? CLASS_RECOVERIES[c.class] ?? 8;
  const recVal  = Math.floor((c.maxHP ?? 0) / 3);

  const elCurr = document.getElementById('recovery-current');
  const elMax  = document.getElementById('recovery-max');
  const elPrev = document.getElementById('cyb-preview');
  const btn    = document.getElementById('catch-breath-btn');

  if (elCurr) elCurr.textContent = current;
  if (elMax)  elMax.textContent  = max;
  if (elPrev) elPrev.textContent = recVal > 0 ? `(+${recVal})` : '';

  // Disable CYB when out of recoveries or dying
  const isDying = (c.currentHP ?? 0) <= 0;
  if (btn) {
    btn.disabled = current === 0 || isDying;
    btn.title = isDying
      ? 'Cannot Catch Your Breath while Dying.'
      : current === 0
        ? 'No recoveries remaining.'
        : `Spend a recovery to regain ${recVal} Stamina.`;
  }
}

async function catchYourBreath() {
  const char = AppState.currentCharacter;
  if (!char) return;

  const isDying = (char.currentHP ?? 0) <= 0;
  if (isDying) {
    showToast('Cannot Catch Your Breath while Dying.', 'danger');
    return;
  }

  const current = char.recoveries?.current ?? CLASS_RECOVERIES[char.class] ?? 8;
  const max     = char.recoveries?.max     ?? CLASS_RECOVERIES[char.class] ?? 8;
  if (current <= 0) {
    showToast('No recoveries remaining.', 'danger');
    return;
  }

  const recVal  = Math.floor((char.maxHP ?? 0) / 3);
  const newRec  = current - 1;

  char.recoveries = { current: newRec, max };
  updateRecoveryDisplay(char);

  await adjustHP(recVal);

  showToast(`Caught your breath — regained ${recVal} Stamina. (${newRec}/${max} recoveries left)`, 'success');

  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id)
    .update({ recoveries: char.recoveries });

  if (AppState.currentSession) {
    updateHeroInSession({ recoveries: char.recoveries });
  }

  // Refresh Details tab Winded/Dying status
  populateDetailsTab(char);
}

async function adjustRecoveries(delta) {
  const char = AppState.currentCharacter;
  if (!char) return;

  const max     = char.recoveries?.max ?? CLASS_RECOVERIES[char.class] ?? 8;
  const current = char.recoveries?.current ?? max;
  const newVal  = Math.max(0, Math.min(max, current + delta));

  char.recoveries = { current: newVal, max };
  updateRecoveryDisplay(char);

  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id)
    .update({ recoveries: char.recoveries });
}

// ── HP adjustment ─────────────────────────────────────────────────────────────

document.getElementById('hp-display').addEventListener('click', () => {
  showHPModal();
});

function showHPModal() {
  const char = AppState.currentCharacter;
  if (!char) return;

  showModal(`
    <div class="hp-modal">
      <h2>Adjust Stamina</h2>
      <div class="hp-modal-current">
        <span class="hp-modal-value">${char.currentHP ?? 0}</span>
        <span class="hp-modal-sep">/</span>
        <span class="hp-modal-max">${char.maxHP ?? 0}</span>
        <span class="hp-modal-label">HP</span>
      </div>
      <div class="hp-modal-controls">
        <input type="number" id="hp-delta-input" class="hp-delta-input"
          placeholder="Amount" min="1" inputmode="numeric" />
      </div>
      <div class="hp-modal-buttons">
        <button class="btn btn-danger" id="hp-damage-btn">Damage</button>
        <button class="btn btn-heal" id="hp-heal-btn">Heal</button>
      </div>
      <button class="btn btn-ghost hp-modal-set-btn" id="hp-set-btn">Set exact value</button>
    </div>
  `);

  setTimeout(() => document.getElementById('hp-delta-input')?.focus(), 100);

  document.getElementById('hp-damage-btn').addEventListener('click', () => {
    const val = parseInt(document.getElementById('hp-delta-input').value) || 0;
    if (val > 0) { adjustHP(-val); hideModal(); }
  });

  document.getElementById('hp-heal-btn').addEventListener('click', () => {
    const val = parseInt(document.getElementById('hp-delta-input').value) || 0;
    if (val > 0) { adjustHP(val); hideModal(); }
  });

  document.getElementById('hp-set-btn').addEventListener('click', () => {
    const exact = parseInt(document.getElementById('hp-delta-input').value);
    if (!isNaN(exact)) {
      const char = AppState.currentCharacter;
      adjustHP(exact - (char.currentHP ?? 0));
      hideModal();
    }
  });

  document.getElementById('hp-delta-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('hp-heal-btn').click();
  });
}

async function adjustHP(delta) {
  const char = AppState.currentCharacter;
  if (!char) return;

  const current = char.currentHP ?? char.maxHP ?? 0;
  const max = char.maxHP ?? 0;
  // No lower clamp — Stamina can go negative in Draw Steel (hero is dying)
  const newVal = Math.min(max, current + delta);

  char.currentHP = newVal;
  document.getElementById('hp-current').textContent = newVal;

  // Visual danger indicator when HP drops low
  const hpDisplay = document.getElementById('hp-display');
  if (hpDisplay) {
    const pct = max > 0 ? newVal / max : 1;
    hpDisplay.classList.toggle('hp-danger',  pct <= 0.25 && newVal > 0);
    hpDisplay.classList.toggle('hp-warning', pct > 0.25 && pct <= 0.5);
    hpDisplay.classList.toggle('hp-dead',    newVal <= 0);
  }

  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id)
    .update({ currentHP: newVal });

  if (AppState.currentSession) {
    updateHeroInSession({ currentHP: newVal });
  }

  // Refresh Winded/Dying indicators and CYB availability
  populateDetailsTab(char);
  updateRecoveryDisplay(char);
}

// ── Toast notifications ───────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  // Auto-remove
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Stats tab ────────────────────────────────────────────────────────────────

function populateStatsTab(char) {
  const meta  = CLASS_COLORS[char.class] || { accent: '#2980B9', resource: 'Resource' };
  const stats = char.characteristics || {};
  const recovery = Math.floor((char.maxHP ?? 0) / 3);

  // Class summary strip
  const summaryEl = document.getElementById('class-summary');
  if (summaryEl) {
    summaryEl.style.setProperty('--class-accent', meta.accent);
    summaryEl.innerHTML = `
      <div class="class-summary-name" style="color:${meta.accent}">${char.class || ''}</div>
      <div class="class-summary-desc">${CLASS_DESCRIPTIONS[char.class] || ''}</div>
      <div class="class-summary-stats">
        <span>${char.maxHP ?? 0} Stamina</span>
        <span>·</span>
        <span>${recovery} Recovery</span>
        <span>·</span>
        <span>${meta.resource} (max 10)</span>
      </div>
    `;
  }

  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-block">
      <div class="stat-value">${stats.MGT ?? 0}</div>
      <div class="stat-label">Might</div>
    </div>
    <div class="stat-block">
      <div class="stat-value">${stats.AGL ?? 0}</div>
      <div class="stat-label">Agility</div>
    </div>
    <div class="stat-block">
      <div class="stat-value">${stats.REA ?? 0}</div>
      <div class="stat-label">Reason</div>
    </div>
    <div class="stat-block">
      <div class="stat-value">${stats.INU ?? 0}</div>
      <div class="stat-label">Intuition</div>
    </div>
    <div class="stat-block">
      <div class="stat-value">${stats.PRS ?? 0}</div>
      <div class="stat-label">Presence</div>
    </div>
  `;
}

// ── New character button ─────────────────────────────────────────────────────

document.getElementById('new-character-btn').addEventListener('click', () => {
  startWizard();
});

// ── Resource controls ────────────────────────────────────────────────────────

document.getElementById('resource-minus').addEventListener('click', () => {
  adjustResource(-1);
});
document.getElementById('resource-plus').addEventListener('click', () => {
  adjustResource(1);
});

async function adjustResource(delta) {
  const char = AppState.currentCharacter;
  if (!char) return;

  const current = char.heroicResource?.current ?? 0;
  const max = char.heroicResource?.max ?? 10;
  const newVal = Math.max(0, Math.min(max, current + delta));

  char.heroicResource = { ...char.heroicResource, current: newVal };
  document.getElementById('resource-current').textContent = newVal;

  // Update Firestore
  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id)
    .update({ 'heroicResource.current': newVal });

  // If in session, update session state too
  if (AppState.currentSession) {
    updateHeroInSession({ heroicResource: char.heroicResource });
  }

  // Refresh card affordability display
  updateCardAffordability(newVal);
}

// ── Wizard data ──────────────────────────────────────────────────────────────

const ANCESTRIES = [
  { name: 'Devil',         desc: 'Born of infernal lineage, devils carry innate magic and an unsettling charisma.' },
  { name: 'Dragon Knight', desc: 'Warriors merged with draconic power through an ancient ritual of bonding.' },
  { name: 'Dwarf',         desc: 'Ancient and resilient, shaped by stone and forge. Endurance personified.' },
  { name: 'Hakaan',        desc: 'The great giants of the world — raw power and unshakeable resolve.' },
  { name: 'High Elf',      desc: 'Ancient and graceful, attuned to magic and the weight of long memory.' },
  { name: 'Human',         desc: 'Adaptable and driven — defined by ambition and the will to shape the world.' },
  { name: 'Memonek',       desc: 'Constructed beings of living memory. They blur the line between flesh and thought.' },
  { name: 'Orc',           desc: 'Fierce and vital, warriors shaped by a world that demands constant strength.' },
  { name: 'Polder',        desc: 'Small in stature but boundless in cunning — polders thrive by wit and speed.' },
  { name: 'Revenant',      desc: 'The walking dead with unfinished purpose, clinging to existence by sheer will.' },
  { name: 'Time Raider',   desc: 'Displaced by chrono-warfare, unstuck from their own era and era\'s rules.' },
  { name: 'Wode Elf',      desc: 'Wilder kin of the high elves — hunters and wanderers of the deep forest.' },
];

const KITS = [
  { name: 'Cloak and Dagger', role: 'Skirmisher', desc: 'Light armor · Short blades' },
  { name: 'Dancer',           role: 'Striker',    desc: 'No armor · Unarmed · Acrobatic' },
  { name: 'Dual Wielder',     role: 'Striker',    desc: 'No armor · Two weapons' },
  { name: 'Guisarmier',       role: 'Controller', desc: 'Medium armor · Polearms' },
  { name: 'Mountain',         role: 'Defender',   desc: 'Heavy armor · Two-handed' },
  { name: 'Panther',          role: 'Skirmisher', desc: 'Light armor · Light weapons' },
  { name: 'Pugilist',         role: 'Brawler',    desc: 'No armor · Unarmed' },
  { name: 'Raider',           role: 'Warrior',    desc: 'Medium armor · Versatile' },
  { name: 'Rapid Fire',       role: 'Ranged',     desc: 'No armor · Bows' },
  { name: 'Ranger',           role: 'Ranged',     desc: 'Medium armor · Bow and blade' },
  { name: 'Retiarius',        role: 'Controller', desc: 'Light armor · Net and trident' },
  { name: 'Shining Armor',    role: 'Defender',   desc: 'Heavy armor · Shield' },
  { name: 'Sniper',           role: 'Ranged',     desc: 'No armor · Crossbow · Long range' },
  { name: 'Spellsword',       role: 'Hybrid',     desc: 'Light armor · Weapon and magic' },
  { name: 'Stormwight',       role: 'Striker',    desc: 'Medium armor · Natural weapons' },
  { name: 'Swashbuckler',     role: 'Skirmisher', desc: 'Light armor · Light blade' },
  { name: 'Warrior Priest',   role: 'Support',    desc: 'Medium armor · Divine weapons' },
];

const KIT_STAMINA = {
  'Cloak and Dagger': 3,  'Dancer': 3,        'Dual Wielder': 3,
  'Guisarmier': 6,        'Mountain': 9,       'Panther': 3,
  'Pugilist': 3,          'Raider': 6,         'Rapid Fire': 3,
  'Ranger': 6,            'Retiarius': 3,      'Shining Armor': 9,
  'Sniper': 3,            'Spellsword': 3,     'Stormwight': 6,
  'Swashbuckler': 3,      'Warrior Priest': 6,
};

const CULTURES = [
  { name: 'Cosmopolitan', desc: 'Urban and multicultural' },
  { name: 'Nomadic',      desc: 'Life on the road' },
  { name: 'Secluded',     desc: 'Isolated traditional community' },
  { name: 'Rural',        desc: 'Small town or farming village' },
  { name: 'Seafaring',    desc: 'Maritime and trade-focused' },
  { name: 'Underground',  desc: 'Subterranean craftspeople' },
];

const CAREERS = [
  'Academic', 'Artisan', 'Criminal', 'Entertainer', 'Farmer',
  'Gladiator', 'Knight', 'Laborer', 'Merchant', 'Priest',
  'Sage', 'Sailor', 'Soldier', 'Spy', 'Thief',
];

const COMPLICATIONS = [
  { name: 'None',                     desc: 'No complication — clean slate' },
  { name: 'Cursed Item',              desc: 'Bound to a dangerous object' },
  { name: 'Destiny',                  desc: 'Fated for something great or terrible' },
  { name: 'Escaped Experiment',       desc: "You were someone's test subject" },
  { name: 'Monster Beneath the Skin', desc: 'Something dangerous lurks within' },
  { name: 'Oath',                     desc: 'Bound by an unbreakable vow' },
  { name: 'On the Run',               desc: 'Fleeing something from your past' },
  { name: 'Order Member',             desc: 'Part of a secret organization' },
  { name: 'Stalker',                  desc: 'Someone or something pursues you' },
];

// Max recoveries per class (refill on Respite — 24hr rest)
const CLASS_RECOVERIES = {
  Conduit: 8, Elementalist: 8, Fury: 10,
  Null: 8, Shadow: 8, Tactician: 8, Talent: 8,
};

// Standard toggleable conditions
const STANDARD_CONDITIONS = [
  'Bleeding', 'Dazed', 'Frightened', 'Grabbed',
  'Prone', 'Slowed', 'Taunted', 'Weakened',
];

const CLASS_DESCRIPTIONS = {
  Fury:         'A berserker who harnesses Rage through violence. More damage dealt means more power unleashed.',
  Tactician:    'A battlefield commander who uses Focus to grant allies extra actions and dominate the flow of combat.',
  Shadow:       'A deadly operative who builds Insight through deception and precision. Every secret is a weapon.',
  Conduit:      'A divine channel who accumulates Piety to heal allies and smite foes with radiant holy power.',
  Elementalist: 'A wielder of primal forces who converts Essence to unleash devastating fire, ice, and lightning.',
  Null:         'An anti-psion who accumulates Discipline to resist and redirect supernatural forces against enemies.',
  Talent:       'A telekinetic who builds Clarity through focus, moving objects and enemies with pure mental force.',
};

const CLASS_BASE_STAMINA = {
  Conduit: 18, Elementalist: 18, Fury: 24,
  Null: 21, Shadow: 18, Tactician: 21, Talent: 18,
};

// Suggested characteristic spread per class (each sums to 5, max 2 per stat)
const CLASS_CHARACTERISTICS = {
  Fury:         { MGT: 2, AGL: 2, REA: 0, INU: 1, PRS: 0 },
  Tactician:    { MGT: 2, AGL: 0, REA: 2, INU: 1, PRS: 0 },
  Shadow:       { MGT: 0, AGL: 2, REA: 1, INU: 2, PRS: 0 },
  Conduit:      { MGT: 0, AGL: 0, REA: 1, INU: 2, PRS: 2 },
  Elementalist: { MGT: 0, AGL: 0, REA: 2, INU: 2, PRS: 1 },
  Null:         { MGT: 2, AGL: 2, REA: 0, INU: 0, PRS: 1 },
  Talent:       { MGT: 0, AGL: 1, REA: 2, INU: 0, PRS: 2 },
};

const CHAR_STATS  = ['MGT', 'AGL', 'REA', 'INU', 'PRS'];
const CHAR_LABELS = {
  MGT: 'Might', AGL: 'Agility', REA: 'Reason', INU: 'Intuition', PRS: 'Presence',
};
const CHAR_BUDGET = 5;

// ── Wizard step config ────────────────────────────────────────────────────────

const WIZARD_TOTAL_STEPS = 10;

const WIZARD_CONFIG = [
  { title: 'Name Your Hero',        sub: 'What do they call you?' },
  { title: 'Choose Your Ancestry',  sub: 'Where does your lineage lie?' },
  { title: 'Choose Your Culture',   sub: 'How were you raised?' },
  { title: 'Choose Your Career',    sub: 'What did you do before this life?' },
  { title: 'Choose Your Class',     sub: 'Your calling on the battlefield.' },
  { title: 'Choose Your Kit',       sub: 'How do you fight?' },
  { title: 'Choose a Complication', sub: "What complicates your hero's story?" },
  { title: 'Set Characteristics',   sub: 'Distribute your characteristic points.' },
  { title: 'Stamina & Resources',   sub: 'Your combat stats at a glance.' },
  { title: 'Review Your Hero',      sub: 'Everything look good? Create your hero.' },
];

// ── Wizard init ───────────────────────────────────────────────────────────────

function startWizard() {
  AppState.pendingCharacter = {
    name: '', ancestry: '', culture: '', career: '',
    class: null, kit: null, complication: 'None',
    characteristics: { MGT: 0, AGL: 0, REA: 0, INU: 0, PRS: 0 },
    _step: 1, _charsReady: false,
  };
  showScreen(SCREENS.WIZARD);
  renderWizardStep(1);
}

// ── Step renderer ─────────────────────────────────────────────────────────────

function renderWizardStep(step) {
  AppState.pendingCharacter._step = step;

  const cfg     = WIZARD_CONFIG[step - 1];
  const fill    = document.getElementById('wizard-progress-fill');
  const label   = document.getElementById('wizard-progress-label');
  const prevBtn = document.getElementById('wizard-prev-btn');
  const nextBtn = document.getElementById('wizard-next-btn');

  fill.style.width = `${(step / WIZARD_TOTAL_STEPS) * 100}%`;
  label.textContent = `Step ${step} of ${WIZARD_TOTAL_STEPS}`;
  prevBtn.style.visibility = step === 1 ? 'hidden' : 'visible';
  nextBtn.textContent = step === WIZARD_TOTAL_STEPS ? 'Create Hero' : 'Continue';
  nextBtn.disabled = false;

  document.getElementById('wizard-content').innerHTML = `
    <div class="wizard-step">
      <h2 class="wizard-step-title">${cfg.title}</h2>
      <p class="wizard-step-sub" id="wizard-step-sub">${cfg.sub}</p>
      <div id="wizard-step-body"></div>
    </div>
  `;

  const body = document.getElementById('wizard-step-body');
  [, _step1, _step2, _step3, _step4, _step5, _step6, _step7, _step8, _step9, _step10][step](body);
}

function _flashError(msg) {
  const el = document.getElementById('wizard-step-sub');
  if (el) { el.textContent = msg; el.style.color = 'var(--color-danger)'; }
}

// ── Step 1: Name ──────────────────────────────────────────────────────────────

function _step1(body) {
  body.innerHTML = `
    <input type="text" id="wizard-name-input" class="wizard-text-input"
      placeholder="Hero's name..." maxlength="40" autocomplete="off"
      value="${AppState.pendingCharacter.name || ''}" />
  `;
  setTimeout(() => document.getElementById('wizard-name-input')?.focus(), 60);
}

// ── Step 2: Ancestry ──────────────────────────────────────────────────────────

function _step2(body) {
  const sel = AppState.pendingCharacter.ancestry;
  body.innerHTML = `
    <div class="wizard-grid wizard-grid-2">
      ${ANCESTRIES.map(a => `
        <button class="wizard-pick-btn ${sel === a.name ? 'selected' : ''}" data-pick="${a.name}">
          <span class="pick-name">${a.name}</span>
          <span class="pick-desc">${a.desc}</span>
        </button>
      `).join('')}
    </div>
  `;
  _wirePicker(body, 'ancestry');
}

// ── Step 3: Culture ───────────────────────────────────────────────────────────

function _step3(body) {
  const sel = AppState.pendingCharacter.culture;
  body.innerHTML = `
    <div class="wizard-grid wizard-grid-2">
      ${CULTURES.map(c => `
        <button class="wizard-pick-btn ${sel === c.name ? 'selected' : ''}" data-pick="${c.name}">
          <span class="pick-name">${c.name}</span>
          <span class="pick-desc">${c.desc}</span>
        </button>
      `).join('')}
    </div>
  `;
  _wirePicker(body, 'culture');
}

// ── Step 4: Career ────────────────────────────────────────────────────────────

function _step4(body) {
  const sel = AppState.pendingCharacter.career;
  body.innerHTML = `
    <div class="wizard-grid wizard-grid-3">
      ${CAREERS.map(name => `
        <button class="wizard-pick-btn ${sel === name ? 'selected' : ''}" data-pick="${name}">
          <span class="pick-name">${name}</span>
        </button>
      `).join('')}
    </div>
  `;
  _wirePicker(body, 'career');
}

// ── Step 5: Class ─────────────────────────────────────────────────────────────

function _step5(body) {
  const sel = AppState.pendingCharacter.class;
  body.innerHTML = `
    <div class="wizard-grid wizard-grid-2">
      ${Object.entries(CLASS_COLORS).map(([cls, meta]) => `
        <button class="wizard-pick-btn ${sel === cls ? 'selected' : ''}"
                style="--pick-color: ${meta.accent}" data-pick="${cls}">
          <span class="pick-name">${cls}</span>
          <span class="pick-sub">${meta.resource}</span>
          <span class="pick-desc">${CLASS_DESCRIPTIONS[cls] || ''}</span>
        </button>
      `).join('')}
    </div>
  `;
  _wirePicker(body, 'class', () => {
    // Reset chars when class changes so step 8 reloads defaults
    AppState.pendingCharacter._charsReady = false;
  });
}

// ── Step 6: Kit ───────────────────────────────────────────────────────────────

function _step6(body) {
  const sel = AppState.pendingCharacter.kit;
  body.innerHTML = `
    <div class="wizard-grid wizard-grid-2">
      ${KITS.map(k => `
        <button class="wizard-pick-btn ${sel === k.name ? 'selected' : ''}" data-pick="${k.name}">
          <span class="pick-name">${k.name}</span>
          <span class="pick-sub">${k.role}</span>
          <span class="pick-desc">${k.desc}</span>
        </button>
      `).join('')}
    </div>
  `;
  _wirePicker(body, 'kit');
}

// ── Step 7: Complication ──────────────────────────────────────────────────────

function _step7(body) {
  const sel = AppState.pendingCharacter.complication || 'None';
  body.innerHTML = `
    <div class="wizard-list">
      ${COMPLICATIONS.map(c => `
        <button class="wizard-pick-btn wizard-pick-row ${sel === c.name ? 'selected' : ''}"
                data-pick="${c.name}">
          <span class="pick-name">${c.name}</span>
          <span class="pick-desc">${c.desc}</span>
        </button>
      `).join('')}
    </div>
  `;
  _wirePicker(body, 'complication');
}

// ── Step 8: Characteristics ───────────────────────────────────────────────────

function _step8(body) {
  const p = AppState.pendingCharacter;

  // Load class defaults on first visit (or after class change)
  if (!p._charsReady) {
    p.characteristics = { ...(CLASS_CHARACTERISTICS[p.class] || { MGT:0,AGL:0,REA:0,INU:0,PRS:0 }) };
    p._charsReady = true;
  }

  const spent = Object.values(p.characteristics).reduce((a, b) => a + b, 0);

  body.innerHTML = `
    <div class="char-adjuster">
      <div class="char-budget">
        <span class="char-budget-label">Points remaining</span>
        <span class="char-budget-count" id="char-remaining">${CHAR_BUDGET - spent}</span>
      </div>
      ${CHAR_STATS.map(stat => `
        <div class="char-row">
          <span class="char-label">${CHAR_LABELS[stat]}</span>
          <div class="char-controls">
            <button class="char-btn char-btn-minus" data-stat="${stat}">−</button>
            <span class="char-value" id="char-${stat}">${p.characteristics[stat] ?? 0}</span>
            <button class="char-btn char-btn-plus" data-stat="${stat}">+</button>
          </div>
        </div>
      `).join('')}
    </div>
    <p class="wizard-hint">Pre-filled with your class's suggested spread. Redistribute freely.</p>
  `;

  body.querySelectorAll('.char-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stat     = btn.dataset.stat;
      const valEl    = document.getElementById(`char-${stat}`);
      const remEl    = document.getElementById('char-remaining');
      const curr     = parseInt(valEl.textContent) || 0;
      const rem      = parseInt(remEl.textContent) || 0;
      const delta    = btn.classList.contains('char-btn-plus') ? 1 : -1;
      const newVal   = curr + delta;

      if (newVal < 0 || newVal > 3) return;
      if (delta > 0 && rem <= 0) return;

      valEl.textContent = newVal;
      remEl.textContent = rem - delta;
      p.characteristics[stat] = newVal;
    });
  });
}

// ── Step 9: Stamina ───────────────────────────────────────────────────────────

function _step9(body) {
  const p         = AppState.pendingCharacter;
  const meta      = CLASS_COLORS[p.class] || { accent: '#2980B9', resource: 'Resource' };
  const base      = CLASS_BASE_STAMINA[p.class] || 18;
  const kitBonus  = KIT_STAMINA[p.kit] || 0;
  const maxHP     = base + kitBonus;
  const recovery  = Math.floor(maxHP / 3);

  body.innerHTML = `
    <div class="stamina-display">
      <div class="stamina-stat">
        <div class="stamina-value">${maxHP}</div>
        <div class="stamina-label">Stamina</div>
        <div class="stamina-breakdown">${base} class + ${kitBonus} kit</div>
      </div>
      <div class="stamina-stat">
        <div class="stamina-value">${recovery}</div>
        <div class="stamina-label">Recovery Value</div>
        <div class="stamina-breakdown">Stamina ÷ 3</div>
      </div>
      <div class="stamina-stat" style="color: ${meta.accent}">
        <div class="stamina-value">10</div>
        <div class="stamina-label">${meta.resource}</div>
        <div class="stamina-breakdown">Starting max</div>
      </div>
    </div>
  `;
}

// ── Step 10: Review ───────────────────────────────────────────────────────────

function _step10(body) {
  const p         = AppState.pendingCharacter;
  const meta      = CLASS_COLORS[p.class] || { accent: '#2980B9', resource: 'Resource' };
  const base      = CLASS_BASE_STAMINA[p.class] || 18;
  const kitBonus  = KIT_STAMINA[p.kit] || 0;
  const maxHP     = base + kitBonus;

  const rows = [
    ['Name',            p.name || '—'],
    ['Ancestry',        p.ancestry || '—'],
    ['Culture',         p.culture || '—'],
    ['Career',          p.career || '—'],
    ['Class',           p.class || '—'],
    ['Kit',             p.kit || '—'],
    ['Complication',    p.complication || '—'],
    ['Stamina',         `${maxHP}`],
    ['Characteristics', CHAR_STATS.map(s => `${s} +${p.characteristics?.[s] ?? 0}`).join('  ')],
  ];

  body.innerHTML = `
    <div class="review-card" style="border-top-color: ${meta.accent}">
      ${rows.map(([label, val]) => `
        <div class="review-row">
          <span class="review-label">${label}</span>
          <span class="review-val">${val}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Picker wiring helper ──────────────────────────────────────────────────────

function _wirePicker(container, field, onChange) {
  container.querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      AppState.pendingCharacter[field] = btn.dataset.pick;
      if (onChange) onChange(btn.dataset.pick);
    });
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────

function advanceWizard() {
  const p    = AppState.pendingCharacter;
  const step = p._step;

  if (step === 1) {
    const input = document.getElementById('wizard-name-input');
    const name  = input?.value.trim() || '';
    if (!name) { input?.classList.add('input-error'); input?.focus(); return; }
    p.name = name;
  } else if (step === 2 && !p.ancestry)  { _flashError('Pick an ancestry to continue.');  return; }
  else if   (step === 3 && !p.culture)   { _flashError('Pick a culture to continue.');    return; }
  else if   (step === 4 && !p.career)    { _flashError('Pick a career to continue.');     return; }
  else if   (step === 5 && !p.class)     { _flashError('Pick a class to continue.');      return; }
  else if   (step === 6 && !p.kit)       { _flashError('Pick a kit to continue.');        return; }
  // steps 7–9: always valid

  if (step === WIZARD_TOTAL_STEPS) {
    finishCharacterCreation();
  } else {
    renderWizardStep(step + 1);
  }
}

function retreatWizard() {
  const step = AppState.pendingCharacter?._step ?? 1;
  if (step <= 1) {
    showScreen(SCREENS.CHARACTER_SELECT);
    loadCharacterList(AppState.currentUser.uid);
  } else {
    renderWizardStep(step - 1);
  }
}

// ── Finish character creation ─────────────────────────────────────────────────

async function finishCharacterCreation() {
  const p    = AppState.pendingCharacter;
  const meta = CLASS_COLORS[p.class] || { accent: '#2980B9', resource: 'Resource' };
  const user = AppState.currentUser;

  const base     = CLASS_BASE_STAMINA[p.class] || 18;
  const kitBonus = KIT_STAMINA[p.kit] || 0;
  const maxHP    = base + kitBonus;

  const nextBtn = document.getElementById('wizard-next-btn');
  nextBtn.disabled = true;
  nextBtn.textContent = 'Creating...';

  const charData = {
    name:            p.name,
    ancestry:        p.ancestry || '',
    culture:         p.culture || '',
    career:          p.career || '',
    class:           p.class,
    kit:             p.kit || '',
    complication:    p.complication || 'None',
    characteristics: p.characteristics || { MGT:0, AGL:0, REA:0, INU:0, PRS:0 },
    maxHP,
    currentHP:        maxHP,
    heroicResource:   { name: meta.resource, current: 0, max: 10 },
    recoveries:       { current: CLASS_RECOVERIES[p.class] ?? 8, max: CLASS_RECOVERIES[p.class] ?? 8 },
    abilityIds:       [],
    conditions:       [],
    classAccentColor: meta.accent,
    wizardStep:       10,
    createdAt:        firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const ref = await db.collection('users').doc(user.uid)
      .collection('characters').add(charData);
    openCharacterSheet({ id: ref.id, ...charData });
  } catch (e) {
    console.error('Error creating character:', e);
    nextBtn.disabled = false;
    nextBtn.textContent = 'Create Hero';
  }
}

// ── Wizard nav button wiring ─────────────────────────────────────────────────

document.getElementById('wizard-next-btn').addEventListener('click', advanceWizard);
document.getElementById('wizard-prev-btn').addEventListener('click', retreatWizard);
document.getElementById('wizard-back-btn').addEventListener('click', retreatWizard);

// ── Recovery row button wiring ────────────────────────────────────────────────

document.getElementById('catch-breath-btn').addEventListener('click', catchYourBreath);
document.getElementById('recovery-minus').addEventListener('click', () => adjustRecoveries(-1));
document.getElementById('recovery-plus').addEventListener('click',  () => adjustRecoveries(1));

// ── Expose globals ───────────────────────────────────────────────────────────
window.loadCharacterList = loadCharacterList;
window.openCharacterSheet = openCharacterSheet;
window.CLASS_COLORS = CLASS_COLORS;
window.showToast = showToast;
window.updateRecoveryDisplay = updateRecoveryDisplay;
window.toggleCondition = toggleCondition;
