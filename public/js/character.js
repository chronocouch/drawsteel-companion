/**
 * character.js — Character list, sheet display, and creation wizard
 *
 * Phase 1: Character list + empty character shell
 * Phase 2: Full 10-step wizard
 */

// ── Class accent colors ──────────────────────────────────────────────────────
const CLASS_COLORS = {
  'Beastheart':   { accent: '#7D5A3C', resource: 'Ferocity' },
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

    ${char.skills?.length ? (() => {
      // Group skills by category
      const grouped = {};
      const uncategorized = [];
      for (const s of char.skills) {
        const cat = (typeof SKILL_CATEGORIES !== 'undefined' && SKILL_CATEGORIES[s]) || null;
        if (cat) { (grouped[cat] = grouped[cat] || []).push(s); }
        else { uncategorized.push(s); }
      }
      const order = (typeof SKILL_CATEGORY_ORDER !== 'undefined') ? SKILL_CATEGORY_ORDER : [];
      const labels = (typeof SKILL_CATEGORY_LABELS !== 'undefined') ? SKILL_CATEGORY_LABELS : {};
      const rows = order
        .filter(cat => grouped[cat]?.length)
        .map(cat => `
          <div class="skill-category-row">
            <span class="skill-category-label">${labels[cat] || cat}</span>
            <div class="skill-category-chips">
              ${grouped[cat].sort().map(s => `<span class="skill-chip">${s}</span>`).join('')}
            </div>
          </div>
        `).join('');
      const extraRow = uncategorized.length ? `
        <div class="skill-category-row">
          <span class="skill-category-label">Other</span>
          <div class="skill-category-chips">
            ${uncategorized.sort().map(s => `<span class="skill-chip">${s}</span>`).join('')}
          </div>
        </div>
      ` : '';
      return `
        <div class="detail-section">
          <div class="detail-section-title">Skills</div>
          <div class="skills-by-category">${rows}${extraRow}</div>
        </div>
      `;
    })() : ''}

    ${char.perks?.length ? `
    <div class="detail-section">
      <div class="detail-section-title">Perks</div>
      <div class="skills-list">
        ${char.perks.map(p => `<span class="skill-chip skill-chip-perk">${p}</span>`).join('')}
      </div>
    </div>
    ` : ''}

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
  const oldHP     = char.maxHP ?? computeMaxHP(char.class, char.kit, char.level ?? 1, char.kit2);
  const newHP     = computeMaxHP(char.class, char.kit, newLevel, char.kit2);
  const oldChars  = char.characteristics ?? {};
  const newChars  = computeCharacteristicsForLevel(baseChars, newLevel);
  const oldResMax = getHeroicResourceMax(char.level ?? 1);
  const newResMax = getHeroicResourceMax(newLevel);
  return { oldHP, newHP, oldChars, newChars, oldResMax, newResMax };
}

// ── Level-up multi-step flow ──────────────────────────────────────────────────
// Replaces the single-modal level-up with a step-through selection flow.

let _lvlFlow = null; // active flow state

function showLevelUpFlow() {
  const char = AppState.currentCharacter;
  if (!char) return;
  const currentLevel = char.level ?? 1;
  if (currentLevel >= 10) { showToast('Your hero has reached the maximum level.', 'info'); return; }
  const newLevel = currentLevel + 1;
  const changes  = previewLevelUp(char, newLevel);
  const features = CLASS_LEVEL_FEATURES?.[char.class]?.[newLevel] ?? { gains: [] };

  // Build ordered step list
  const steps = [{ type: 'summary' }];
  for (const gain of features.gains) {
    if (gain === 'heroic_ability_3') steps.push({ type: 'heroic_ability', cost: 3 });
    else if (gain === 'heroic_ability_5') steps.push({ type: 'heroic_ability', cost: 5 });
    else if (gain === 'heroic_ability_7') steps.push({ type: 'heroic_ability', cost: 7 });
    else if (gain === 'heroic_ability_9') steps.push({ type: 'heroic_ability', cost: 9 });
    else if (gain === 'perk')             steps.push({ type: 'perk' });
    else if (gain === 'skill')            steps.push({ type: 'skill' });
    else if (gain === 'kit_improvement')  steps.push({ type: 'kit_improvement' });
    else if (gain === 'doctrine_feature') steps.push({ type: 'doctrine_feature' });
    else if (gain === 'epic_resource')    steps.push({ type: 'epic_resource' });
  }
  steps.push({ type: 'confirm' });

  _lvlFlow = {
    char, newLevel, changes, features,
    steps,
    stepIndex: 0,
    selections: { abilityIds: [], perks: [], skills: [] },
    // Cached Firestore results for ability steps (keyed by cost)
    _abilityCache: {},
  };

  showModal('<div class="lvlup-flow" id="lvlup-flow-root"></div>');
  _renderLvlStep();
}

function _lvlFlowNav(direction) {
  if (!_lvlFlow) return;
  const { steps } = _lvlFlow;
  const targetIdx = _lvlFlow.stepIndex + direction;
  if (targetIdx < 0 || targetIdx >= steps.length) return;
  _lvlFlow.stepIndex = targetIdx;
  _renderLvlStep();
}

function _setLvlFlowContent(html) {
  const root = document.getElementById('lvlup-flow-root');
  if (root) root.innerHTML = html;
}

function _renderLvlStep() {
  const f = _lvlFlow;
  if (!f) return;
  const step = f.steps[f.stepIndex];
  const isFirst = f.stepIndex === 0;
  const isLast  = f.stepIndex === f.steps.length - 1;
  const meta    = CLASS_COLORS[f.char.class] || { accent: '#2980B9' };
  const accent  = meta.accent;

  const navHTML = (nextLabel = 'Continue', nextDisabled = false) => `
    <div class="lvlup-nav">
      ${!isFirst ? `<button class="btn btn-ghost" onclick="_lvlFlowNav(-1)">← Back</button>` : `<button class="btn btn-ghost" onclick="hideModal()">Cancel</button>`}
      <button class="btn btn-primary" id="lvlup-next-btn" ${nextDisabled ? 'disabled' : ''} onclick="_lvlFlowNav(1)">${nextLabel}</button>
    </div>
  `;

  if (step.type === 'summary') {
    _lvlFlowRenderSummary(f, accent, isLast, navHTML);
  } else if (step.type === 'heroic_ability') {
    _lvlFlowRenderAbilityPicker(f, step.cost, accent, navHTML);
  } else if (step.type === 'perk') {
    _lvlFlowRenderPerkPicker(f, accent, navHTML);
  } else if (step.type === 'skill') {
    _lvlFlowRenderSkillPicker(f, accent, navHTML);
  } else if (step.type === 'kit_improvement') {
    _lvlFlowRenderAutoStep(f, accent, navHTML, 'Kit Improvement',
      `Your kit bonuses scale with your echelon. At level ${f.newLevel} you enter Echelon ${getEchelon(f.newLevel)} — your kit's Stamina bonus increases automatically. No selection needed.`);
  } else if (step.type === 'doctrine_feature') {
    _lvlFlowRenderAutoStep(f, accent, navHTML, 'Subclass Feature',
      `Your ${f.char.subclass || f.char.class} subclass grants a new feature at level ${f.newLevel}. This feature is automatic — no selection needed. Refer to your class book for details.`);
  } else if (step.type === 'epic_resource') {
    const resName = meta.resource || 'Resource';
    _lvlFlowRenderAutoStep(f, accent, navHTML, 'Epic Resource',
      `At level 10, your ${resName} maximum increases to 12 — the epic tier. This is automatic; your resource bar will update when you confirm.`);
  } else if (step.type === 'confirm') {
    _lvlFlowRenderConfirm(f, accent);
  }
}

function _lvlFlowRenderSummary(f, accent, isLast, navHTML) {
  const { changes, newLevel } = f;
  const hpDelta = changes.newHP - changes.oldHP;
  const charRows = ['MGT', 'AGL', 'REA', 'INU', 'PRS'].map(stat => {
    const was = changes.oldChars[stat] ?? 0;
    const now = changes.newChars[stat] ?? 0;
    const changed = now > was;
    return `<div class="levelup-stat-row ${changed ? 'levelup-stat-changed' : ''}">
      <span class="levelup-stat-label">${CHAR_LABELS[stat]}</span>
      <span class="levelup-stat-val">${was}${changed ? ` → <strong>${now}</strong>` : ''}</span>
    </div>`;
  }).join('');
  const resChange = changes.newResMax > changes.oldResMax
    ? `<div class="levelup-change-row"><span class="levelup-change-label">Resource Max</span><span class="levelup-change-val levelup-val-up">${changes.oldResMax} → ${changes.newResMax}</span></div>`
    : '';
  const choiceSteps = f.steps.filter(s => ['heroic_ability','perk','skill'].includes(s.type));
  const choiceList = choiceSteps.length ? `
    <div class="lvlup-choices-ahead">
      <div class="lvlup-choices-label">You'll also choose:</div>
      ${choiceSteps.map(s => {
        if (s.type === 'heroic_ability') return `<div class="lvlup-choice-item">⚔ A new ${s.cost}-cost class ability</div>`;
        if (s.type === 'perk')          return `<div class="lvlup-choice-item">★ A perk</div>`;
        if (s.type === 'skill')         return `<div class="lvlup-choice-item">◎ A new skill</div>`;
        return '';
      }).join('')}
    </div>
  ` : '';

  _setLvlFlowContent(`
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color:${accent}">
        <span class="levelup-subtitle">LEVEL UP</span>
        <span class="levelup-number" style="color:${accent}">${newLevel}</span>
      </div>
      <div class="lvlup-section-label">Automatic gains</div>
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
      ${choiceList}
      ${navHTML(choiceSteps.length ? 'Make Selections →' : 'Confirm')}
    </div>
  `);
}

async function _lvlFlowRenderAbilityPicker(f, cost, accent, navHTML) {
  const meta = CLASS_COLORS[f.char.class] || { resource: 'Resource' };
  // Show loading state immediately
  _setLvlFlowContent(`
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color:${accent}">
        <span class="levelup-subtitle">NEW ABILITY</span>
        <span class="levelup-number" style="color:${accent}">L${f.newLevel}</span>
      </div>
      <p class="loading-text">Loading abilities...</p>
    </div>
  `);

  // Use cache if available
  if (!f._abilityCache[cost]) {
    try {
      const snap = await db.collection('abilities')
        .where('class', '==', f.char.class)
        .where('cost', '==', cost)
        .get();
      f._abilityCache[cost] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('Error loading abilities for level-up:', e);
      f._abilityCache[cost] = [];
    }
  }

  const pool = f._abilityCache[cost].filter(a =>
    !f.char.abilityIds?.includes(a.id) &&
    !f.selections.abilityIds.includes(a.id)
  );

  // Find any already-selected ability for this cost tier in this flow
  // (in case user navigated back)
  const alreadySelected = f.selections.abilityIds.find(id =>
    f._abilityCache[cost]?.some(a => a.id === id)
  );

  const cardsHTML = pool.length ? pool.map(a => {
    const sel = alreadySelected === a.id;
    const summaryText = a.tier2 || (a.effect ? a.effect.split(/\.\s+/)[0] + '.' : '—');
    return `
      <button class="ability-pick-card ${sel ? 'selected' : ''}" data-ability-id="${a.id}">
        <div class="ability-pick-header">
          <span class="ability-pick-name">${a.name}</span>
          <div class="ability-pick-meta">
            <span class="ability-pick-type">${a.type}</span>
            <span class="ability-pick-cost">${cost} ${meta.resource}</span>
          </div>
        </div>
        ${summaryText !== '—' ? `<div class="ability-pick-desc">${summaryText}</div>` : ''}
      </button>`;
  }).join('') : `<p class="summary-empty">No ${cost}-cost abilities found for ${f.char.class}. They may not be seeded yet.</p>`;

  _setLvlFlowContent(`
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color:${accent}">
        <span class="levelup-subtitle">NEW ABILITY</span>
        <span class="levelup-number" style="color:${accent}">L${f.newLevel}</span>
      </div>
      <p class="lvlup-step-hint">Choose one new ${cost}-cost ${f.char.class} ability.</p>
      <div class="lvlup-ability-pool" id="lvlup-ability-pool">
        ${cardsHTML}
      </div>
      ${navHTML('Continue →', !alreadySelected && pool.length > 0)}
    </div>
  `);

  // Wire card clicks
  document.getElementById('lvlup-ability-pool')?.querySelectorAll('[data-ability-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.abilityId;
      // Remove any previously chosen ability from this tier
      f.selections.abilityIds = f.selections.abilityIds.filter(sid =>
        !f._abilityCache[cost]?.some(a => a.id === sid)
      );
      f.selections.abilityIds.push(id);
      // Re-render to show selection + enable next
      _renderLvlStep();
    });
  });
}

function _lvlFlowRenderPerkPicker(f, accent, navHTML) {
  const existingPerks = f.char.perks ?? [];
  const alreadyChosen = f.selections.perks[0]; // at most one perk per level

  const typeOrder = ['exploration', 'interpersonal', 'intrigue', 'lore', 'supernatural', 'crafting'];
  const grouped = {};
  for (const p of (PERKS_DATA ?? [])) {
    if (!grouped[p.type]) grouped[p.type] = [];
    grouped[p.type].push(p);
  }

  const listHTML = typeOrder.map(type => {
    const perks = grouped[type] || [];
    if (!perks.length) return '';
    return `
      <div class="lvlup-perk-group">
        <div class="lvlup-perk-group-label">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
        ${perks.map(p => {
          const alreadyHave = existingPerks.includes(p.name);
          const selected    = alreadyChosen === p.name;
          return `
            <button class="lvlup-perk-row ${selected ? 'selected' : ''} ${alreadyHave ? 'at-limit' : ''}"
                    data-perk="${p.name}" ${alreadyHave ? 'disabled title="Already have this perk"' : ''}>
              <span class="lvlup-perk-name">${p.name}</span>
              <span class="lvlup-perk-desc">${p.desc}</span>
            </button>`;
        }).join('')}
      </div>`;
  }).join('');

  _setLvlFlowContent(`
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color:${accent}">
        <span class="levelup-subtitle">CHOOSE A PERK</span>
        <span class="levelup-number" style="color:${accent}">L${f.newLevel}</span>
      </div>
      <p class="lvlup-step-hint">Choose one perk. Perks grant a skill and a +2 bonus to tests using it.</p>
      <div class="lvlup-perk-list" id="lvlup-perk-list">
        ${listHTML}
      </div>
      ${navHTML('Continue →', !alreadyChosen)}
    </div>
  `);

  document.getElementById('lvlup-perk-list')?.querySelectorAll('[data-perk]').forEach(btn => {
    btn.addEventListener('click', () => {
      f.selections.perks = [btn.dataset.perk];
      _renderLvlStep();
    });
  });
}

function _lvlFlowRenderSkillPicker(f, accent, navHTML) {
  const existingSkills = [
    ...(f.char.skills ?? []),
    ...(f.selections.skills ?? []),
  ];
  const alreadyChosen = f.selections.skills[0];

  const pool = (LEVEL_UP_SKILL_POOL ?? []).filter(s => !existingSkills.includes(s));

  const skillsHTML = pool.length ? pool.map(s => `
    <button class="skill-pick-btn ${alreadyChosen === s ? 'selected' : ''} ${alreadyChosen && alreadyChosen !== s ? 'at-limit' : ''}"
            data-skill="${s}">${s}</button>
  `).join('') : '<p class="summary-empty">No new skills available.</p>';

  _setLvlFlowContent(`
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color:${accent}">
        <span class="levelup-subtitle">NEW SKILL</span>
        <span class="levelup-number" style="color:${accent}">L${f.newLevel}</span>
      </div>
      <p class="lvlup-step-hint">Choose one new skill to add to your hero.</p>
      <div class="skill-pick-grid" id="lvlup-skill-grid" style="margin-top:12px">
        ${skillsHTML}
      </div>
      ${navHTML('Continue →', !alreadyChosen && pool.length > 0)}
    </div>
  `);

  document.getElementById('lvlup-skill-grid')?.querySelectorAll('[data-skill]').forEach(btn => {
    btn.addEventListener('click', () => {
      f.selections.skills = [btn.dataset.skill];
      _renderLvlStep();
    });
  });
}

function _lvlFlowRenderAutoStep(f, accent, navHTML, title, bodyText) {
  _setLvlFlowContent(`
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color:${accent}">
        <span class="levelup-subtitle">${title.toUpperCase()}</span>
        <span class="levelup-number" style="color:${accent}">L${f.newLevel}</span>
      </div>
      <p class="lvlup-auto-text">${bodyText}</p>
      ${navHTML('Continue')}
    </div>
  `);
}

function _lvlFlowRenderConfirm(f, accent) {
  const meta = CLASS_COLORS[f.char.class] || { resource: 'Resource' };
  const { changes, newLevel, selections } = f;
  const hpDelta = changes.newHP - changes.oldHP;

  const abilityNames = selections.abilityIds.map(id => {
    for (const cache of Object.values(f._abilityCache)) {
      const a = cache.find(x => x.id === id);
      if (a) return a.name;
    }
    return id;
  });

  _setLvlFlowContent(`
    <div class="levelup-modal">
      <div class="levelup-header" style="border-bottom-color:${accent}">
        <span class="levelup-subtitle">READY</span>
        <span class="levelup-number" style="color:${accent}">${newLevel}</span>
      </div>
      <div class="lvlup-confirm-list">
        <div class="lvlup-confirm-row">
          <span class="lvlup-confirm-label">Stamina</span>
          <span class="lvlup-confirm-val lvlup-val-up">+${hpDelta}</span>
        </div>
        ${changes.newResMax > changes.oldResMax ? `
        <div class="lvlup-confirm-row">
          <span class="lvlup-confirm-label">${meta.resource} Max</span>
          <span class="lvlup-confirm-val lvlup-val-up">${changes.oldResMax} → ${changes.newResMax}</span>
        </div>` : ''}
        ${abilityNames.map(n => `
        <div class="lvlup-confirm-row">
          <span class="lvlup-confirm-label">New Ability</span>
          <span class="lvlup-confirm-val">${n}</span>
        </div>`).join('')}
        ${selections.perks.map(p => `
        <div class="lvlup-confirm-row">
          <span class="lvlup-confirm-label">Perk</span>
          <span class="lvlup-confirm-val">${p}</span>
        </div>`).join('')}
        ${selections.skills.map(s => `
        <div class="lvlup-confirm-row">
          <span class="lvlup-confirm-label">New Skill</span>
          <span class="lvlup-confirm-val">${s}</span>
        </div>`).join('')}
      </div>
      <div class="lvlup-nav">
        <button class="btn btn-ghost" onclick="_lvlFlowNav(-1)">← Back</button>
        <button class="btn btn-primary" id="lvlup-apply-btn">Apply Level Up</button>
      </div>
    </div>
  `);

  document.getElementById('lvlup-apply-btn')?.addEventListener('click', () => {
    performLevelUp(f.char, f.newLevel, f.changes, f.selections);
  });
}

async function performLevelUp(char, newLevel, changes, selections = {}) {
  const hpIncrease   = changes.newHP - (char.maxHP ?? 0);
  const newCurrentHP = Math.min(changes.newHP, (char.currentHP ?? 0) + hpIncrease);
  const newResMax    = changes.newResMax;

  char.level           = newLevel;
  char.maxHP           = changes.newHP;
  char.currentHP       = newCurrentHP;
  char.characteristics = changes.newChars;
  char.heroicResource  = { ...char.heroicResource, max: newResMax };

  // Apply selections
  const newAbilityIds = [...(char.abilityIds ?? [])];
  for (const id of (selections.abilityIds ?? [])) {
    if (!newAbilityIds.includes(id)) newAbilityIds.push(id);
  }
  char.abilityIds = newAbilityIds;

  const newPerks = [...(char.perks ?? [])];
  for (const p of (selections.perks ?? [])) {
    if (!newPerks.includes(p)) newPerks.push(p);
  }
  char.perks = newPerks;

  const newSkills = [...(char.skills ?? [])];
  for (const s of (selections.skills ?? [])) {
    if (!newSkills.includes(s)) newSkills.push(s);
  }
  char.skills = newSkills;

  // Perk skills are also added to char.skills (deduped)
  for (const perkName of (selections.perks ?? [])) {
    if (!newSkills.includes(perkName)) newSkills.push(perkName);
  }
  char.skills = newSkills;

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
  _lvlFlow = null;
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
      abilityIds:           char.abilityIds,
      perks:                char.perks,
      skills:               char.skills,
    });

  showToast(`${char.name} reached Level ${newLevel}!`, 'success');
}

// Expose nav and apply functions globally (called from inline onclick)
window._lvlFlowNav = _lvlFlowNav;

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
    document.getElementById('levelup-btn')?.addEventListener('click', showLevelUpFlow);
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
  { name: 'Arcane Archer',   role: 'Ranged',     desc: 'No armor · Bow · Exploding magic arrows' },
  { name: 'Battlemind',      role: 'Defender',   desc: 'Light armor · Medium weapon · Psionic deflection' },
  { name: 'Cloak and Dagger',role: 'Skirmisher', desc: 'Light armor · Two light weapons · Hit and fade' },
  { name: 'Dual Wielder',    role: 'Striker',    desc: 'Medium armor · Light + medium weapon · Two strikes' },
  { name: 'Guisarmier',      role: 'Controller', desc: 'Medium armor · Polearm · Extended reach' },
  { name: 'Martial Artist',  role: 'Skirmisher', desc: 'No armor · Unarmed · Acrobatic close-combat' },
  { name: 'Mountain',        role: 'Defender',   desc: 'Heavy armor · Heavy weapon · Immovable wall' },
  { name: 'Panther',         role: 'Skirmisher', desc: 'No armor · Heavy weapon · Devastating charge' },
  { name: 'Pugilist',        role: 'Brawler',    desc: 'No armor · Unarmed · Float and hit hard' },
  { name: 'Raider',          role: 'Warrior',    desc: 'Light armor · Shield + light weapon · Versatile' },
  { name: 'Ranger',          role: 'Hybrid',     desc: 'Medium armor · Bow + medium weapon · Adaptable' },
  { name: 'Rapid Fire',      role: 'Ranged',     desc: 'Light armor · Bow · Maximum arrow volume' },
  { name: 'Retiarius',       role: 'Controller', desc: 'Light armor · Net + polearm · Entangle and stab' },
  { name: 'Shining Armor',   role: 'Defender',   desc: 'Heavy armor · Shield + medium weapon · Knight' },
  { name: 'Sniper',          role: 'Ranged',     desc: 'No armor · Bow · Extreme range and patience' },
  { name: 'Spellsword',      role: 'Hybrid',     desc: 'Light armor · Shield + medium weapon · Blade + magic' },
  { name: 'Stick and Robe',  role: 'Controller', desc: 'Light armor · Polearm · Mobile reach' },
  { name: 'Swashbuckler',    role: 'Skirmisher', desc: 'Light armor · Medium weapon · Daring duelist' },
  { name: 'Sword and Board', role: 'Defender',   desc: 'Medium armor · Shield + medium weapon · Shield bash' },
  { name: 'Warrior Priest',  role: 'Support',    desc: 'Heavy armor · Light weapon · Divine smiter' },
  { name: 'Whirlwind',       role: 'Striker',    desc: 'No armor · Whip · Reach and brutal pull' },
];

// Stormwight Beast Aspect kits — Fury/Stormwight subclass only
const STORMWIGHT_KITS = [
  { name: 'Boren',  role: 'Bear Aspect', desc: 'Channel the bear: large, durable, cold-north aspect. Claws that grab, and can pull instead of push with forced movement.' },
  { name: 'Corven', role: 'Crow Aspect', desc: 'Channel the crow: fast and stealthy, anabatic wind. Burst strikes that punish enemies who surround you.' },
  { name: 'Raden',  role: 'Rat Aspect',  desc: 'Channel the rat: mobile and elusive, the rat flood. Quick pounces that push enemies back.' },
  { name: 'Vuken',  role: 'Wolf Aspect', desc: 'Channel the wolf: fleet-footed hunter, the thunderstorm. Attacks that knock enemies prone.' },
];

const KIT_STAMINA = {
  'Arcane Archer': 0,   'Battlemind': 3,      'Cloak and Dagger': 3,
  'Dual Wielder': 6,    'Guisarmier': 6,      'Martial Artist': 3,
  'Mountain': 9,        'Panther': 6,          'Pugilist': 6,
  'Raider': 6,          'Ranger': 6,           'Rapid Fire': 3,
  'Retiarius': 3,       'Shining Armor': 12,   'Sniper': 0,
  'Spellsword': 6,      'Stick and Robe': 3,   'Swashbuckler': 3,
  'Sword and Board': 9, 'Warrior Priest': 9,   'Whirlwind': 0,
  // Stormwight Beast Aspect kits
  'Boren': 9, 'Corven': 3, 'Raden': 3, 'Vuken': 9,
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

// COMPLICATIONS is defined in wizard-data.js (full d100 table)

// Max recoveries per class (refill on Respite — 24hr rest)
const CLASS_RECOVERIES = {
  Beastheart: 12,
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
  Beastheart:   'A beast master whose companion tracks Ferocity — a shared resource powering both hero and beast. Together you share a turn and devastate enemies through coordinated strikes.',
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
  Beastheart: 21,
  Conduit: 18, Elementalist: 18, Fury: 24,
  Null: 21, Shadow: 18, Tactician: 21, Talent: 18,
};

// Additional Stamina gained per level after level 1
const CLASS_STAMINA_PER_LEVEL = {
  Beastheart: 12,
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

function computeMaxHP(cls, kit, level, kit2) {
  const base     = CLASS_BASE_STAMINA[cls] ?? 18;
  const perLevel = CLASS_STAMINA_PER_LEVEL[cls] ?? 6;
  const echelon  = getEchelon(level);
  const bonus1   = getKitStaminaForEchelon(kit, echelon);
  const bonus2   = kit2 ? getKitStaminaForEchelon(kit2, echelon) : 0;
  // Tactician Field Arsenal: use the better kit bonus, not additive.
  // Non-kit classes (Conduit, Elementalist, Null, Talent): kit is null → bonus1 = 0.
  // Fury/Stormwight: kit = beast aspect name (e.g. 'Boren') → bonus from KIT_STAMINA.
  // TODO: Fury Berserker/Reaver aspects add stamina similar to kits,
  //       but exact values aren't yet verified. Currently p.kit = null for those
  //       subclasses so they use base stamina only (no aspect bonus).
  const kitBonus = Math.max(bonus1, bonus2);
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

// Suggested characteristic spread per class (each sums to 5, max 2 per primary stat)
const CLASS_CHARACTERISTICS = {
  Fury:         { MGT: 2, AGL: 2, REA: 0, INU: 1, PRS: 0 },
  Tactician:    { MGT: 2, AGL: 0, REA: 2, INU: 1, PRS: 0 },
  Shadow:       { MGT: 0, AGL: 2, REA: 1, INU: 2, PRS: 0 },
  Conduit:      { MGT: 0, AGL: 0, REA: 1, INU: 2, PRS: 2 },
  Elementalist: { MGT: 0, AGL: 0, REA: 2, INU: 2, PRS: 1 },
  Null:         { MGT: 2, AGL: 0, REA: 2, INU: 0, PRS: 1 }, // primaries: MGT, REA
  Talent:       { MGT: 0, AGL: 1, REA: 0, INU: 2, PRS: 2 }, // primaries: INU, PRS
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
    class: null, kit: null,
    characteristics: { MGT: 0, AGL: 0, REA: 0, INU: 0, PRS: 0 },
    ancestryTraits: [],
    cultureEnvironment: null, cultureOrganization: null, cultureUpbringing: null,
    subclass: null,
    abilityIds: [],
    _step: 1, _charsReady: false,
    _sigAbilityIds: [], _heroic3AbilityIds: [], _heroic5AbilityIds: [],
    _sigPoolHasData: false, _heroic3PoolHasData: false, _heroic5PoolHasData: false,
    _complicationId: null, _complicationName: null,
    _classSkills: [],
    // Skill collection fields
    _cultureSkill_env: null,
    _cultureSkill_org: null,
    _cultureSkill_upb: null,
    _cultureSkill_anc: null,
    _careerChosenSkills: [],
    _subclassSkill: null,
    // Beastheart-specific
    _companionSpecies: null,
    _drakeElement:     null,
    // Fury-specific
    _furyAspect:       null,
    // Revenant-specific
    _revenantFormerLife: null,
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

    // Former Life picker — Revenant only
    if (ancestryName === 'Revenant') {
      const flSection = document.createElement('div');
      flSection.className = 'former-life-section';
      flSection.innerHTML = `
        <div class="former-life-title">◆ Former Life</div>
        <p class="former-life-note">As a Revenant you were once a member of another ancestry. Choose the ancestry you belonged to in life — your Previous Life traits draw from that ancestry's trait list.</p>
        <div class="former-life-grid">
          ${(typeof REVENANT_FORMER_LIFE_OPTIONS !== 'undefined' ? REVENANT_FORMER_LIFE_OPTIONS : []).map(name => `
            <button class="former-life-btn ${p._revenantFormerLife === name ? 'selected' : ''}"
                    data-fl="${name}">${name}</button>
          `).join('')}
        </div>
      `;
      panel.appendChild(flSection);

      flSection.querySelectorAll('.former-life-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          p._revenantFormerLife = btn.dataset.fl;
          flSection.querySelectorAll('.former-life-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    }
  }

  document.getElementById('ancestry-grid').querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('ancestry-grid').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (p.ancestry !== btn.dataset.pick) {
        p.ancestry = btn.dataset.pick;
        p.ancestryTraits = [];
        p._revenantFormerLife = null; // clear if switching away from Revenant
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

  const ancestryOpts = p.ancestry
    ? (typeof ANCESTRY_CULTURES !== 'undefined' ? (ANCESTRY_CULTURES[p.ancestry] || []) : [])
    : [];
  const ancestrySection = ancestryOpts.length > 0
    ? sectionHTML('Ancestry Heritage', 'How did your ancestry shape your upbringing?', ancestryOpts, 'cultureAncestry')
    : `<div class="culture-section">
        <div class="culture-section-header">
          <span class="culture-section-title">Ancestry Heritage</span>
          <span class="culture-section-hint">How did your ancestry shape your upbringing?</span>
        </div>
        <p class="wizard-hint" style="margin:8px 0; color: var(--text-secondary);">${
          p.ancestry
            ? `No specific heritage options available for ${p.ancestry}.`
            : 'Select your ancestry in Step 2 to see heritage options for your people.'
        }</p>
      </div>`;

  body.innerHTML =
    sectionHTML('Environment', 'Where did your community live?', CULTURE_ENVIRONMENTS, 'cultureEnvironment') +
    sectionHTML('Organization', 'How was your community governed?', CULTURE_ORGANIZATIONS, 'cultureOrganization') +
    sectionHTML('Upbringing', 'How were you raised?', CULTURE_UPBRINGINGS, 'cultureUpbringing') +
    ancestrySection;

  // Maps pendingCharacter field → culture data array → skill key on p
  const CULTURE_SKILL_MAP = {
    cultureEnvironment:  { data: CULTURE_ENVIRONMENTS,  key: '_cultureSkill_env' },
    cultureOrganization: { data: CULTURE_ORGANIZATIONS, key: '_cultureSkill_org' },
    cultureUpbringing:   { data: CULTURE_UPBRINGINGS,   key: '_cultureSkill_upb' },
    cultureAncestry:     { data: ancestryOpts,           key: '_cultureSkill_anc' },
  };

  body.querySelectorAll('[data-pick][data-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      body.querySelectorAll(`[data-field="${field}"]`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      p[field] = btn.dataset.pick;
      // Also capture the quickBuild skill for this layer
      const map = CULTURE_SKILL_MAP[field];
      if (map) {
        const entry = map.data.find(e => e.name === btn.dataset.pick);
        p[map.key] = entry?.quickBuild || null;
      }
    });
  });

  // Restore previously captured skills if re-entering step 3
  ['cultureEnvironment', 'cultureOrganization', 'cultureUpbringing', 'cultureAncestry'].forEach(field => {
    const map = CULTURE_SKILL_MAP[field];
    if (p[field] && map && !p[map.key]) {
      const entry = map.data.find(e => e.name === p[field]);
      p[map.key] = entry?.quickBuild || null;
    }
  });
}

// ── Step 4: Career ────────────────────────────────────────────────────────────

function _step4(body) {
  const p = AppState.pendingCharacter;

  // Build a pool of skill names for the given categories
  function skillsForCategories(categories) {
    return Object.entries(SKILL_CATEGORIES)
      .filter(([, cat]) => categories.includes(cat))
      .map(([name]) => name)
      .sort();
  }

  function careerSkillPickerHTML(c) {
    if (!c?.chooseSkills) return '';
    const { count, categories } = c.chooseSkills;
    const chosen = p._careerChosenSkills || [];
    const pool   = skillsForCategories(categories);
    // Exclude fixed skills already granted
    const available = pool.filter(s => !(c.fixedSkills || []).includes(s));
    return `
      <div class="class-skill-section" style="margin-top:14px">
        <div class="class-skill-header">
          <span class="class-skill-title">Choose Skills</span>
          <span class="pool-quota ${chosen.length >= count ? 'quota-met' : ''}">
            ${chosen.length} / ${count} selected
          </span>
        </div>
        <p class="wizard-hint" style="margin:4px 0 8px">
          Pick ${count} skill${count !== 1 ? 's' : ''} from:
          <strong>${categories.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' or ')}</strong>
        </p>
        <div class="skill-pick-grid" id="career-skill-grid">
          ${available.map(skill => `
            <button class="skill-pick-btn ${chosen.includes(skill) ? 'selected' : ''} ${chosen.length >= count && !chosen.includes(skill) ? 'at-limit' : ''}"
                    data-skill="${skill}">${skill}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

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
        ${careerSkillPickerHTML(c)}
      </div>
    `;
  }

  function wireCareerSkillPicker(c) {
    const grid = document.getElementById('career-skill-grid');
    if (!grid || !c?.chooseSkills) return;
    const { count } = c.chooseSkills;
    grid.querySelectorAll('[data-skill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const skill = btn.dataset.skill;
        const idx   = p._careerChosenSkills.indexOf(skill);
        if (idx >= 0) {
          p._careerChosenSkills.splice(idx, 1);
        } else if (p._careerChosenSkills.length < count) {
          p._careerChosenSkills.push(skill);
        }
        // Re-render right panel to update quota and button states
        document.getElementById('career-right').innerHTML = careerDetailHTML(c);
        wireCareerSkillPicker(c);
      });
    });
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

  // Wire skill picker for initially selected career
  wireCareerSkillPicker(CAREER_DATA.find(c => c.name === p.career));

  document.getElementById('career-list').querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('career-list').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      p.career = btn.dataset.pick;
      // Reset career skill choices when career changes
      p._careerChosenSkills = [];
      const career = CAREER_DATA.find(c => c.name === p.career);
      document.getElementById('career-right').innerHTML = careerDetailHTML(career);
      wireCareerSkillPicker(career);
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
    const skillGrant = CLASS_SKILL_GRANTS?.[className];
    const chosenSkills = p._classSkills || [];
    const skillPickHTML = skillGrant ? `
      <div class="class-skill-section">
        <div class="class-skill-header">
          <span class="class-skill-title">Class Skills</span>
          <span class="pool-quota ${chosenSkills.length >= skillGrant.choose ? 'quota-met' : ''}">
            ${chosenSkills.length} / ${skillGrant.choose} selected
          </span>
        </div>
        <p class="wizard-hint" style="margin:4px 0 8px">
          Always gains: <strong>${skillGrant.fixed.join(', ')}</strong><br>
          Choose ${skillGrant.choose} more:
        </p>
        <div class="skill-pick-grid" id="class-skill-grid">
          ${skillGrant.pool.map(skill => `
            <button class="skill-pick-btn ${chosenSkills.includes(skill) ? 'selected' : ''} ${chosenSkills.length >= skillGrant.choose && !chosenSkills.includes(skill) ? 'at-limit' : ''}"
                    data-skill="${skill}">${skill}</button>
          `).join('')}
        </div>
      </div>
    ` : '';

    // Beastheart-only: companion species picker with rich cards
    const companionPickHTML = className === 'Beastheart' ? (() => {
      const species = typeof BEASTHEART_COMPANION_SPECIES !== 'undefined'
        ? BEASTHEART_COMPANION_SPECIES : [];
      const selectedSpec = species.find(c => c.name === p._companionSpecies);

      const drakeElementHTML = (p._companionSpecies === 'Drake') ? `
        <div class="drake-element-section" id="drake-element-section">
          <div class="drake-element-title">Drake's Elemental Attunement</div>
          <div class="drake-element-grid">
            ${(selectedSpec?.subChoiceOptions || []).map(el => `
              <button class="drake-element-btn ${p._drakeElement === el ? 'selected' : ''}"
                      data-element="${el}">${el}</button>
            `).join('')}
          </div>
          <p class="drake-element-hint">Both you and your drake gain Immunity 3 to this damage type.</p>
        </div>
      ` : '';

      return `
        <div class="companion-picker-section">
          <div class="companion-picker-title">
            Choose Your Companion
            ${p._companionSpecies ? ' <span style="color:var(--color-gold)">✓</span>' : ''}
          </div>
          ${species.map(c => `
            <div class="companion-card ${p._companionSpecies === c.name ? 'selected' : ''}"
                 data-companion="${c.name}" id="companion-card-${c.name.replace(/\s+/g, '-')}">
              <div class="companion-card-header">
                <span class="companion-name">${c.name}</span>
                <span class="companion-badge companion-badge-type">${c.type}</span>
                <span class="companion-badge companion-badge-size">Size ${c.size}</span>
                <span class="companion-badge companion-badge-role">${c.role}</span>
              </div>
              ${c.heroBenefit ? `<div class="companion-hero-benefit">★ ${c.heroBenefit}</div>` : ''}
              <div class="companion-desc">${c.desc}</div>
              <span class="companion-detail-toggle"
                    data-companion-toggle="${c.name.replace(/\s+/g, '-')}">▼ Show abilities</span>
              <div class="companion-details" id="companion-detail-${c.name.replace(/\s+/g, '-')}">
                <div class="companion-detail-label">Special Trait</div>
                <div class="companion-detail-text">${c.specialTrait}</div>
                <div class="companion-detail-label">Signature Maneuver</div>
                <div class="companion-detail-text">${c.signatureManeuver}</div>
              </div>
            </div>
          `).join('')}
          ${drakeElementHTML}
        </div>
      `;
    })() : '';

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
      ${skillPickHTML}
      ${companionPickHTML}
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
    const subs = CLASS_SUBCLASSES[p.class] || [];
    document.getElementById('subclass-list')?.querySelectorAll('[data-subclass]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('subclass-list').querySelectorAll('[data-subclass]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        p.subclass = btn.dataset.subclass;
        // Capture the subclass skill
        const sub = subs.find(s => s.name === btn.dataset.subclass);
        p._subclassSkill = sub?.skill || null;
      });
    });
    // Restore _subclassSkill if subclass already chosen (re-entering step)
    if (p.subclass && !p._subclassSkill) {
      const sub = subs.find(s => s.name === p.subclass);
      p._subclassSkill = sub?.skill || null;
    }
  }

  document.getElementById('class-grid').querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('class-grid').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (p.class !== btn.dataset.pick) {
        p.class = btn.dataset.pick;
        p.subclass = null;
        p._charsReady = false;
        // Clear any previous ability, skill, and subclass selections when class changes
        p._sigAbilityIds = [];
        p._heroic3AbilityIds = [];
        p._heroic5AbilityIds = [];
        p._sigPoolHasData = false;
        p._heroic3PoolHasData = false;
        p._heroic5PoolHasData = false;
        p.abilityIds = [];
        p._classSkills = [];
        p._subclassSkill = null;
        p._companionSpecies = null;
        p._drakeElement = null;
      }
      document.getElementById('class-right').innerHTML = rightPanelHTML(p.class);
      wireSubclassList();
      wireClassSkillPicker();
      wireCompanionPicker();
    });
  });

  wireSubclassList();
  wireClassSkillPicker();
  wireCompanionPicker();

  function wireCompanionPicker() {
    // Use event delegation on the section — one listener handles all interactions.
    // This is more reliable on mobile than per-element listeners on div elements.
    const section = document.querySelector('.companion-picker-section');
    if (!section) return;

    section.addEventListener('click', e => {
      // Drake element button clicked
      const elementBtn = e.target.closest('[data-element]');
      if (elementBtn) {
        p._drakeElement = elementBtn.dataset.element;
        document.getElementById('class-right').innerHTML = rightPanelHTML(p.class);
        wireSubclassList();
        wireClassSkillPicker();
        wireCompanionPicker();
        return;
      }

      // Expand/collapse toggle clicked
      const toggle = e.target.closest('[data-companion-toggle]');
      if (toggle) {
        const id = toggle.dataset.companionToggle;
        const detail = document.getElementById(`companion-detail-${id}`);
        if (!detail) return;
        const open = detail.classList.toggle('open');
        toggle.textContent = open ? '▲ Hide abilities' : '▼ Show abilities';
        return;
      }

      // Companion card clicked — select this companion species
      const card = e.target.closest('[data-companion]');
      if (card) {
        const name = card.dataset.companion;
        if (p._companionSpecies === name) return;
        p._companionSpecies = name;
        if (name !== 'Drake') p._drakeElement = null;
        document.getElementById('class-right').innerHTML = rightPanelHTML(p.class);
        wireSubclassList();
        wireClassSkillPicker();
        wireCompanionPicker();
      }
    });
  }

  function wireClassSkillPicker() {
    const grid = document.getElementById('class-skill-grid');
    if (!grid) return;
    const grant = CLASS_SKILL_GRANTS?.[p.class];
    if (!grant) return;
    if (!p._classSkills) p._classSkills = [];
    grid.querySelectorAll('[data-skill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const skill = btn.dataset.skill;
        const idx = p._classSkills.indexOf(skill);
        if (idx >= 0) {
          p._classSkills.splice(idx, 1);
        } else if (p._classSkills.length < grant.choose) {
          p._classSkills.push(skill);
        }
        // Re-render right panel to update quota and button states
        document.getElementById('class-right').innerHTML = rightPanelHTML(p.class);
        wireSubclassList();
        wireClassSkillPicker();
      });
    });
  }
}

// ── Step 6: Kit ───────────────────────────────────────────────────────────────

function _step6(body) {
  const p = AppState.pendingCharacter;
  const access      = (typeof CLASS_KIT_ACCESS !== 'undefined' ? CLASS_KIT_ACCESS : {})[p.class] || { type: 'none' };
  const isTactician = access.type === 'standard' && access.count === 2;

  function kitStatsHTML(kitName, slotLabel) {
    if (!kitName) {
      const placeholder = slotLabel
        ? `← Select ${slotLabel} to see stats`
        : '← Select a kit to see stats';
      return `<p class="col-right-placeholder">${placeholder}</p>`;
    }
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
        ${slotLabel ? `<div class="kit-slot-badge">${slotLabel}</div>` : ''}
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

  if (access.type === 'none') {
    // ── Conduit, Elementalist, Null, Talent — no kit ─────────────────────────
    const CLASS_NO_KIT_DESC = {
      Conduit:      "Conduits draw combat power from their divine domain, not from kits. Your domain features, prayers, and holy abilities define your combat style.",
      Elementalist: "Elementalists channel raw elemental forces. Your elemental specialization determines your combat capabilities — kits don't apply.",
      Null:         "Nulls wield psychic discipline. Your tradition features provide your combat framework — kits don't apply to your class.",
      Talent:       "Talents channel psionic power through their tradition. Your tradition abilities define your combat style — kits don't apply.",
    };
    p.kit  = null;
    p.kit2 = null;
    body.innerHTML = `
      <div class="wizard-step-info-panel">
        <div class="wizard-step-icon">⚡</div>
        <h3>Kits Don't Apply to ${p.class}s</h3>
        <p class="wizard-hint">${CLASS_NO_KIT_DESC[p.class] || 'This class does not use kits.'}</p>
        <p class="wizard-hint" style="margin-top:12px; opacity:0.7">
          Your combat features come from your subclass and class abilities.
          Click <strong>Next</strong> to continue to ability selection.
        </p>
      </div>
    `;

  } else if (access.type === 'primordial_aspect') {
    // ── Fury — Primordial Aspect (subclass-specific) ──────────────────────────
    const subclass = p.subclass;
    if (!subclass) {
      body.innerHTML = `
        <div class="wizard-step-info-panel">
          <div class="wizard-step-icon">⚡</div>
          <h3>Choose Your Subclass First</h3>
          <p class="wizard-hint">Return to Step 5 and select a Fury subclass (Berserker, Reaver, or Stormwight) before choosing your Primordial Aspect.</p>
        </div>
      `;
      return;
    }

    const isStormwightSub = subclass === 'Stormwight';
    const aspects = (typeof FURY_ASPECTS !== 'undefined' ? FURY_ASPECTS[subclass] : null) || [];

    // On subclass change, clear any invalid aspect
    if (p._furyAspect && !aspects.some(a => a.name === p._furyAspect)) {
      p._furyAspect = null;
      p.kit = null;
    }

    function renderAspectRight() {
      const rightEl = document.getElementById('aspect-right');
      if (!rightEl) return;
      if (!p._furyAspect) {
        rightEl.innerHTML = '<p class="col-right-placeholder">← Select an aspect to see details</p>';
        return;
      }
      if (isStormwightSub) {
        rightEl.innerHTML = kitStatsHTML(p._furyAspect);
      } else {
        const asp = aspects.find(a => a.name === p._furyAspect);
        rightEl.innerHTML = asp ? `
          <div class="kit-stats-card">
            <div class="kit-stats-title">${asp.name}</div>
            <div class="kit-sig-ability">
              <span class="kit-sig-label">Feature</span>
              <span class="kit-sig-name">${asp.sigAbility}</span>
            </div>
            <p style="font-size:11px; color:var(--text-secondary); margin-top:8px">
              Exact combat stats (Stamina/Speed/Damage bonuses) will be added when verified from Forge Steel source data.
            </p>
          </div>
        ` : '<p class="col-right-placeholder">No data for this aspect.</p>';
      }
    }

    body.innerHTML = `
      <div class="wizard-two-col">
        <div class="wizard-col-left">
          <p class="wizard-hint" style="margin-bottom:8px">
            <strong>Primordial Aspect:</strong> As a ${subclass}, your combat style comes from your primordial aspect, not a standard kit.
            ${isStormwightSub ? 'Each aspect transforms you into a different beast form with its own signature ability.' : 'Choose the aspect that matches your fighting style.'}
          </p>
          <div class="wizard-grid wizard-grid-2" id="aspect-grid">
            ${aspects.map(a => `
              <button class="wizard-pick-btn ${p._furyAspect === a.name ? 'selected' : ''}" data-pick="${a.name}">
                <span class="pick-name">${a.name}</span>
                <span class="pick-sub">${a.role}</span>
                <span class="pick-desc">${a.desc}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="wizard-col-right" id="aspect-right">
          <!-- populated by renderAspectRight -->
        </div>
      </div>
    `;

    renderAspectRight();

    document.getElementById('aspect-grid')?.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('aspect-grid').querySelectorAll('[data-pick]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        p._furyAspect = btn.dataset.pick;
        // Stormwight aspects double as kit names for maxHP calculation
        p.kit = isStormwightSub ? btn.dataset.pick : null;
        renderAspectRight();
      });
    });

  } else if (isTactician) {
    // ── Tactician: Field Arsenal — pick two different kits ──────────────────

    // Ensure p.kit2 is initialized
    if (p.kit2 === undefined) p.kit2 = null;

    function renderTacticianKitRight() {
      const rightEl = document.getElementById('kit-right');
      if (!rightEl) return;
      if (p.kit || p.kit2) {
        rightEl.innerHTML = `
          <div class="tactician-kit-panels">
            ${kitStatsHTML(p.kit, 'Kit 1')}
            ${kitStatsHTML(p.kit2, 'Kit 2')}
          </div>
        `;
      } else {
        rightEl.innerHTML = `<p class="col-right-placeholder">← Select Kit 1 and Kit 2</p>`;
      }
    }

    body.innerHTML = `
      <div class="wizard-two-col">
        <div class="wizard-col-left">
          <p class="wizard-hint" style="margin-bottom:8px">
            <strong>Field Arsenal:</strong> Tacticians choose two kits. Your first click selects Kit 1, your second selects Kit 2. You cannot pick the same kit twice.
          </p>
          <div class="wizard-grid wizard-grid-2" id="kit-grid">
            ${KITS.map(k => {
              const isKit1 = p.kit === k.name;
              const isKit2 = p.kit2 === k.name;
              const cls = isKit1 ? 'selected kit1-selected' : isKit2 ? 'selected kit2-selected' : '';
              const badge = isKit1 ? '<span class="kit-slot-inline-badge">Kit 1</span>'
                          : isKit2 ? '<span class="kit-slot-inline-badge">Kit 2</span>' : '';
              return `
                <button class="wizard-pick-btn ${cls}" data-pick="${k.name}">
                  ${badge}
                  <span class="pick-name">${k.name}</span>
                  <span class="pick-sub">${k.role}</span>
                  <span class="pick-desc">${k.desc}</span>
                </button>`;
            }).join('')}
          </div>
        </div>
        <div class="wizard-col-right" id="kit-right">
          <!-- populated by renderTacticianKitRight -->
        </div>
      </div>
    `;

    renderTacticianKitRight();

    document.getElementById('kit-grid').querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.pick;
        if (p.kit === name) {
          p.kit = null;
        } else if (p.kit2 === name) {
          p.kit2 = null;
        } else if (!p.kit) {
          if (p.kit2 === name) return;
          p.kit = name;
        } else if (!p.kit2) {
          if (p.kit === name) {
            _flashError('You cannot pick the same kit twice.');
            return;
          }
          p.kit2 = name;
        } else {
          if (p.kit === name) {
            _flashError('You cannot pick the same kit twice.');
            return;
          }
          p.kit2 = name;
        }

        document.getElementById('kit-grid').querySelectorAll('[data-pick]').forEach(b => {
          const n = b.dataset.pick;
          const is1 = p.kit === n;
          const is2 = p.kit2 === n;
          b.className = `wizard-pick-btn${is1 ? ' selected kit1-selected' : is2 ? ' selected kit2-selected' : ''}`;
          const existingBadge = b.querySelector('.kit-slot-inline-badge');
          if (existingBadge) existingBadge.remove();
          if (is1 || is2) {
            const badge = document.createElement('span');
            badge.className = 'kit-slot-inline-badge';
            badge.textContent = is1 ? 'Kit 1' : 'Kit 2';
            b.prepend(badge);
          }
        });

        renderTacticianKitRight();
      });
    });

  } else {
    // ── Shadow, Beastheart (and future Censor, Troubadour) — standard 1-kit pick

    // Clear any invalid previously-selected kit
    if (p.kit && !KITS.some(k => k.name === p.kit)) {
      p.kit = null;
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
}

// ── Step 7: Ability Selection ─────────────────────────────────────────────────

async function _step7(body) {
  const p = AppState.pendingCharacter;
  if (!p.class) {
    body.innerHTML = '<p class="wizard-hint">Select a class first (Step 5).</p>';
    return;
  }

  const picks        = CLASS_ABILITY_PICKS[p.class] || { signatures: 1, heroic3: 1, heroic5: 1 };
  const access       = (typeof CLASS_KIT_ACCESS !== 'undefined' ? CLASS_KIT_ACCESS : {})[p.class] || { type: 'none' };
  const isTactician  = access.type === 'standard' && access.count === 2;
  const isStormwight = p.class === 'Fury' && p.subclass === 'Stormwight';

  if (!p._sigAbilityIds)     p._sigAbilityIds     = [];
  if (!p._heroic3AbilityIds) p._heroic3AbilityIds = [];
  if (!p._heroic5AbilityIds) p._heroic5AbilityIds = [];

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

    const all         = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sigPool     = all.filter(a => a.isSignature);
    const heroic3Pool = all.filter(a => !a.isSignature && a.cost === 3);
    const heroic5Pool = all.filter(a => !a.isSignature && a.cost === 5);

    p._sigPoolHasData     = sigPool.length > 0;
    p._heroic3PoolHasData = heroic3Pool.length > 0;
    p._heroic5PoolHasData = heroic5Pool.length > 0;

    function costBadge(a) {
      if (a.isSignature) return '<span class="cost-badge cost-sig">★ Sig</span>';
      if (a.cost === 3)  return '<span class="cost-badge cost-3pt">3</span>';
      if (a.cost === 5)  return '<span class="cost-badge cost-5pt">5</span>';
      return `<span class="cost-badge">${a.cost}pt</span>`;
    }

    function abilityCardHTML(a, pool, isSelected) {
      return `
        <button class="ability-pick-card ${isSelected ? 'selected' : ''}"
                data-ability-id="${a.id}" data-pool="${pool}">
          <div class="ability-pick-header">
            <span class="ability-pick-name">${a.name}</span>
            <div class="ability-pick-meta">
              ${costBadge(a)}
              ${a.type ? `<span class="ability-pick-type">${a.type}</span>` : ''}
            </div>
          </div>
          ${a.tier2 ? `<div class="ability-pick-desc">${a.tier2}</div>` : ''}
          ${!a.tier2 && a.effect ? `<div class="ability-pick-desc">${a.effect}</div>` : ''}
        </button>
      `;
    }

    function selectablePoolHTML(title, poolAbilities, selectedIds, maxPicks, poolKey, emptyMsg) {
      const done = selectedIds.length >= maxPicks;
      return `
        <div class="ability-pool">
          <div class="ability-pool-header">
            <span class="pool-title">${title}</span>
            <span class="pool-quota ${done ? 'quota-met' : ''}">${selectedIds.length} / ${maxPicks} selected</span>
          </div>
          ${poolAbilities.length
            ? poolAbilities.map(a => abilityCardHTML(a, poolKey, selectedIds.includes(a.id))).join('')
            : `<p class="summary-empty">${emptyMsg}</p>`}
        </div>
      `;
    }

    function renderPools() {
      const poolEl = document.getElementById('ability-pools');
      if (!poolEl) return;

      // ── Stormwight: beast aspect sig shown read-only, THEN class sig pool for picking
      const stormwightAutoSigHTML = isStormwight ? (() => {
        const swSig   = p.kit && KIT_STATS?.[p.kit]?.sigAbility;
        const swTiers = p.kit && KIT_STATS?.[p.kit]?.sigTiers;
        return `
          <div class="ability-pool ability-pool-readonly">
            <div class="ability-pool-header">
              <span class="pool-title">Beast Aspect Signature</span>
              <span class="pool-quota quota-met">✓ Auto</span>
            </div>
            <p class="wizard-hint">Your Beast Aspect grants an automatic signature ability in addition to your class signature pick below.</p>
            ${swSig ? `
              <div class="kit-sig-name-display">${swSig}</div>
              ${swTiers ? `<div class="kit-sig-tiers-display" style="font-size:12px;color:var(--text-secondary);margin-top:4px">${swTiers}</div>` : ''}
            ` : '<p class="summary-empty">No Beast Aspect selected — return to Step 6.</p>'}
          </div>
        `;
      })() : '';

      // ── Tactician: kit sigs read-only, no class sig pool
      const tacticianSigHTML = isTactician ? `
        <div class="ability-pool ability-pool-readonly">
          <div class="ability-pool-header">
            <span class="pool-title">SIGNATURE ABILITIES — From Kits</span>
            <span class="pool-quota quota-met">✓ Auto</span>
          </div>
          <p class="wizard-hint">Tacticians get signature abilities from their kits via Field Arsenal — no class pool pick needed.</p>
          ${p.kit  && KIT_STATS?.[p.kit]?.sigAbility  ? `<div class="kit-sig-source-label">From ${p.kit} (Kit 1):</div><div class="kit-sig-name-display">${KIT_STATS[p.kit].sigAbility}</div>` : '<p class="summary-empty">No Kit 1 selected — return to Step 6.</p>'}
          ${p.kit2 && KIT_STATS?.[p.kit2]?.sigAbility ? `<div class="kit-sig-source-label" style="margin-top:8px">From ${p.kit2} (Kit 2):</div><div class="kit-sig-name-display">${KIT_STATS[p.kit2].sigAbility}</div>` : '<p class="summary-empty">No Kit 2 selected — return to Step 6.</p>'}
        </div>
      ` : '';

      // ── Class sig pool (all non-Tactician classes pick from this)
      const classSigHTML = picks.signatures > 0 ? selectablePoolHTML(
        `SIGNATURE ABILITIES — Choose ${picks.signatures}`,
        sigPool,
        p._sigAbilityIds,
        picks.signatures,
        'sig',
        `No signature abilities found for ${p.class}. This class's ability data may not be seeded yet.`
      ) : '';

      poolEl.innerHTML = `
        ${stormwightAutoSigHTML}
        ${isTactician ? tacticianSigHTML : classSigHTML}
        ${selectablePoolHTML(
          '3-POINT ABILITIES — Choose 1',
          heroic3Pool, p._heroic3AbilityIds, picks.heroic3,
          'heroic3',
          `No 3-point heroic abilities found for ${p.class}. This class's ability data may not be seeded yet.`
        )}
        ${selectablePoolHTML(
          '5-POINT ABILITIES — Choose 1',
          heroic5Pool, p._heroic5AbilityIds, picks.heroic5,
          'heroic5',
          `No 5-point heroic abilities found for ${p.class}. This class's ability data may not be seeded yet.`
        )}
      `;

      poolEl.querySelectorAll('[data-ability-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id   = btn.dataset.abilityId;
          const pool = btn.dataset.pool;
          if (pool === 'sig') {
            const idx = p._sigAbilityIds.indexOf(id);
            if (idx >= 0) p._sigAbilityIds.splice(idx, 1);
            else if (p._sigAbilityIds.length < picks.signatures) p._sigAbilityIds.push(id);
          } else if (pool === 'heroic3') {
            const idx = p._heroic3AbilityIds.indexOf(id);
            if (idx >= 0) p._heroic3AbilityIds.splice(idx, 1);
            else if (p._heroic3AbilityIds.length < picks.heroic3) p._heroic3AbilityIds.push(id);
          } else if (pool === 'heroic5') {
            const idx = p._heroic5AbilityIds.indexOf(id);
            if (idx >= 0) p._heroic5AbilityIds.splice(idx, 1);
            else if (p._heroic5AbilityIds.length < picks.heroic5) p._heroic5AbilityIds.push(id);
          }
          p.abilityIds = [...p._sigAbilityIds, ...p._heroic3AbilityIds, ...p._heroic5AbilityIds];
          renderPools();
          renderSummary();
        });
      });
    }

    function renderSummary() {
      const rightEl = document.getElementById('ability-selection-right');
      if (!rightEl) return;

      // Stormwight beast sig in summary
      const stormwightLine = isStormwight ? (() => {
        const swSig = p.kit && KIT_STATS?.[p.kit]?.sigAbility;
        return `
          <div class="summary-section-title">Beast Sig <span class="summary-check">✓</span></div>
          ${swSig ? `<div class="summary-ability"><span class="summary-ability-name">${swSig}</span></div>` : '<p class="summary-empty">No Aspect selected</p>'}
        `;
      })() : '';

      // Tactician kit sigs in summary
      const tacticianLine = isTactician ? (() => {
        const s1 = p.kit  && KIT_STATS?.[p.kit]?.sigAbility;
        const s2 = p.kit2 && KIT_STATS?.[p.kit2]?.sigAbility;
        return `
          <div class="summary-section-title">Signature <span class="summary-check">✓</span></div>
          ${s1 ? `<div class="summary-ability"><span class="summary-ability-name">${s1}</span><span class="summary-ability-type">Kit 1</span></div>` : '<p class="summary-empty">No Kit 1 selected</p>'}
          ${s2 ? `<div class="summary-ability"><span class="summary-ability-name">${s2}</span><span class="summary-ability-type">Kit 2</span></div>` : '<p class="summary-empty">No Kit 2 selected</p>'}
        `;
      })() : '';

      // Class sig pool summary
      const classSigLine = picks.signatures > 0 ? (() => {
        const done   = p._sigAbilityIds.length >= picks.signatures;
        const sigAbs = sigPool.filter(a => p._sigAbilityIds.includes(a.id));
        return `
          <div class="summary-section-title">
            Signature${picks.signatures > 1 ? 's' : ''} ${done ? '<span class="summary-check">✓</span>' : `(${p._sigAbilityIds.length}/${picks.signatures})`}
          </div>
          ${sigAbs.map(a => `<div class="summary-ability"><span class="summary-ability-name">${a.name}</span><span class="summary-ability-type">${a.type || ''}</span></div>`).join('')
            || '<p class="summary-empty">None selected yet</p>'}
        `;
      })() : '';

      const h3Done = p._heroic3AbilityIds.length >= picks.heroic3;
      const h5Done = p._heroic5AbilityIds.length >= picks.heroic5;
      const h3Abs  = heroic3Pool.filter(a => p._heroic3AbilityIds.includes(a.id));
      const h5Abs  = heroic5Pool.filter(a => p._heroic5AbilityIds.includes(a.id));

      rightEl.innerHTML = `
        <div class="ability-selection-summary">
          ${stormwightLine}
          ${isTactician ? tacticianLine : classSigLine}
          <div class="summary-section-title" style="margin-top:12px">
            3pt Heroic ${h3Done ? '<span class="summary-check">✓</span>' : `(${p._heroic3AbilityIds.length}/${picks.heroic3})`}
          </div>
          ${h3Abs.map(a => `<div class="summary-ability"><span class="summary-ability-name">${a.name}</span><span class="summary-ability-type">${a.type || ''}</span></div>`).join('')
            || '<p class="summary-empty">None selected yet</p>'}
          <div class="summary-section-title" style="margin-top:12px">
            5pt Heroic ${h5Done ? '<span class="summary-check">✓</span>' : `(${p._heroic5AbilityIds.length}/${picks.heroic5})`}
          </div>
          ${h5Abs.map(a => `<div class="summary-ability"><span class="summary-ability-name">${a.name}</span><span class="summary-ability-type">${a.type || ''}</span></div>`).join('')
            || '<p class="summary-empty">None selected yet</p>'}
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
  const list = typeof COMPLICATIONS !== 'undefined' ? COMPLICATIONS : [];

  function selectedComp() {
    return list.find(c => c.id === p._complicationId) || null;
  }

  function renderDetail() {
    const rightEl = document.getElementById('complication-right');
    if (!rightEl) return;
    const c = selectedComp();
    if (!c) {
      rightEl.innerHTML = '<p class="col-right-placeholder">Select a complication to see details, or skip below.</p>';
      return;
    }
    rightEl.innerHTML = `
      <div class="comp-detail-name">${c.name}</div>
      <div class="comp-detail-section">
        <div class="comp-detail-label comp-detail-benefit">Benefit</div>
        <div class="comp-detail-text">${c.benefit}</div>
      </div>
      <div class="comp-detail-section" style="margin-top:12px">
        <div class="comp-detail-label comp-detail-drawback">Drawback</div>
        <div class="comp-detail-text">${c.drawback}</div>
      </div>
    `;
  }

  function selectComplication(id) {
    p._complicationId   = id;
    const c = list.find(x => x.id === id);
    p._complicationName = c ? c.name : null;
    // Highlight selected row and scroll to it
    body.querySelectorAll('.complication-entry').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.cid) === id);
    });
    renderDetail();
  }

  body.innerHTML = `
    <div class="wizard-two-col">
      <div class="wizard-col-left">
        <button class="complication-roll-btn" id="comp-roll-btn">
          <span class="dice-icon">⚄</span>
          <span>Roll d100</span>
          <span class="comp-roll-result" id="comp-roll-result"></span>
        </button>
        <div class="complication-list" id="complication-list">
          ${list.map(c => {
            const preview = c.benefit.length > 70 ? c.benefit.slice(0, 68) + '…' : c.benefit;
            return `
              <div class="complication-entry ${p._complicationId === c.id ? 'selected' : ''}"
                   data-cid="${c.id}">
                <span class="complication-num">#${c.id}</span>
                <div class="complication-entry-body">
                  <div class="complication-entry-name">${c.name}</div>
                  <div class="complication-entry-preview">${preview}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <button class="complication-skip-btn" id="comp-skip-btn">
          ${p._complicationId === null ? '✓ No complication (skipped)' : 'Skip — No Complication'}
        </button>
      </div>
      <div class="wizard-col-right" id="complication-right">
        <p class="col-right-placeholder">Select a complication to see details, or skip below.</p>
      </div>
    </div>
  `;

  // Wire list clicks
  body.querySelectorAll('.complication-entry').forEach(el => {
    el.addEventListener('click', () => selectComplication(parseInt(el.dataset.cid)));
  });

  // Wire roll button
  document.getElementById('comp-roll-btn')?.addEventListener('click', () => {
    const roll  = Math.ceil(Math.random() * 100);
    const resultEl = document.getElementById('comp-roll-result');
    if (resultEl) { resultEl.textContent = `→ ${roll}`; }
    selectComplication(roll);
    // Scroll the rolled entry into view
    const entry = body.querySelector(`[data-cid="${roll}"]`);
    entry?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // Wire skip button
  document.getElementById('comp-skip-btn')?.addEventListener('click', () => {
    p._complicationId   = null;
    p._complicationName = null;
    body.querySelectorAll('.complication-entry').forEach(el => el.classList.remove('selected'));
    document.getElementById('comp-skip-btn').textContent = '✓ No complication (skipped)';
    renderDetail();
  });

  if (p._complicationId !== null) renderDetail();
}

// ── Step 9: Characteristics ───────────────────────────────────────────────────

function _step9(body) {
  const p = AppState.pendingCharacter;

  // Load class defaults on first visit (or after class change)
  if (!p._charsReady) {
    p.characteristics = { ...(CLASS_CHARACTERISTICS[p.class] || { MGT:0,AGL:0,REA:0,INU:0,PRS:0 }) };
    p._charsReady = true;
  }

  const primaries = (typeof CLASS_PRIMARY_CHARACTERISTICS !== 'undefined' && CLASS_PRIMARY_CHARACTERISTICS[p.class]) || [];
  const [primA, primB] = primaries;
  const primLabelA = CHAR_LABELS[primA] || primA;
  const primLabelB = CHAR_LABELS[primB] || primB;

  function render() {
    const chars = p.characteristics;
    const spent = Object.values(chars).reduce((a, b) => a + b, 0);
    const rem   = CHAR_BUDGET - spent;

    body.innerHTML = `
      ${primaries.length ? `
        <div class="char-primary-callout">
          <span class="char-primary-icon">★</span>
          Primary stats: <strong>${primLabelA}</strong> and <strong>${primLabelB}</strong>
          — only these can reach 2 at level 1.
        </div>
      ` : ''}
      <div class="char-adjuster">
        <div class="char-budget">
          <span class="char-budget-label">Points remaining</span>
          <span class="char-budget-count" id="char-remaining">${rem}</span>
        </div>
        ${CHAR_STATS.map(stat => {
          const val       = chars[stat] ?? 0;
          const isPrimary = primaries.includes(stat);
          const maxForStat = isPrimary ? 2 : 1;
          const disablePlus  = val >= maxForStat || rem <= 0;
          const disableMinus = val <= 0;
          return `
            <div class="char-row ${isPrimary ? 'char-row-primary' : ''}">
              <span class="char-label">
                ${CHAR_LABELS[stat]}
                ${isPrimary ? '<span class="char-primary-badge">PRIMARY</span>' : ''}
              </span>
              <div class="char-controls">
                <button class="char-btn char-btn-minus" data-stat="${stat}" ${disableMinus ? 'disabled' : ''}>−</button>
                <span class="char-value">${val}</span>
                <button class="char-btn char-btn-plus" data-stat="${stat}" ${disablePlus ? 'disabled' : ''}>+</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <p class="wizard-hint">Pre-filled with your class's suggested spread. Redistribute freely.</p>
    `;

    body.querySelectorAll('.char-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stat       = btn.dataset.stat;
        const curr       = p.characteristics[stat] ?? 0;
        const delta      = btn.classList.contains('char-btn-plus') ? 1 : -1;
        const newVal     = curr + delta;
        const isPrimary  = primaries.includes(stat);
        const maxForStat = isPrimary ? 2 : 1;
        const spentNow   = Object.values(p.characteristics).reduce((a, b) => a + b, 0);
        const remNow     = CHAR_BUDGET - spentNow;

        if (newVal < 0) return;
        if (newVal > maxForStat) {
          _flashError(`Only ${primLabelA} and ${primLabelB} can be raised to 2 at this level.`);
          return;
        }
        if (delta > 0 && remNow <= 0) return;

        p.characteristics[stat] = newVal;
        render();
      });
    });
  }

  render();
}

// ── Step 10: Stamina ──────────────────────────────────────────────────────────

function _step10(body) {
  const p         = AppState.pendingCharacter;
  const meta      = CLASS_COLORS[p.class] || { accent: '#2980B9', resource: 'Resource' };
  const base      = CLASS_BASE_STAMINA[p.class] || 18;
  const access10  = (typeof CLASS_KIT_ACCESS !== 'undefined' ? CLASS_KIT_ACCESS : {})[p.class] || { type: 'none' };
  const kitBonus1 = KIT_STAMINA[p.kit]  || 0;
  const kitBonus2 = KIT_STAMINA[p.kit2] || 0;
  const kitBonus  = isTacticianClass(p.class) ? Math.max(kitBonus1, kitBonus2) : kitBonus1;
  const maxHP     = base + kitBonus;
  const recovery  = Math.floor(maxHP / 3);

  function isTacticianClass(cls) { return cls === 'Tactician'; }

  let kitBonusLabel;
  if (access10.type === 'none') {
    kitBonusLabel = 'No kit (class features)';
  } else if (access10.type === 'primordial_aspect') {
    const aspectName = p._furyAspect || null;
    kitBonusLabel = aspectName
      ? `Primordial Aspect: ${aspectName}${kitBonus > 0 ? ` (+${kitBonus})` : ''}`
      : 'No aspect selected';
  } else if (p.class === 'Tactician') {
    kitBonusLabel = `${kitBonus} kit bonus (best of two)`;
  } else {
    kitBonusLabel = p.kit ? `${kitBonus} kit bonus` : 'No kit selected';
  }

  // Beastheart companion preview
  let companionPreviewHTML = '';
  if (p.class === 'Beastheart') {
    if (p._companionSpecies) {
      const spec = typeof BEASTHEART_COMPANION_SPECIES !== 'undefined'
        ? BEASTHEART_COMPANION_SPECIES.find(c => c.name === p._companionSpecies)
        : null;
      companionPreviewHTML = `
        <div class="step10-companion-preview">
          <div class="step10-companion-title">Companion</div>
          <div class="step10-companion-row">
            <span class="step10-companion-name">${p._companionSpecies}</span>
            <span class="step10-companion-meta">${spec ? `${spec.type} · Size ${spec.size} · Speed ${spec.speed}` : ''}</span>
          </div>
          ${p._companionSpecies === 'Drake' && p._drakeElement ? `
            <div class="step10-companion-row">
              <span class="step10-companion-label">Element</span>
              <span class="step10-companion-meta">${p._drakeElement} · You gain Immunity 3 to ${p._drakeElement}</span>
            </div>
          ` : ''}
          ${spec?.heroBenefit ? `
            <div class="step10-companion-benefit">★ ${spec.heroBenefit}</div>
          ` : ''}
        </div>
      `;
    } else {
      companionPreviewHTML = `
        <div class="step10-companion-preview step10-companion-missing">
          ⚠ No companion selected — return to Step 5
        </div>
      `;
    }
  }

  body.innerHTML = `
    <div class="stamina-display">
      <div class="stamina-stat">
        <div class="stamina-value">${maxHP}</div>
        <div class="stamina-label">Stamina</div>
        <div class="stamina-breakdown">${base} class${kitBonus > 0 ? ` + ${kitBonus} aspect/kit` : ''} · ${kitBonusLabel}</div>
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
    ${companionPreviewHTML}
  `;
}

// ── Step 11: Review ───────────────────────────────────────────────────────────

function _step11(body) {
  const p    = AppState.pendingCharacter;
  const meta = CLASS_COLORS[p.class] || { accent: '#2980B9', resource: 'Resource' };

  // ── Required field validation ──────────────────────────────────────────────
  const access11 = (typeof CLASS_KIT_ACCESS !== 'undefined' ? CLASS_KIT_ACCESS : {})[p.class] || { type: 'none' };
  const missing = [];
  if (!p.name?.trim())  missing.push('Hero name (Step 1)');
  if (!p.ancestry)      missing.push('Ancestry (Step 2)');
  if (p.ancestry === 'Revenant' && !p._revenantFormerLife) missing.push('Former Life (Step 2)');
  if (!p.class)         missing.push('Class (Step 5)');
  if (!p.subclass)      missing.push('Subclass (Step 5)');
  // Kit required only for kit classes; Fury needs an aspect; non-kit classes skip
  if (access11.type === 'standard' && !p.kit)           missing.push('Kit (Step 6)');
  if (access11.type === 'primordial_aspect' && !p._furyAspect) missing.push('Primordial Aspect (Step 6)');
  if (p.class === 'Beastheart' && !p._companionSpecies)                          missing.push('Companion (Step 5)');
  if (p.class === 'Beastheart' && p._companionSpecies === 'Drake' && !p._drakeElement) missing.push('Drake elemental attunement (Step 5)');

  // ── Computed stats ─────────────────────────────────────────────────────────
  const base          = CLASS_BASE_STAMINA[p.class] || 18;
  const kitBonus1     = KIT_STAMINA[p.kit]  || 0;
  const kitBonus2     = KIT_STAMINA[p.kit2] || 0;
  const kitBonus      = p.class === 'Tactician' ? Math.max(kitBonus1, kitBonus2) : kitBonus1;
  const maxHP         = base + kitBonus;
  const kitStatsSubLabel = access11.type === 'none'
    ? 'No kit (class features)'
    : access11.type === 'primordial_aspect'
      ? `${base} class${kitBonus > 0 ? ` + ${kitBonus} aspect` : ''}`
      : `${base} class + ${kitBonus} kit`;
  const recoveryValue = Math.floor(maxHP / 3);
  const recoveries    = CLASS_RECOVERIES[p.class] ?? 8;

  // ── Skills preview — same assembly logic as finishCharacterCreation ────────
  const skillSet = new Set();
  if (p._cultureSkill_env) skillSet.add(p._cultureSkill_env);
  if (p._cultureSkill_org) skillSet.add(p._cultureSkill_org);
  if (p._cultureSkill_upb) skillSet.add(p._cultureSkill_upb);
  if (p._cultureSkill_anc) skillSet.add(p._cultureSkill_anc);
  const careerEntry = typeof CAREER_DATA !== 'undefined'
    ? CAREER_DATA.find(c => c.name === p.career) : null;
  for (const s of (careerEntry?.fixedSkills ?? [])) skillSet.add(s);
  for (const s of (p._careerChosenSkills ?? [])) skillSet.add(s);
  const classGrant = typeof CLASS_SKILL_GRANTS !== 'undefined'
    ? CLASS_SKILL_GRANTS?.[p.class] : null;
  if (classGrant) {
    for (const s of classGrant.fixed) skillSet.add(s);
    for (const s of (p._classSkills ?? [])) skillSet.add(s);
  }
  if (p._subclassSkill) skillSet.add(p._subclassSkill);
  const skillsList = [...skillSet].sort();

  // ── Row data ───────────────────────────────────────────────────────────────
  const cultureSummary = [p.cultureEnvironment, p.cultureOrganization, p.cultureUpbringing].filter(Boolean).join(' / ') || '—';
  const traitsSummary  = (p.ancestryTraits?.length) ? p.ancestryTraits.join(', ') : 'None selected';
  const abilitySummary = (p.abilityIds?.length) ? `${p.abilityIds.length} selected` : 'None selected';
  // Kit row label/value — varies by class kit access type
  let kitRowLabel, kitRowVal;
  if (access11.type === 'none') {
    kitRowLabel = 'Kit';
    kitRowVal   = '— (not applicable)';
  } else if (access11.type === 'primordial_aspect') {
    kitRowLabel = 'Primordial Aspect';
    kitRowVal   = p._furyAspect || '—';
  } else if (p.class === 'Tactician' && p.kit2) {
    kitRowLabel = 'Kit';
    kitRowVal   = `${p.kit || '—'} + ${p.kit2}`;
  } else {
    kitRowLabel = 'Kit';
    kitRowVal   = p.kit || '—';
  }

  const rows = [
    ['Name',            p.name?.trim() || '—'],
    ['Ancestry',        p.ancestry || '—'],
    ...(p.ancestry === 'Dragon Knight' && p.ancestryDamageTypeChoice
      ? [['Wyrmplate Type', p.ancestryDamageTypeChoice.charAt(0).toUpperCase() + p.ancestryDamageTypeChoice.slice(1)]]
      : []),
    ...(p.ancestry === 'Revenant'
      ? [['Former Life', p._revenantFormerLife || '—']]
      : []),
    ['Ancestry Traits', traitsSummary],
    ['Culture',         cultureSummary],
    ['Career',          p.career || '—'],
    ['Class',           p.class || '—'],
    ['Subclass',        p.subclass || '—'],
    [kitRowLabel,       kitRowVal],
    ...(p.class === 'Beastheart' ? [['Companion', p._companionSpecies || '—']] : []),
    ...(p.class === 'Beastheart' && p._companionSpecies === 'Drake' ? [['Element', p._drakeElement || '—']] : []),
    ['Abilities',       abilitySummary],
    ['Complication',    p._complicationName || '—'],
    ['Characteristics', CHAR_STATS.map(s => `${s} +${p.characteristics?.[s] ?? 0}`).join('  ')],
  ];

  // Flag rows that are missing required values
  const requiredFields = new Set(['Name', 'Ancestry', 'Class', 'Subclass']);
  if (p.ancestry === 'Revenant')             requiredFields.add('Former Life');
  if (access11.type === 'standard')          requiredFields.add('Kit');
  if (access11.type === 'primordial_aspect') requiredFields.add('Primordial Aspect');
  if (p.class === 'Beastheart') requiredFields.add('Companion');
  if (p.class === 'Beastheart' && p._companionSpecies === 'Drake') requiredFields.add('Element');

  body.innerHTML = `
    ${missing.length ? `
      <div class="review-missing">
        <div class="review-missing-title">Missing required selections</div>
        <ul class="review-missing-list">
          ${missing.map(m => `<li>${m}</li>`).join('')}
        </ul>
        <p class="review-missing-hint">Go back and complete these steps before creating your hero.</p>
      </div>
    ` : ''}

    <div class="review-stats-strip">
      <div class="review-stat-block">
        <div class="review-stat-value">${maxHP}</div>
        <div class="review-stat-label">Stamina</div>
        <div class="review-stat-sub">${kitStatsSubLabel}</div>
      </div>
      <div class="review-stat-block">
        <div class="review-stat-value">${recoveryValue}</div>
        <div class="review-stat-label">Recovery Value</div>
        <div class="review-stat-sub">Stamina ÷ 3</div>
      </div>
      <div class="review-stat-block">
        <div class="review-stat-value">${recoveries}</div>
        <div class="review-stat-label">Recoveries</div>
        <div class="review-stat-sub">Refill on Respite</div>
      </div>
      <div class="review-stat-block" style="color: ${meta.accent}">
        <div class="review-stat-value">10</div>
        <div class="review-stat-label">${meta.resource}</div>
        <div class="review-stat-sub">Starting max</div>
      </div>
    </div>

    <div class="review-card" style="--class-accent: ${meta.accent}; border-top-color: ${meta.accent}">
      ${rows.map(([label, val]) => {
        const isRequired = requiredFields.has(label);
        const isEmpty    = val === '—';
        return `
          <div class="review-row${isRequired && isEmpty ? ' review-row-missing' : ''}">
            <span class="review-label">${label}</span>
            <span class="review-val">${val}</span>
          </div>`;
      }).join('')}
    </div>

    <div class="review-skills-section">
      <div class="review-skills-title">Starting Skills</div>
      ${skillsList.length ? `
        <div class="review-skills-chips">
          ${skillsList.map(s => `<span class="review-skill-chip">${s}</span>`).join('')}
        </div>
      ` : `<p class="review-skills-empty">No skills collected yet — complete Culture, Career, and Class steps.</p>`}
    </div>
  `;

  // Enable/disable Create Hero button based on validation
  const nextBtn = document.getElementById('wizard-next-btn');
  if (missing.length) {
    nextBtn.disabled = true;
    nextBtn.title    = 'Complete all required steps first';
  } else {
    nextBtn.disabled = false;
    nextBtn.title    = '';
  }
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
    if (p.ancestry === 'Revenant' && !p._revenantFormerLife) {
      _flashError('Choose your Former Life ancestry to continue.'); return;
    }
  } else if (step === 3) {
    if (!p.cultureEnvironment)  { _flashError('Choose an Environment to continue.'); return; }
    if (!p.cultureOrganization) { _flashError('Choose an Organization to continue.'); return; }
    if (!p.cultureUpbringing)   { _flashError('Choose an Upbringing to continue.'); return; }
  } else if (step === 4) {
    if (!p.career) { _flashError('Pick a career to continue.'); return; }
    const careerEntry = CAREER_DATA.find(c => c.name === p.career);
    const cs = careerEntry?.chooseSkills;
    if (cs && (p._careerChosenSkills?.length ?? 0) < cs.count) {
      _flashError(`Choose ${cs.count} career skill${cs.count !== 1 ? 's' : ''} to continue.`); return;
    }
  } else if (step === 5) {
    if (!p.class)    { _flashError('Pick a class to continue.'); return; }
    if (!p.subclass) { _flashError('Pick a subclass to continue.'); return; }
    const classSkillGrant = CLASS_SKILL_GRANTS?.[p.class];
    if (classSkillGrant && (p._classSkills?.length ?? 0) < classSkillGrant.choose) {
      _flashError(`Choose ${classSkillGrant.choose} class skills to continue.`); return;
    }
    if (p.class === 'Beastheart' && !p._companionSpecies) {
      _flashError('Choose your companion before continuing.'); return;
    }
    if (p.class === 'Beastheart' && p._companionSpecies === 'Drake' && !p._drakeElement) {
      _flashError('Choose your drake\'s elemental attunement before continuing.'); return;
    }
  } else if (step === 6) {
    const access6 = (typeof CLASS_KIT_ACCESS !== 'undefined' ? CLASS_KIT_ACCESS : {})[p.class] || { type: 'none' };
    if (access6.type === 'standard') {
      if (!p.kit) { _flashError('Pick a kit to continue.'); return; }
      if (p.class === 'Tactician' && !p.kit2) {
        _flashError('Tacticians pick two kits (Field Arsenal). Select a second kit.'); return;
      }
    } else if (access6.type === 'primordial_aspect') {
      if (!p._furyAspect) { _flashError('Choose your Primordial Aspect to continue.'); return; }
    }
    // type: 'none' — always passes through
  } else if (step === 7) {
    const picks7 = CLASS_ABILITY_PICKS[p.class] || { signatures: 1, heroic3: 1, heroic5: 1 };
    if (picks7.signatures > 0 && p._sigPoolHasData && (p._sigAbilityIds?.length ?? 0) < picks7.signatures) {
      _flashError(`Select ${picks7.signatures} signature abilit${picks7.signatures === 1 ? 'y' : 'ies'} to continue.`); return;
    }
    if (p._heroic3PoolHasData && (p._heroic3AbilityIds?.length ?? 0) < picks7.heroic3) {
      _flashError('Select a 3-point heroic ability to continue.'); return;
    }
    if (p._heroic5PoolHasData && (p._heroic5AbilityIds?.length ?? 0) < picks7.heroic5) {
      _flashError('Select a 5-point heroic ability to continue.'); return;
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

  const base      = CLASS_BASE_STAMINA[p.class] || 18;
  const kitBonus1 = KIT_STAMINA[p.kit]  || 0;
  const kitBonus2 = KIT_STAMINA[p.kit2] || 0;
  const kitBonus  = p.class === 'Tactician' ? Math.max(kitBonus1, kitBonus2) : kitBonus1;
  const maxHP     = base + kitBonus;

  const nextBtn = document.getElementById('wizard-next-btn');
  nextBtn.disabled = true;
  nextBtn.textContent = 'Creating...';

  // Build skills array from all sources — culture, career, class, subclass
  const skillSet = new Set();
  // Culture (quickBuild skills captured per layer during wizard)
  if (p._cultureSkill_env) skillSet.add(p._cultureSkill_env);
  if (p._cultureSkill_org) skillSet.add(p._cultureSkill_org);
  if (p._cultureSkill_upb) skillSet.add(p._cultureSkill_upb);
  if (p._cultureSkill_anc) skillSet.add(p._cultureSkill_anc);
  // Career: fixed + chosen
  const careerEntry = CAREER_DATA.find(c => c.name === p.career);
  for (const s of (careerEntry?.fixedSkills ?? [])) skillSet.add(s);
  for (const s of (p._careerChosenSkills ?? [])) skillSet.add(s);
  // Class: fixed + chosen
  const classGrant = CLASS_SKILL_GRANTS?.[p.class];
  if (classGrant) {
    for (const s of classGrant.fixed) skillSet.add(s);
    for (const s of (p._classSkills ?? [])) skillSet.add(s);
  }
  // Subclass skill
  if (p._subclassSkill) skillSet.add(p._subclassSkill);

  // Extract kit sig ability names for reliable display via virtual cards in abilities.js
  // sigAbility is now just the name (no "Name: description" colon format).
  const kitStats  = p.kit  && typeof KIT_STATS !== 'undefined' ? KIT_STATS[p.kit]  : null;
  const kitStats2 = p.kit2 && typeof KIT_STATS !== 'undefined' ? KIT_STATS[p.kit2] : null;
  const kitSigAbilityName  = kitStats?.sigAbility  || null;
  const kitSigAbilityName2 = kitStats2?.sigAbility || null;

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
    kit:                  p.kit  || null,
    kit2:                 p.class === 'Tactician' ? (p.kit2 || null) : null,
    furyAspect:           p.class === 'Fury' ? (p._furyAspect || null) : null,
    revenantFormerLife:   p.ancestry === 'Revenant' ? (p._revenantFormerLife || null) : null,
    kitSigAbilityName:    kitSigAbilityName  || null,
    kitSigAbilityName2:   kitSigAbilityName2 || null,
    complication:        p._complicationName || 'None',
    complicationId:      p._complicationId   || null,
    characteristics:     p.characteristics || { MGT:0, AGL:0, REA:0, INU:0, PRS:0 },
    maxHP,
    currentHP:           maxHP,
    heroicResource:      { name: meta.resource, current: 0, max: 10 },
    recoveries:          { current: CLASS_RECOVERIES[p.class] ?? 8, max: CLASS_RECOVERIES[p.class] ?? 8 },
    // Beastheart companion (null for all other classes)
    companionSpecies:    p._companionSpecies || null,
    drakeElement:        p._drakeElement     || null,
    companion:           p._companionSpecies ? (() => {
      const spec = typeof BEASTHEART_COMPANION_SPECIES !== 'undefined'
        ? BEASTHEART_COMPANION_SPECIES.find(c => c.name === p._companionSpecies)
        : null;
      return {
        species:     p._companionSpecies,
        type:        spec?.type    || null,
        size:        spec?.size    || '1M',
        speed:       spec?.speed   || 5,
        ferocity:    0,
        ferocityMax: 3,
        baseStamina: spec?.stamina || 21,
        currentHP:   spec?.stamina || 21,
        maxHP:       spec?.stamina || 21,
        heroBenefit: spec?.heroBenefit || null,
        immunities:  spec?.immunities  || [],
        conditions:  [],
        isRampaging: false,
        drakeElement: p._drakeElement || null,
      };
    })() : null,
    abilityIds:               [...(p._sigAbilityIds ?? []), ...(p._heroic3AbilityIds ?? []), ...(p._heroic5AbilityIds ?? [])],
    skills:                   [...skillSet],
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
