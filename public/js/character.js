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
  const level     = char.level ?? 1;
  const victories = char.victories ?? 0;
  card.innerHTML = `
    <div class="char-card-accent"></div>
    <div class="char-card-body">
      <div class="char-card-name">${char.name || 'Unnamed Hero'}</div>
      <div class="char-card-class">${char.class || 'Class not set'} · ${char.ancestry || ''} · Lvl ${level}</div>
      <div class="char-card-hp">
        <span class="char-hp">${char.currentHP ?? '?'}/${char.maxHP ?? '?'} HP</span>
        <span class="char-resource" style="color:${meta.accent}">
          ${char.heroicResource?.current ?? 0} ${meta.resource}
        </span>
        ${victories > 0 ? `<span class="char-victories" style="color:${meta.accent}">· ${victories}V</span>` : ''}
      </div>
      ${char.wizardStep < 11 ? `<span class="char-card-incomplete">In progress — step ${char.wizardStep}/11</span>` : ''}
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
  document.getElementById('sheet-char-class').textContent = `${char.class || ''} · Level ${char.level ?? 1}`;
  const currentHP = char.currentHP ?? 0;
  const maxHP     = char.maxHP ?? 0;
  document.getElementById('hp-current').textContent = currentHP;
  document.getElementById('hp-max').textContent = maxHP;

  // Apply HP danger state and bar on open
  updateHPBar(currentHP, maxHP);
  document.getElementById('resource-current').textContent = char.heroicResource?.current ?? 0;
  document.getElementById('resource-name').textContent = meta.resource;

  // Load ability cards
  loadAbilityCards(char);

  // Populate stats, details, and recovery
  populateStatsTab(char);
  populateDetailsTab(char);
  updateRecoveryDisplay(char);

  // Victories counter
  const vicEl = document.getElementById('victory-count');
  if (vicEl) vicEl.textContent = char.victories ?? 0;

  showScreen(SCREENS.CHARACTER_SHEET);

  // Async: check if user has a resumable session and update the FAB
  if (AppState.currentUser && !AppState.currentSession) {
    checkForActiveSessions(AppState.currentUser.uid).then(found => {
      if (!found) return;
      const fab = document.getElementById('join-session-fab');
      if (!fab || fab.classList.contains('hidden')) return; // already in session

      const isDirector = found.role === 'director';
      const label = isDirector
        ? `Resume as Director (${found.code})`
        : `Resume Session (${found.code})`;

      fab.innerHTML = `
        <button id="resume-session-btn" class="btn btn-primary">${label}</button>
        <button id="clear-resume-btn" class="btn btn-ghost btn-small">New Session</button>
      `;

      document.getElementById('resume-session-btn')?.addEventListener('click', () => {
        resumeSession(found.code, isDirector);
      });
      document.getElementById('clear-resume-btn')?.addEventListener('click', () => {
        resetJoinSessionFab();
      });
    }).catch(e => console.error('Session check failed:', e));
  }
}

// ── Details tab ──────────────────────────────────────────────────────────────

function populateDetailsTab(char) {
  const container = document.getElementById('character-details');
  if (!container) return;

  const rows = [
    ['Ancestry',     char.ancestry     || '—'],
    ['Subclass',     char.subclass     || '—'],
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
      <div class="condition-descriptions">
        ${CONDITION_DESCRIPTIONS.map(({ name, effect }) => `
          <div class="cond-desc-row ${active.includes(name) ? 'cond-active' : ''}">
            <span class="cond-desc-name">${name}</span>
            <span class="cond-desc-effect">${effect}</span>
          </div>
        `).join('')}
        <div class="cond-desc-row ${isWinded ? 'cond-active' : ''}">
          <span class="cond-desc-name">Winded</span>
          <span class="cond-desc-effect">At or below half Stamina. You can still Catch Your Breath.</span>
        </div>
        <div class="cond-desc-row ${isDying ? 'cond-active' : ''}">
          <span class="cond-desc-name">Dying</span>
          <span class="cond-desc-effect">At 0 Stamina. Make a death roll at the start of each turn. Cannot Catch Your Breath.</span>
        </div>
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

    <div class="detail-section detail-section-danger">
      <div class="detail-section-title">Manage Hero</div>
      <div class="detail-danger-actions">
        <button class="btn btn-ghost btn-small" id="rename-btn">Rename</button>
        <button class="btn btn-danger btn-small" id="delete-char-btn">Delete Hero</button>
      </div>
    </div>
  `;

  // Wire condition toggles
  container.querySelectorAll('.condition-chip[data-condition]').forEach(btn => {
    btn.addEventListener('click', () => toggleCondition(btn.dataset.condition));
  });

  // Wire manage buttons
  document.getElementById('rename-btn')?.addEventListener('click', showRenameModal);
  document.getElementById('delete-char-btn')?.addEventListener('click', () => {
    const c = AppState.currentCharacter;
    showModal(`
      <div class="confirm-modal">
        <h2>Delete Hero?</h2>
        <p class="confirm-modal-body">This will permanently delete <strong>${c.name || 'this hero'}</strong>. This cannot be undone.</p>
        <div class="confirm-modal-actions">
          <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
          <button class="btn btn-danger" id="confirm-delete-btn">Delete Forever</button>
        </div>
      </div>
    `);
    document.getElementById('confirm-delete-btn').addEventListener('click', () => deleteCharacter(c.id));
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

// ── Delete / Rename ───────────────────────────────────────────────────────────

async function deleteCharacter(charId) {
  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(charId).delete();
  hideModal();
  AppState.currentCharacter = null;
  showScreen(SCREENS.CHARACTER_SELECT);
  loadCharacterList(AppState.currentUser.uid);
  showToast('Hero deleted.', 'info');
}

function showRenameModal() {
  const char = AppState.currentCharacter;
  showModal(`
    <div class="confirm-modal">
      <h2>Rename Hero</h2>
      <input type="text" id="rename-input" class="wizard-text-input"
        value="${char.name || ''}" maxlength="40" autocomplete="off" />
      <div class="confirm-modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" id="rename-confirm-btn">Save</button>
      </div>
    </div>
  `);
  setTimeout(() => {
    const el = document.getElementById('rename-input');
    el?.focus(); el?.select();
  }, 60);
  document.getElementById('rename-confirm-btn').addEventListener('click', async () => {
    const newName = document.getElementById('rename-input')?.value.trim();
    if (!newName) return;
    char.name = newName;
    document.getElementById('sheet-char-name').textContent = newName;
    hideModal();
    await db.collection('users').doc(AppState.currentUser.uid)
      .collection('characters').doc(char.id).update({ name: newName });
    showToast('Hero renamed.', 'success');
  });
}

// ── Victory tracking ──────────────────────────────────────────────────────────

async function adjustVictories(delta) {
  const char = AppState.currentCharacter;
  if (!char) return;
  const newVal = Math.max(0, (char.victories ?? 0) + delta);
  char.victories = newVal;
  const el = document.getElementById('victory-count');
  if (el) el.textContent = newVal;
  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id).update({ victories: newVal });
}

// ── Respite ───────────────────────────────────────────────────────────────────

function showRespiteModal() {
  const char      = AppState.currentCharacter;
  if (!char) return;
  const maxRec    = char.recoveries?.max ?? CLASS_RECOVERIES[char.class] ?? 8;
  const victories = char.victories ?? 0;
  const resMax    = char.heroicResource?.max ?? getHeroicResourceMax(char.level ?? 1);
  const startRes  = Math.min(victories, resMax);
  const resName   = char.heroicResource?.name ?? 'Resource';

  showModal(`
    <div class="confirm-modal">
      <h2>Take a Respite?</h2>
      <div class="respite-effects">
        <div class="respite-effect-row">
          <span class="respite-effect-label">Recoveries</span>
          <span class="respite-effect-val">Restored to ${maxRec}/${maxRec}</span>
        </div>
        <div class="respite-effect-row">
          <span class="respite-effect-label">Conditions</span>
          <span class="respite-effect-val">All cleared</span>
        </div>
        ${victories > 0 ? `
        <div class="respite-effect-row">
          <span class="respite-effect-label">${resName}</span>
          <span class="respite-effect-val">${startRes} to start next combat (${victories}V)</span>
        </div>` : ''}
      </div>
      <p class="respite-note">HP is not changed — healing during a respite is a story decision.</p>
      <div class="confirm-modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" id="respite-confirm-btn">Take Respite</button>
      </div>
    </div>
  `);
  document.getElementById('respite-confirm-btn').addEventListener('click', () => performRespite());
}

async function performRespite() {
  const char     = AppState.currentCharacter;
  if (!char) return;
  const maxRec   = char.recoveries?.max ?? CLASS_RECOVERIES[char.class] ?? 8;
  const victories = char.victories ?? 0;
  const resMax   = char.heroicResource?.max ?? getHeroicResourceMax(char.level ?? 1);
  const startRes = Math.min(victories, resMax);
  const resName  = char.heroicResource?.name ?? 'Resource';

  char.recoveries       = { ...char.recoveries, current: maxRec };
  char.conditions       = [];
  char.heroicResource   = { ...char.heroicResource, current: startRes };
  char.victories        = 0;

  // Clear once-per-encounter ability locks
  if (typeof cardState !== 'undefined') {
    cardState.usedOncePerEncounterAbilities = [];
  }

  updateRecoveryDisplay(char);
  const resEl = document.getElementById('resource-current');
  if (resEl) resEl.textContent = startRes;
  const vicEl = document.getElementById('victory-count');
  if (vicEl) vicEl.textContent = 0;
  populateDetailsTab(char);

  hideModal();

  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id).update({
      'recoveries.current':     maxRec,
      conditions:               [],
      'heroicResource.current': startRes,
      victories:                0,
    });

  if (AppState.currentSession) {
    updateHeroInSession({
      recoveries:                    char.recoveries,
      conditions:                    [],
      heroicResource:                char.heroicResource,
      usedOncePerEncounterAbilities: [],
    });
  }

  // Re-render ability cards so encounter locks are cleared
  loadAbilityCards(char);

  showToast(
    victories > 0
      ? `Respite taken — recoveries restored, ${victories}V → ${startRes} ${resName}.`
      : 'Respite taken — recoveries restored.',
    'success'
  );
}

// ── Level Up ──────────────────────────────────────────────────────────────────

function previewLevelUp(char, newLevel) {
  const baseChars = char.baseCharacteristics ?? char.characteristics ?? {};
  const oldHP     = char.maxHP ?? computeMaxHP(char.class, char.kit, char.level ?? 1);
  const newHP     = computeMaxHP(char.class, char.kit, newLevel);
  const oldChars  = char.characteristics ?? {};
  const newChars  = computeCharacteristicsForLevel(baseChars, newLevel);
  const oldResMax = getHeroicResourceMax(char.level ?? 1);
  const newResMax = getHeroicResourceMax(newLevel);
  return { oldHP, newHP, oldChars, newChars, oldResMax, newResMax };
}

function buildLevelUpModalHTML(char, currentLevel, newLevel, changes) {
  const meta    = CLASS_COLORS[char.class] || { accent: '#2980B9' };
  const hpDelta = changes.newHP - changes.oldHP;

  const charRows = ['MGT', 'AGL', 'REA', 'INU', 'PRS'].map(stat => {
    const was     = changes.oldChars[stat] ?? 0;
    const now     = changes.newChars[stat] ?? 0;
    const changed = now > was;
    return `
      <div class="levelup-stat-row ${changed ? 'levelup-stat-changed' : ''}">
        <span class="levelup-stat-label">${CHAR_LABELS[stat]}</span>
        <span class="levelup-stat-val">${was}${changed ? ` → ${now}` : ''}</span>
      </div>`;
  }).join('');

  const resChange = changes.newResMax > changes.oldResMax ? `
    <div class="levelup-change-row">
      <span class="levelup-change-label">Resource Max</span>
      <span class="levelup-change-val levelup-val-up">${changes.oldResMax} → ${changes.newResMax}</span>
    </div>` : '';

  return `
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color: ${meta.accent}">
        <span class="levelup-subtitle">LEVEL UP</span>
        <span class="levelup-number" style="color:${meta.accent}">${newLevel}</span>
      </div>
      <div class="levelup-changes">
        <div class="levelup-change-row">
          <span class="levelup-change-label">Stamina</span>
          <span class="levelup-change-val levelup-val-up">${changes.oldHP} → ${changes.newHP} (+${hpDelta})</span>
        </div>
        ${resChange}
      </div>
      <div class="levelup-chars">
        <div class="levelup-chars-title">Characteristics</div>
        ${charRows}
      </div>
      <div class="confirm-modal-actions">
        <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" id="levelup-confirm-btn">Reach Level ${newLevel}</button>
      </div>
    </div>
  `;
}

function showLevelUpModal() {
  const char = AppState.currentCharacter;
  if (!char) return;
  const current = char.level ?? 1;
  if (current >= 10) { showToast('Your hero has reached the maximum level.', 'info'); return; }
  const newLevel = current + 1;
  const changes  = previewLevelUp(char, newLevel);
  showModal(buildLevelUpModalHTML(char, current, newLevel, changes));
  document.getElementById('levelup-confirm-btn').addEventListener('click', () => performLevelUp(char, newLevel, changes));
}

async function performLevelUp(char, newLevel, changes) {
  const hpIncrease   = changes.newHP - (char.maxHP ?? 0);
  const newCurrentHP = Math.min(changes.newHP, (char.currentHP ?? 0) + hpIncrease);
  const newResMax    = changes.newResMax;

  char.level           = newLevel;
  char.maxHP           = changes.newHP;
  char.currentHP       = newCurrentHP;
  char.characteristics = changes.newChars;
  char.heroicResource  = { ...char.heroicResource, max: newResMax };

  // Recalculate resistances (Wyrmplate immunity = new level)
  const updatedResistances = computeDamageResistances(char);
  char.damageImmunities = updatedResistances.damageImmunities;
  char.damageWeaknesses = updatedResistances.damageWeaknesses;

  // Update header
  document.getElementById('hp-current').textContent = newCurrentHP;
  document.getElementById('hp-max').textContent = changes.newHP;
  document.getElementById('sheet-char-class').textContent = `${char.class} · Level ${newLevel}`;

  // Refresh tabs and recovery display
  hideModal();
  populateStatsTab(char);
  populateDetailsTab(char);
  updateRecoveryDisplay(char);

  await db.collection('users').doc(AppState.currentUser.uid)
    .collection('characters').doc(char.id).update({
      level:                newLevel,
      maxHP:                changes.newHP,
      currentHP:            newCurrentHP,
      characteristics:      changes.newChars,
      'heroicResource.max': newResMax,
      damageImmunities:     char.damageImmunities,
      damageWeaknesses:     char.damageWeaknesses,
    });

  showToast(`${char.name} reached Level ${newLevel}!`, 'success');
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

  // Recovery pips
  const pipsEl = document.getElementById('recovery-pips');
  if (pipsEl && max > 0) {
    const pipCount = Math.min(max, 12);
    pipsEl.innerHTML = Array.from({ length: pipCount }, (_, i) =>
      `<span class="recovery-pip ${i < current ? 'pip-full' : 'pip-empty'}"></span>`
    ).join('');
  }

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

  // Collect typed damage options from this character's resistances (non-conditional only)
  const immunities = char.damageImmunities || [];
  const weaknesses = (char.damageWeaknesses || []).filter(r => !r.display);
  const typedResistances = [...new Set([
    ...immunities.map(r => r.type),
    ...weaknesses.map(r => r.type),
  ])].filter(t => t !== 'all');
  const showTypeDropdown = typedResistances.length > 0;

  const damageTypeHTML = showTypeDropdown ? `
    <div class="hp-damage-type-row">
      <div class="hp-damage-type-label">Damage Type</div>
      <select id="hp-damage-type" class="hp-damage-type-select">
        <option value="physical">Physical (no modifier)</option>
        ${typedResistances.map(t => {
          const immunity = immunities.find(r => r.type === t);
          const weakness = weaknesses.find(r => r.type === t);
          const note = immunity ? ` — Immunity ${immunity.value}` : weakness ? ` — Weakness ${weakness.value}` : '';
          return `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}${note}</option>`;
        }).join('')}
      </select>
    </div>
  ` : '';

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
      ${damageTypeHTML}
      <div class="hp-modal-buttons">
        <button class="btn btn-danger" id="hp-damage-btn">Damage</button>
        <button class="btn btn-heal" id="hp-heal-btn">Heal</button>
      </div>
      <button class="btn btn-ghost hp-modal-set-btn" id="hp-set-btn">Set exact value</button>
    </div>
  `);

  setTimeout(() => document.getElementById('hp-delta-input')?.focus(), 100);

  const getDamageType = () => document.getElementById('hp-damage-type')?.value || null;

  document.getElementById('hp-damage-btn').addEventListener('click', () => {
    const val = parseInt(document.getElementById('hp-delta-input').value) || 0;
    if (val > 0) { adjustHP(-val, getDamageType()); hideModal(); }
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

function updateHPBar(current, max) {
  const hpDisp = document.getElementById('hp-display');
  if (!hpDisp) return;
  const pct = max > 0 ? Math.max(0, current) / max : 1;
  const fill = hpDisp.querySelector('.hp-bar-fill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct * 100))}%`;
  hpDisp.classList.toggle('hp-danger',  pct <= 0.25 && current > 0);
  hpDisp.classList.toggle('hp-warning', pct > 0.25 && pct <= 0.5);
  hpDisp.classList.toggle('hp-dead',    current <= 0);
}

async function adjustHP(delta, damageType = null) {
  const char = AppState.currentCharacter;
  if (!char) return;

  // Apply damage immunities / weaknesses to incoming damage (negative delta only)
  let effectiveDelta = delta;
  if (delta < 0 && damageType && damageType !== 'physical') {
    let dmg = Math.abs(delta);
    const immunity = (char.damageImmunities || []).find(r => r.type === damageType);
    // Only apply non-conditional weaknesses (conditional ones like Wings/airborne skip)
    const weakness = (char.damageWeaknesses || []).find(r => r.type === damageType && !r.display);
    if (immunity) dmg = Math.max(0, dmg - immunity.value);
    if (weakness) dmg += weakness.value;
    const originalDmg = Math.abs(delta);
    if (dmg !== originalDmg) {
      const parts = [];
      if (immunity) parts.push(`Immunity −${immunity.value}`);
      if (weakness) parts.push(`Weakness +${weakness.value}`);
      showToast(`${parts.join(', ')}: ${originalDmg} → ${dmg} ${damageType} damage`, 'info');
    }
    effectiveDelta = -dmg;
  }

  const current = char.currentHP ?? char.maxHP ?? 0;
  const max = char.maxHP ?? 0;
  // No lower clamp — Stamina can go negative in Draw Steel (hero is dying)
  const newVal = Math.min(max, current + effectiveDelta);

  char.currentHP = newVal;
  document.getElementById('hp-current').textContent = newVal;
  updateHPBar(newVal, max);

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

const LAW_CLASSES_LOCAL = ['Conduit', 'Elementalist', 'Null'];

// Detects whether a trait description defines an active action type.
// Only matches colon-syntax definitions ("Triggered action: ...") not passive riders.
const ACTIVE_TRAIT_RE = [
  { re: /\bfree triggered action\s*:/i, badge: 'FREE TRIG.',  cls: 'badge-free-triggered' },
  { re: /\btriggered action\s*:/i,      badge: 'TRIGGERED',   cls: 'badge-triggered'       },
  { re: /\bmaneuver\s*:/i,              badge: 'MANEUVER',    cls: 'badge-maneuver'        },
];

function getTraitActionBadge(desc) {
  for (const { re, badge, cls } of ACTIVE_TRAIT_RE) {
    if (re.test(desc)) return `<span class="badge ${cls}">${badge}</span>`;
  }
  return '';
}

function buildAncestryTraitsBlock(ancestryDef, char) {
  const purchased = char.ancestryTraits ?? [];

  const traitCard = (name, desc, extra = '') => `
    <div class="ancestry-trait-card ${extra}">
      <div class="ancestry-trait-header">
        <span class="ancestry-trait-name">${name}</span>
        <div class="ancestry-trait-badges">
          ${extra.includes('ancestry-trait-sig') ? '<span class="badge badge-signature">SIG</span>' : ''}
          ${getTraitActionBadge(desc)}
        </div>
      </div>
      <div class="ancestry-trait-desc">${desc}</div>
    </div>
  `;

  const sigCard = traitCard(
    ancestryDef.signatureTrait.name,
    ancestryDef.signatureTrait.desc,
    'ancestry-trait-sig'
  );

  const purchasedCards = purchased
    .map(name => {
      const t = ancestryDef.traits.find(t => t.name === name);
      return t ? traitCard(t.name, t.desc) : '';
    })
    .join('');

  return `
    <div class="ancestry-traits-block">
      <div class="stats-section-title ancestry-traits-title">
        Ancestry Traits · ${char.ancestry}
      </div>
      <div class="ancestry-traits-grid">
        ${sigCard}
        ${purchasedCards}
      </div>
    </div>
  `;
}

function buildResistancesBlock(char) {
  const immunities = char.damageImmunities || [];
  const weaknesses = char.damageWeaknesses || [];
  if (!immunities.length && !weaknesses.length) return '';

  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

  const immunityPills = immunities.map(r => `
    <div class="res-pill res-immunity">
      <span class="res-type">${capitalize(r.type)}</span>
      <span>Immunity ${r.value}</span>
    </div>
  `).join('');

  const weaknessPills = weaknesses.map(r => `
    <div class="res-pill res-weakness">
      <span class="res-type">${r.type === 'all' ? 'All' : capitalize(r.type)}</span>
      <span>Weakness ${r.value}</span>
      ${r.display ? `<span class="res-conditional">(${r.display.replace(/Weakness \d+ /, '')})</span>` : ''}
    </div>
  `).join('');

  return `
    <div class="resistance-block">
      <div class="stats-section-title">Resistances</div>
      <div class="resistance-pills">
        ${immunityPills}
        ${weaknessPills}
      </div>
    </div>
  `;
}

function populateStatsTab(char) {
  const meta     = CLASS_COLORS[char.class] || { accent: '#2980B9', resource: 'Resource' };
  const stats    = char.characteristics || {};
  const level    = char.level ?? 1;
  const recovery = Math.floor((char.maxHP ?? 0) / 3);
  const resMax   = getHeroicResourceMax(level);
  const resourceGain = LAW_CLASSES_LOCAL.includes(char.class) ? '+2 per turn' : '+1d3 per turn';

  // Subclass lookup for A3
  const subclassList = typeof CLASS_SUBCLASSES !== 'undefined' ? CLASS_SUBCLASSES[char.class] : null;
  const subclassDef  = subclassList?.find(s => s.name === char.subclass) ?? null;

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
        <span>${meta.resource} (max ${resMax})</span>
      </div>
      <div class="resource-gain-section">
        <div class="resource-gain-label">
          <span class="resource-gain-icon" style="color:${meta.accent}">◆</span>
          ${meta.resource} Gain
        </div>
        <div class="resource-gain-list">
          <div class="resource-gain-row base-gain">Start of your turn: <span class="resource-gain-hint">${resourceGain}</span></div>
          ${(CLASS_RESOURCE_CONDITIONS[char.class] || []).map(c =>
            `<div class="resource-gain-row">${c}</div>`
          ).join('')}
        </div>
      </div>
      ${subclassDef ? `
      <div class="subclass-panel" style="border-left-color:${meta.accent}">
        <div class="subclass-panel-header">
          <span class="subclass-name">${subclassDef.name}</span>
          <span class="subclass-skill-badge">${subclassDef.skill}</span>
        </div>
        <div class="subclass-feature" style="color:${meta.accent}">${subclassDef.feature}</div>
        <div class="subclass-desc">${subclassDef.desc}</div>
      </div>
      ` : ''}
      <div class="class-summary-footer">
        <span class="level-badge">LEVEL ${level}</span>
        ${level < 10
          ? `<button class="btn btn-ghost btn-small" id="levelup-btn">Level Up →</button>`
          : `<span class="level-max">MAX LEVEL</span>`}
      </div>
    `;
    document.getElementById('levelup-btn')?.addEventListener('click', showLevelUpModal);
  }

  // Ancestry lookup for A1
  const ancestryDef = typeof ANCESTRY_DATA !== 'undefined'
    ? ANCESTRY_DATA.find(a => a.name === char.ancestry)
    : null;

  // Combat Profile — kit stats
  const kitData = typeof KIT_STATS !== 'undefined' ? KIT_STATS[char.kit] : null;
  const grid = document.getElementById('stats-grid');

  // Parse a kit bonus string like "+2" or "—" to a number (0 if none)
  const parseBonus = str => {
    if (!str || str === '—') return 0;
    const n = parseInt(str);
    return isNaN(n) ? 0 : n;
  };

  const speed     = 5 + parseBonus(kitData?.speed);
  const stability = parseBonus(kitData?.stability);

  grid.innerHTML = `
    ${kitData ? `
    <div class="combat-profile-block">
      <div class="stats-section-title">Combat Profile · ${char.kit || 'No Kit'}</div>
      <div class="combat-profile-grid">
        <div class="cp-stat">
          <div class="cp-value">${speed}</div>
          <div class="cp-label">Speed</div>
        </div>
        <div class="cp-stat">
          <div class="cp-value">${stability || '—'}</div>
          <div class="cp-label">Stability</div>
        </div>
        <div class="cp-stat">
          <div class="cp-value cp-dmg">${kitData.meleeDmg !== '—' ? kitData.meleeDmg : '—'}</div>
          <div class="cp-label">Melee Dmg</div>
        </div>
        ${kitData.rangedDmg !== '—' ? `
        <div class="cp-stat">
          <div class="cp-value cp-dmg">${kitData.rangedDmg}</div>
          <div class="cp-label">Ranged Dmg</div>
        </div>
        ` : ''}
      </div>
      ${kitData.sigAbility ? `
      <div class="cp-sig">
        <span class="cp-sig-label">Kit Ability</span>
        <span class="cp-sig-text">${kitData.sigAbility}</span>
      </div>
      ` : ''}
      <div class="cp-kit-equipment">
        <span class="cp-equip-item"><span class="cp-equip-label">Armor</span> ${kitData.armor}</span>
        <span class="cp-equip-item"><span class="cp-equip-label">Weapon</span> ${kitData.weapon}</span>
      </div>
    </div>
    ` : ''}

    <div class="stats-section-title">Characteristics</div>
    <div class="power-roll-hint">
      <span class="pr-icon">2d10</span>
      Power Roll: 2d10 + characteristic.
      <span class="pr-tier pr-t1">≤11 Tier 1</span>
      <span class="pr-tier pr-t2">12–16 Tier 2</span>
      <span class="pr-tier pr-t3">17+ Tier 3</span>
    </div>
    <div class="characteristics-grid">
      <div class="char-stat-block">
        <div class="char-stat-top">
          <div class="char-stat-value">${stats.MGT ?? 0}</div>
          <div class="char-stat-name">Might</div>
        </div>
        <div class="char-stat-desc">Melee attacks, lifting, breaking through</div>
      </div>
      <div class="char-stat-block">
        <div class="char-stat-top">
          <div class="char-stat-value">${stats.AGL ?? 0}</div>
          <div class="char-stat-name">Agility</div>
        </div>
        <div class="char-stat-desc">Ranged attacks, dodging, stealth, acrobatics</div>
      </div>
      <div class="char-stat-block">
        <div class="char-stat-top">
          <div class="char-stat-value">${stats.REA ?? 0}</div>
          <div class="char-stat-name">Reason</div>
        </div>
        <div class="char-stat-desc">Magic, knowledge, crafting, investigation</div>
      </div>
      <div class="char-stat-block">
        <div class="char-stat-top">
          <div class="char-stat-value">${stats.INU ?? 0}</div>
          <div class="char-stat-name">Intuition</div>
        </div>
        <div class="char-stat-desc">Perception, reading people, healing, nature</div>
      </div>
      <div class="char-stat-block">
        <div class="char-stat-top">
          <div class="char-stat-value">${stats.PRS ?? 0}</div>
          <div class="char-stat-name">Presence</div>
        </div>
        <div class="char-stat-desc">Leadership, persuasion, morale, inspiring allies</div>
      </div>
    </div>

    ${buildResistancesBlock(char)}

    ${ancestryDef ? buildAncestryTraitsBlock(ancestryDef, char) : ''}
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

// ── Damage resistance helpers (Phase D) ─────────────────────────────────────

const WYRMPLATE_TYPES = ['acid', 'cold', 'corruption', 'fire', 'lightning', 'poison'];

/**
 * Derives damageImmunities and damageWeaknesses from ancestry + traits + level.
 * Returns { damageImmunities: [{type, value}], damageWeaknesses: [{type, value, display?}] }
 */
function computeDamageResistances(char) {
  const immunities = [];
  const weaknesses = [];
  const level  = char.level ?? 1;
  const traits = char.ancestryTraits || [];

  if (char.ancestry === 'Dragon Knight') {
    // Wyrmplate (signature): immunity = level to chosen damage type
    if (char.ancestryDamageTypeChoice) {
      immunities.push({ type: char.ancestryDamageTypeChoice, value: level });
    }
  }

  // Wings (Devil or Dragon Knight, levels 1–3): weakness 5 while airborne
  // Displayed in UI but not auto-applied (app doesn't track airborne state)
  const hasWings = (char.ancestry === 'Devil' || char.ancestry === 'Dragon Knight')
    && traits.includes('Wings');
  if (hasWings && level <= 3) {
    weaknesses.push({ type: 'all', value: 5, display: 'Weakness 5 (while airborne)' });
  }

  return { damageImmunities: immunities, damageWeaknesses: weaknesses };
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

// Condition descriptions for reference
const CONDITION_DESCRIPTIONS = [
  { name: 'Bleeding',   effect: 'Take damage equal to your Stamina recovery at the start of your turn.' },
  { name: 'Dazed',      effect: 'You can only take one action on your turn (action, maneuver, or triggered).' },
  { name: 'Frightened', effect: 'You cannot willingly move closer to the source of your fear.' },
  { name: 'Grabbed',    effect: 'Your speed becomes 0. The grabber moves with you if you are forcibly moved.' },
  { name: 'Prone',      effect: 'You have a bane on attacks. Melee attacks against you have an edge. Standing up costs movement.' },
  { name: 'Slowed',     effect: 'Your speed is halved (rounded down). You cannot shift.' },
  { name: 'Taunted',    effect: 'You have a bane on attacks against creatures other than the one who taunted you.' },
  { name: 'Weakened',   effect: 'All your Power Rolls (attacks, checks) have a bane.' },
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

// Conditional / additional ways each class gains their heroic resource
// beyond the base per-turn amount. Reference only — verify against rulebook.
const CLASS_RESOURCE_CONDITIONS = {
  Fury: [
    '+1 Rage when an enemy deals damage to you',
    '+1 Rage when you use a Fury ability',
  ],
  Tactician: [
    '+1 Focus when an ally uses an ability you granted',
    '+1 Focus when you use a Tactician ability',
  ],
  Shadow: [
    '+1 Insight when you use a Shadow ability',
    '+1 Insight when you apply a condition to an enemy',
  ],
  Conduit: [
    '+1 Piety when an ally within your aura regains Stamina',
    '+1 Piety when a creature is reduced to 0 Stamina within your aura',
  ],
  Elementalist: [
    '+1 Essence when you use an Elementalist ability',
    'Some abilities restore Essence when cast at lower power',
  ],
  Null: [
    '+1 Discipline when you resist a supernatural effect',
    '+1 Discipline when you use a Null ability',
  ],
  Talent: [
    '+1 Clarity when you use a Talent ability',
    '+1 Clarity when you move a creature or object with telekinesis',
  ],
};

const CLASS_BASE_STAMINA = {
  Conduit: 18, Elementalist: 18, Fury: 24,
  Null: 21, Shadow: 18, Tactician: 21, Talent: 18,
};

// Additional Stamina gained per level after level 1
const CLASS_STAMINA_PER_LEVEL = {
  Conduit: 6, Elementalist: 6, Fury: 9,
  Null: 6, Shadow: 6, Tactician: 6, Talent: 6,
};

// ── Level / echelon helpers ───────────────────────────────────────────────────

function getEchelon(level) {
  if (level >= 10) return 4;
  if (level >= 7)  return 3;
  if (level >= 4)  return 2;
  return 1;
}

function getKitStaminaForEchelon(kitName, echelon) {
  return (KIT_STAMINA[kitName] ?? 0) * echelon;
}

function computeMaxHP(cls, kit, level) {
  const base     = CLASS_BASE_STAMINA[cls] ?? 18;
  const perLevel = CLASS_STAMINA_PER_LEVEL[cls] ?? 6;
  const echelon  = getEchelon(level);
  const kitBonus = getKitStaminaForEchelon(kit, echelon);
  return base + (perLevel * (level - 1)) + kitBonus;
}

function getHeroicResourceMax(level) {
  if (level >= 10) return 12;
  if (level >= 7)  return 11;
  return 10;
}

// Applies universal characteristic bonuses for the given level.
// Always operates on baseChars (wizard-set values) to stay idempotent.
function computeCharacteristicsForLevel(baseChars, level) {
  const bonus = (level >= 7 ? 2 : 0) + (level >= 4 ? 1 : 0);
  const cap   = level >= 7 ? 4 : (level >= 4 ? 3 : 2);
  const result = {};
  for (const stat of ['MGT', 'AGL', 'REA', 'INU', 'PRS']) {
    result[stat] = Math.min(cap, (baseChars[stat] ?? 0) + bonus);
  }
  return result;
}

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

const WIZARD_TOTAL_STEPS = 11;

const WIZARD_CONFIG = [
  { title: 'Name Your Hero',        sub: 'What do they call you?' },
  { title: 'Choose Your Ancestry',  sub: 'Where does your lineage lie?' },
  { title: 'Choose Your Culture',   sub: 'How were you raised?' },
  { title: 'Choose Your Career',    sub: 'What did you do before this life?' },
  { title: 'Choose Your Class',     sub: 'Your calling on the battlefield.' },
  { title: 'Choose Your Kit',       sub: 'How do you fight?' },
  { title: 'Choose Your Abilities', sub: 'Pick your signature and heroic abilities.' },
  { title: 'Choose a Complication', sub: "What complicates your hero's story?" },
  { title: 'Set Characteristics',   sub: 'Distribute your characteristic points.' },
  { title: 'Stamina & Resources',   sub: 'Your combat stats at a glance.' },
  { title: 'Review Your Hero',      sub: 'Everything look good? Create your hero.' },
];

// ── Wizard init ───────────────────────────────────────────────────────────────

function startWizard() {
  AppState.pendingCharacter = {
    name: '', ancestry: '', career: '',
    class: null, kit: null, complication: 'None',
    characteristics: { MGT: 0, AGL: 0, REA: 0, INU: 0, PRS: 0 },
    ancestryTraits: [],
    cultureEnvironment: null, cultureOrganization: null, cultureUpbringing: null,
    subclass: null,
    abilityIds: [],
    _step: 1, _charsReady: false,
    _step7Sigs: [], _step7Heroic: [],
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
  const stepFn = [, _step1, _step2, _step3, _step4, _step5, _step6, _step7, _step8, _step9, _step10, _step11][step];
  const result = stepFn(body);
  // _step7 is async (Firestore fetch) — ignore the returned promise, it populates the DOM itself
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
  const p = AppState.pendingCharacter;

  body.innerHTML = `
    <div class="wizard-two-col">
      <div class="wizard-col-left">
        <div class="wizard-list" id="ancestry-grid">
          ${ANCESTRY_DATA.map(a => `
            <button class="wizard-pick-btn ${p.ancestry === a.name ? 'selected' : ''}" data-pick="${a.name}">
              <span class="pick-name">${a.name}</span>
              <span class="pick-desc">${a.desc}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="wizard-col-right" id="ancestry-right">
        <p class="col-right-placeholder">← Select an ancestry to see traits</p>
      </div>
    </div>
  `;

  function renderAncestryDetail(ancestryName) {
    const anc = ANCESTRY_DATA.find(a => a.name === ancestryName);
    if (!anc) return;
    const panel = document.getElementById('ancestry-right');
    if (!p.ancestryTraits) p.ancestryTraits = [];
    const spent = p.ancestryTraits.reduce((sum, tName) => {
      const t = anc.traits.find(t => t.name === tName);
      return sum + (t ? t.cost : 0);
    }, 0);
    const remaining = anc.traitPoints - spent;

    panel.innerHTML = `
      <div class="sig-trait-box">
        <div class="sig-trait-header">
          <span class="sig-trait-badge">Signature Trait · Free</span>
          <span class="sig-trait-name">${anc.signatureTrait.name}</span>
        </div>
        <p class="sig-trait-desc">${anc.signatureTrait.desc}</p>
      </div>
      <div class="trait-budget">
        <span class="trait-budget-label">Trait Points Remaining</span>
        <span class="trait-budget-count ${remaining === 0 ? 'spent' : ''}" id="trait-remaining">${remaining}</span>
        <span class="trait-budget-total">/ ${anc.traitPoints}</span>
      </div>
      <div class="trait-list">
        ${anc.traits.map(t => {
          const isSel = p.ancestryTraits.includes(t.name);
          const canAfford = isSel || remaining >= t.cost;
          return `
            <label class="trait-item ${isSel ? 'selected' : ''} ${!canAfford ? 'unaffordable' : ''}"
                   data-trait="${t.name}" data-cost="${t.cost}">
              <div class="trait-check">${isSel ? '✓' : ''}</div>
              <div class="trait-info">
                <div class="trait-name-row">
                  <span class="trait-name">${t.name}</span>
                  <span class="trait-cost">${t.cost === 1 ? '1 pt' : '2 pts'}</span>
                </div>
                <span class="trait-desc">${t.desc}</span>
              </div>
            </label>
          `;
        }).join('')}
      </div>

      ${ancestryName === 'Dragon Knight' ? `
      <div class="wyrmplate-selector">
        <div class="wyrmplate-label">◆ Wyrmplate Damage Type</div>
        <div class="wyrmplate-types">
          ${WYRMPLATE_TYPES.map(t => `
            <button class="wyrmplate-type-btn ${p.ancestryDamageTypeChoice === t ? 'selected' : ''}"
                    data-dtype="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>
          `).join('')}
        </div>
        <div class="wyrmplate-hint">
          ${p.ancestryDamageTypeChoice
            ? `Immunity 1 to <strong>${p.ancestryDamageTypeChoice}</strong> (scales with level)`
            : 'Choose a damage type for your Wyrmplate signature trait.'}
        </div>
      </div>
      ` : ''}
    `;

    panel.querySelectorAll('.trait-item').forEach(item => {
      item.addEventListener('click', () => {
        const tName = item.dataset.trait;
        const cost  = parseInt(item.dataset.cost);
        const idx   = p.ancestryTraits.indexOf(tName);
        if (idx >= 0) {
          p.ancestryTraits.splice(idx, 1);
        } else {
          const currSpent = p.ancestryTraits.reduce((sum, n) => {
            const t = anc.traits.find(t => t.name === n);
            return sum + (t ? t.cost : 0);
          }, 0);
          if (currSpent + cost > anc.traitPoints) return;
          p.ancestryTraits.push(tName);
        }
        renderAncestryDetail(ancestryName);
      });
    });

    // Wire Wyrmplate damage type buttons (Dragon Knight only)
    panel.querySelectorAll('.wyrmplate-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        p.ancestryDamageTypeChoice = btn.dataset.dtype;
        renderAncestryDetail(ancestryName);
      });
    });
  }

  document.getElementById('ancestry-grid').querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('ancestry-grid').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (p.ancestry !== btn.dataset.pick) {
        p.ancestry = btn.dataset.pick;
        p.ancestryTraits = [];
      }
      renderAncestryDetail(p.ancestry);
    });
  });

  if (p.ancestry) renderAncestryDetail(p.ancestry);
}

// ── Step 3: Culture ───────────────────────────────────────────────────────────

function _step3(body) {
  const p = AppState.pendingCharacter;

  function sectionHTML(title, hint, data, field) {
    const sel = p[field];
    return `
      <div class="culture-section">
        <div class="culture-section-header">
          <span class="culture-section-title">${title}</span>
          <span class="culture-section-hint">${hint}</span>
        </div>
        <div class="wizard-grid wizard-grid-culture">
          ${data.map(opt => `
            <button class="wizard-pick-btn ${sel === opt.name ? 'selected' : ''}"
                    data-pick="${opt.name}" data-field="${field}">
              <span class="pick-name">${opt.name}</span>
              <span class="pick-sub">Skill: ${opt.quickBuild}</span>
              <span class="pick-desc">${opt.desc}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  body.innerHTML =
    sectionHTML('Environment', 'Where did your community live?', CULTURE_ENVIRONMENTS, 'cultureEnvironment') +
    sectionHTML('Organization', 'How was your community governed?', CULTURE_ORGANIZATIONS, 'cultureOrganization') +
    sectionHTML('Upbringing', 'How were you raised?', CULTURE_UPBRINGINGS, 'cultureUpbringing');

  body.querySelectorAll('[data-pick][data-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      body.querySelectorAll(`[data-field="${field}"]`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      p[field] = btn.dataset.pick;
    });
  });
}

// ── Step 4: Career ────────────────────────────────────────────────────────────

function _step4(body) {
  const p = AppState.pendingCharacter;

  function careerDetailHTML(c) {
    if (!c) return '<p class="col-right-placeholder">← Select a career to see details</p>';
    return `
      <div class="career-detail-panel">
        <div class="career-detail-name">${c.name}</div>
        <p class="career-detail-desc">${c.desc}</p>
        <div class="career-detail-rows">
          <div class="career-detail-row">
            <span class="career-detail-label">Skills</span>
            <span class="career-detail-val">${c.skills}</span>
          </div>
          <div class="career-detail-row">
            <span class="career-detail-label">Languages</span>
            <span class="career-detail-val">+${c.languages}</span>
          </div>
          <div class="career-detail-row">
            <span class="career-detail-label">Resources</span>
            <span class="career-detail-val">${c.resources}</span>
          </div>
        </div>
      </div>
    `;
  }

  body.innerHTML = `
    <div class="wizard-two-col">
      <div class="wizard-col-left">
        <div class="wizard-list" id="career-list">
          ${CAREER_DATA.map(c => `
            <button class="wizard-pick-btn ${p.career === c.name ? 'selected' : ''}" data-pick="${c.name}">
              <span class="pick-name">${c.name}</span>
              <span class="pick-desc">${c.desc}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="wizard-col-right" id="career-right">
        ${careerDetailHTML(CAREER_DATA.find(c => c.name === p.career))}
      </div>
    </div>
  `;

  document.getElementById('career-list').querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('career-list').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      p.career = btn.dataset.pick;
      document.getElementById('career-right').innerHTML = careerDetailHTML(CAREER_DATA.find(c => c.name === p.career));
    });
  });
}

// ── Step 5: Class ─────────────────────────────────────────────────────────────

function _step5(body) {
  const p = AppState.pendingCharacter;

  function rightPanelHTML(className) {
    if (!className) return '<p class="col-right-placeholder">← Select a class to see subclasses</p>';
    const subs = CLASS_SUBCLASSES[className] || [];
    const meta = CLASS_COLORS[className] || { accent: '#2980B9', resource: 'Resource' };
    return `
      <div class="subclass-header" style="border-left-color: ${meta.accent}">
        <span class="subclass-title">Choose Your ${className} Subclass</span>
        <span class="subclass-resource" style="color: ${meta.accent}">${meta.resource}</span>
      </div>
      <p class="class-right-desc">${CLASS_DESCRIPTIONS[className] || ''}</p>
      <div class="wizard-list" id="subclass-list">
        ${subs.map(s => `
          <button class="wizard-pick-btn ${p.subclass === s.name ? 'selected' : ''}" data-subclass="${s.name}">
            <span class="pick-name">${s.name}</span>
            <span class="pick-sub">Feature: ${s.feature} · Skill: ${s.skill}</span>
            <span class="pick-desc">${s.desc}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  body.innerHTML = `
    <div class="wizard-two-col">
      <div class="wizard-col-left">
        <div class="wizard-grid wizard-grid-2" id="class-grid">
          ${Object.entries(CLASS_COLORS).map(([cls, meta]) => `
            <button class="wizard-pick-btn ${p.class === cls ? 'selected' : ''}"
                    style="--pick-color: ${meta.accent}" data-pick="${cls}">
              <span class="pick-name">${cls}</span>
              <span class="pick-sub">${meta.resource}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="wizard-col-right" id="class-right">
        ${rightPanelHTML(p.class)}
      </div>
    </div>
  `;

  function wireSubclassList() {
    document.getElementById('subclass-list')?.querySelectorAll('[data-subclass]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('subclass-list').querySelectorAll('[data-subclass]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        p.subclass = btn.dataset.subclass;
      });
    });
  }

  document.getElementById('class-grid').querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('class-grid').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (p.class !== btn.dataset.pick) {
        p.class = btn.dataset.pick;
        p.subclass = null;
        p._charsReady = false;
        // Clear any previous ability selections when class changes
        p._step7Sigs = [];
        p._step7Heroic = [];
        p.abilityIds = [];
      }
      document.getElementById('class-right').innerHTML = rightPanelHTML(p.class);
      wireSubclassList();
    });
  });

  wireSubclassList();
}

// ── Step 6: Kit ───────────────────────────────────────────────────────────────

function _step6(body) {
  const p = AppState.pendingCharacter;

  function kitStatsHTML(kitName) {
    if (!kitName) return '<p class="col-right-placeholder">← Select a kit to see stats</p>';
    const s = KIT_STATS[kitName];
    if (!s) return '<p class="col-right-placeholder">No stats available for this kit.</p>';
    const rows = [
      ['Armor',       s.armor],
      ['Weapon',      s.weapon],
      ['Stamina',     s.stamina],
      ['Speed',       s.speed],
      ['Stability',   s.stability],
      ['Melee Dmg',   s.meleeDmg],
      ['Ranged Dmg',  s.rangedDmg],
      ['Range Bonus', s.rangedRange],
      ['Disengage',   s.disengage],
    ].filter(([, v]) => v && v !== '—');
    return `
      <div class="kit-stats-card">
        <div class="kit-stats-title">${kitName}</div>
        <div class="kit-stats-grid">
          ${rows.map(([label, val]) => `
            <div class="kit-stat-row">
              <span class="kit-stat-label">${label}</span>
              <span class="kit-stat-val">${val}</span>
            </div>
          `).join('')}
        </div>
        <div class="kit-sig-ability">
          <span class="kit-sig-label">Signature Ability</span>
          <span class="kit-sig-name">${s.sigAbility}</span>
        </div>
      </div>
    `;
  }

  body.innerHTML = `
    <div class="wizard-two-col">
      <div class="wizard-col-left">
        <div class="wizard-grid wizard-grid-2" id="kit-grid">
          ${KITS.map(k => `
            <button class="wizard-pick-btn ${p.kit === k.name ? 'selected' : ''}" data-pick="${k.name}">
              <span class="pick-name">${k.name}</span>
              <span class="pick-sub">${k.role}</span>
              <span class="pick-desc">${k.desc}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="wizard-col-right" id="kit-right">
        ${kitStatsHTML(p.kit)}
      </div>
    </div>
  `;

  document.getElementById('kit-grid').querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('kit-grid').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      p.kit = btn.dataset.pick;
      document.getElementById('kit-right').innerHTML = kitStatsHTML(p.kit);
    });
  });
}

// ── Step 7: Ability Selection ─────────────────────────────────────────────────

async function _step7(body) {
  const p = AppState.pendingCharacter;
  if (!p.class) {
    body.innerHTML = '<p class="wizard-hint">Select a class first (Step 5).</p>';
    return;
  }

  const picks = CLASS_ABILITY_PICKS[p.class] || { signatures: 1, heroic: 2 };
  if (!p._step7Sigs)   p._step7Sigs   = [];
  if (!p._step7Heroic) p._step7Heroic = [];

  body.innerHTML = `
    <div class="wizard-two-col">
      <div class="wizard-col-left" id="ability-pools">
        <p class="loading-text">Loading abilities...</p>
      </div>
      <div class="wizard-col-right" id="ability-selection-right">
        <p class="col-right-placeholder">Select abilities to see your choices</p>
      </div>
    </div>
  `;

  try {
    const snap = await db.collection('abilities')
      .where('class', '==', p.class)
      .where('level', '==', 1)
      .get();

    const all    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sigs   = all.filter(a => a.isSignature);
    const heroic = all.filter(a => !a.isSignature).sort((a, b) => (a.cost || 0) - (b.cost || 0));
    const meta   = CLASS_COLORS[p.class] || { resource: 'Resource' };

    function abilityCardHTML(a, pool) {
      const sel = pool === 'sig' ? p._step7Sigs.includes(a.id) : p._step7Heroic.includes(a.id);
      return `
        <button class="ability-pick-card ${sel ? 'selected' : ''}" data-ability-id="${a.id}" data-pool="${pool}">
          <div class="ability-pick-header">
            <span class="ability-pick-name">${a.name}</span>
            <div class="ability-pick-meta">
              <span class="ability-pick-type">${a.type}</span>
              ${a.cost > 0 ? `<span class="ability-pick-cost">${a.cost} ${meta.resource}</span>` : ''}
            </div>
          </div>
          ${a.tier2 ? `<div class="ability-pick-desc">${a.tier2}</div>` : ''}
          ${!a.tier2 && a.effect ? `<div class="ability-pick-desc">${a.effect}</div>` : ''}
        </button>
      `;
    }

    function renderPools() {
      const poolEl = document.getElementById('ability-pools');
      if (!poolEl) return;
      poolEl.innerHTML = `
        <div class="ability-pool">
          <div class="ability-pool-header">
            <span class="pool-title">Signature Abilities</span>
            <span class="pool-quota ${p._step7Sigs.length >= picks.signatures ? 'quota-met' : ''}">
              ${p._step7Sigs.length} / ${picks.signatures} selected
            </span>
          </div>
          ${sigs.length ? sigs.map(a => abilityCardHTML(a, 'sig')).join('') : '<p class="summary-empty">No signature abilities available.</p>'}
        </div>
        <div class="ability-pool">
          <div class="ability-pool-header">
            <span class="pool-title">Heroic Abilities</span>
            <span class="pool-quota ${p._step7Heroic.length >= picks.heroic ? 'quota-met' : ''}">
              ${p._step7Heroic.length} / ${picks.heroic} selected
            </span>
          </div>
          ${heroic.length ? heroic.map(a => abilityCardHTML(a, 'heroic')).join('') : '<p class="summary-empty">No heroic abilities available.</p>'}
        </div>
      `;

      poolEl.querySelectorAll('[data-ability-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id   = btn.dataset.abilityId;
          const pool = btn.dataset.pool;
          if (pool === 'sig') {
            const idx = p._step7Sigs.indexOf(id);
            if (idx >= 0) p._step7Sigs.splice(idx, 1);
            else if (p._step7Sigs.length < picks.signatures) p._step7Sigs.push(id);
          } else {
            const idx = p._step7Heroic.indexOf(id);
            if (idx >= 0) p._step7Heroic.splice(idx, 1);
            else if (p._step7Heroic.length < picks.heroic) p._step7Heroic.push(id);
          }
          p.abilityIds = [...p._step7Sigs, ...p._step7Heroic];
          renderPools();
          renderSummary();
        });
      });
    }

    function renderSummary() {
      const rightEl = document.getElementById('ability-selection-right');
      if (!rightEl) return;
      const sigAbilities    = sigs.filter(a => p._step7Sigs.includes(a.id));
      const heroicAbilities = heroic.filter(a => p._step7Heroic.includes(a.id));
      const sigDone    = p._step7Sigs.length >= picks.signatures;
      const heroicDone = p._step7Heroic.length >= picks.heroic;

      rightEl.innerHTML = `
        <div class="ability-selection-summary">
          <div class="summary-section-title">
            Signature ${sigDone ? '<span class="summary-check">✓</span>' : `(${p._step7Sigs.length}/${picks.signatures})`}
          </div>
          ${sigAbilities.map(a => `
            <div class="summary-ability">
              <span class="summary-ability-name">${a.name}</span>
              <span class="summary-ability-type">${a.type}</span>
            </div>
          `).join('') || '<p class="summary-empty">None selected yet</p>'}

          <div class="summary-section-title" style="margin-top:12px">
            Heroic ${heroicDone ? '<span class="summary-check">✓</span>' : `(${p._step7Heroic.length}/${picks.heroic})`}
          </div>
          ${heroicAbilities.map(a => `
            <div class="summary-ability">
              <span class="summary-ability-name">${a.name}</span>
              <span class="summary-ability-type">${a.type}</span>
            </div>
          `).join('') || '<p class="summary-empty">None selected yet</p>'}
        </div>
      `;
    }

    renderPools();
    renderSummary();

  } catch (e) {
    console.error('Error loading abilities for step 7:', e);
    document.getElementById('ability-pools').innerHTML =
      '<p class="error-text">Error loading abilities. Check your connection.</p>';
  }
}

// ── Step 8: Complication ──────────────────────────────────────────────────────

function _step8(body) {
  const p = AppState.pendingCharacter;
  const sel = p.complication || 'None';
  body.innerHTML = `
    <div class="wizard-list">
      ${COMPLICATION_DATA.map(c => `
        <button class="wizard-pick-btn complication-btn ${sel === c.name ? 'selected' : ''}" data-pick="${c.name}">
          <div class="complication-header">
            <span class="pick-name">${c.name}</span>
            <span class="pick-desc">${c.desc}</span>
          </div>
          ${c.name !== 'None' ? `
            <div class="complication-perks">
              <div class="complication-perk">
                <span class="perk-label perk-bonus">Perk</span>
                <span class="perk-text">${c.perk}</span>
              </div>
              <div class="complication-perk">
                <span class="perk-label perk-draw">Drawback</span>
                <span class="perk-text">${c.drawback}</span>
              </div>
            </div>
          ` : ''}
        </button>
      `).join('')}
    </div>
  `;
  _wirePicker(body, 'complication');
}

// ── Step 9: Characteristics ───────────────────────────────────────────────────

function _step9(body) {
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

// ── Step 10: Stamina ──────────────────────────────────────────────────────────

function _step10(body) {
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

// ── Step 11: Review ───────────────────────────────────────────────────────────

function _step11(body) {
  const p         = AppState.pendingCharacter;
  const meta      = CLASS_COLORS[p.class] || { accent: '#2980B9', resource: 'Resource' };
  const base      = CLASS_BASE_STAMINA[p.class] || 18;
  const kitBonus  = KIT_STAMINA[p.kit] || 0;
  const maxHP     = base + kitBonus;

  const cultureSummary = [p.cultureEnvironment, p.cultureOrganization, p.cultureUpbringing].filter(Boolean).join(' / ') || '—';
  const traitsSummary  = (p.ancestryTraits?.length) ? p.ancestryTraits.join(', ') : 'None selected';
  const abilitySummary = (p.abilityIds?.length)
    ? `${p.abilityIds.length} selected`
    : 'None selected';
  const rows = [
    ['Name',            p.name || '—'],
    ['Ancestry',        p.ancestry || '—'],
    ...(p.ancestry === 'Dragon Knight' && p.ancestryDamageTypeChoice
      ? [['Wyrmplate Type', p.ancestryDamageTypeChoice.charAt(0).toUpperCase() + p.ancestryDamageTypeChoice.slice(1)]]
      : []),
    ['Ancestry Traits', traitsSummary],
    ['Culture',         cultureSummary],
    ['Career',          p.career || '—'],
    ['Class',           p.class || '—'],
    ['Subclass',        p.subclass || '—'],
    ['Kit',             p.kit || '—'],
    ['Abilities',       abilitySummary],
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
  } else if (step === 2) {
    if (!p.ancestry) { _flashError('Pick an ancestry to continue.'); return; }
    if (p.ancestry === 'Dragon Knight' && !p.ancestryDamageTypeChoice) {
      _flashError('Choose your Wyrmplate damage type to continue.'); return;
    }
  } else if (step === 3) {
    if (!p.cultureEnvironment)  { _flashError('Choose an Environment to continue.'); return; }
    if (!p.cultureOrganization) { _flashError('Choose an Organization to continue.'); return; }
    if (!p.cultureUpbringing)   { _flashError('Choose an Upbringing to continue.'); return; }
  } else if (step === 4 && !p.career) {
    _flashError('Pick a career to continue.'); return;
  } else if (step === 5) {
    if (!p.class)    { _flashError('Pick a class to continue.'); return; }
    if (!p.subclass) { _flashError('Pick a subclass to continue.'); return; }
  } else if (step === 6 && !p.kit) {
    _flashError('Pick a kit to continue.'); return;
  } else if (step === 7) {
    const picks = CLASS_ABILITY_PICKS[p.class] || { signatures: 1, heroic: 2 };
    if ((p._step7Sigs?.length ?? 0) < picks.signatures) {
      _flashError(`Select ${picks.signatures} signature ability to continue.`); return;
    }
    if ((p._step7Heroic?.length ?? 0) < picks.heroic) {
      _flashError(`Select ${picks.heroic} heroic abilities to continue.`); return;
    }
  }
  // steps 8–10: always valid

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
    name:                p.name,
    ancestry:            p.ancestry || '',
    ancestryTraits:      p.ancestryTraits || [],
    culture:             [p.cultureEnvironment, p.cultureOrganization, p.cultureUpbringing].filter(Boolean).join(' / '),
    cultureEnvironment:  p.cultureEnvironment || '',
    cultureOrganization: p.cultureOrganization || '',
    cultureUpbringing:   p.cultureUpbringing || '',
    career:              p.career || '',
    class:               p.class,
    subclass:            p.subclass || '',
    kit:                 p.kit || '',
    complication:        p.complication || 'None',
    characteristics:     p.characteristics || { MGT:0, AGL:0, REA:0, INU:0, PRS:0 },
    maxHP,
    currentHP:           maxHP,
    heroicResource:      { name: meta.resource, current: 0, max: 10 },
    recoveries:          { current: CLASS_RECOVERIES[p.class] ?? 8, max: CLASS_RECOVERIES[p.class] ?? 8 },
    abilityIds:               p.abilityIds || [],
    conditions:               [],
    level:                    1,
    victories:                0,
    baseCharacteristics:      p.characteristics || { MGT:0, AGL:0, REA:0, INU:0, PRS:0 },
    ancestryDamageTypeChoice: p.ancestryDamageTypeChoice || null,
    classAccentColor:         meta.accent,
    wizardStep:               11,
    createdAt:                firebase.firestore.FieldValue.serverTimestamp(),
  };

  // Compute damage immunities / weaknesses from ancestry
  const initialResistances = computeDamageResistances({ ...charData, level: 1 });
  charData.damageImmunities = initialResistances.damageImmunities;
  charData.damageWeaknesses = initialResistances.damageWeaknesses;

  // A2 — Kit signature ability: attempt to find a matching Firestore ability
  // by name and, if found, add its ID so it shows via the normal ability flow.
  // If not found, getKitVirtualAbility() in abilities.js will synthesize it.
  if (p.kit) {
    const kitStats = typeof KIT_STATS !== 'undefined' ? KIT_STATS[p.kit] : null;
    if (kitStats?.sigAbility) {
      const colonIdx = kitStats.sigAbility.indexOf(':');
      const sigName = (colonIdx > -1
        ? kitStats.sigAbility.substring(0, colonIdx)
        : kitStats.sigAbility).trim();
      try {
        const sigSnap = await db.collection('abilities')
          .where('name', '==', sigName)
          .limit(1)
          .get();
        if (!sigSnap.empty) {
          const sigId = sigSnap.docs[0].id;
          if (!charData.abilityIds.includes(sigId)) {
            charData.abilityIds = [...charData.abilityIds, sigId];
          }
        }
        // If not found → getKitVirtualAbility handles display
      } catch (e) {
        console.warn('Kit sig ability lookup skipped:', e);
      }
    }
  }

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
document.getElementById('victory-minus').addEventListener('click',  () => adjustVictories(-1));
document.getElementById('victory-plus').addEventListener('click',   () => adjustVictories(1));
document.getElementById('respite-btn').addEventListener('click', showRespiteModal);

// ── Expose globals ───────────────────────────────────────────────────────────
window.loadCharacterList = loadCharacterList;
window.openCharacterSheet = openCharacterSheet;
window.CLASS_COLORS = CLASS_COLORS;
window.showToast = showToast;
window.updateRecoveryDisplay = updateRecoveryDisplay;
window.toggleCondition = toggleCondition;
