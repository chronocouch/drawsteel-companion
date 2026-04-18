/**
 * session.js — Combat session mode
 *
 * Handles:
 *  - Creating a session (Director)
 *  - Joining a session (Player)
 *  - Live Firestore onSnapshot sync
 *  - Director battle board (zipper layout, enemies, malice)
 *  - Take My Turn / End My Turn flow
 *  - Hero Tokens (shared party resource)
 *  - Malice tracker (Director only)
 *  - Enemy roster with HP, conditions, villain actions
 */

let sessionUnsubscribe = null;      // Firestore listener cleanup
let directorBoardCollapsed = false; // persists across snapshot re-renders

// ── Law vs Chaos resource generation ────────────────────────────────────────

const LAW_CLASSES = ['Conduit', 'Elementalist', 'Null'];

function getTurnResourceGain(charClass) {
  if (LAW_CLASSES.includes(charClass)) return 2;
  return Math.ceil(Math.random() * 3); // 1d3
}

// ── Generate a 6-digit session code ─────────────────────────────────────────

function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Create session (Director) ────────────────────────────────────────────────

async function createSession() {
  const user = AppState.currentUser;
  const char = AppState.currentCharacter;
  if (!user || !char) return;

  const code = generateSessionCode();
  const heroEntry = buildHeroEntry(user, char);

  try {
    await db.collection('sessions').doc(code).set({
      directorId: user.uid,
      active: true,
      round: 1,
      heroTokens: 1,
      malice: 0,
      activeSide: null,
      enemies: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      heroes: [heroEntry],
      userIds: [user.uid],
    });

    AppState.currentSession = { code, isDirector: true };
    joinSessionListeners(code);
    activateCombatOverlay(true);

    showModal(`
      <div class="session-created">
        <h2>Session Started!</h2>
        <p>Share this code with your players:</p>
        <div class="session-code-display">${code}</div>
        <button class="btn btn-primary" onclick="hideModal()">Got it</button>
      </div>
    `);
  } catch (e) {
    console.error('Error creating session:', e);
    showModal('<p class="error-text">Could not create session. Try again.</p>');
  }
}

// ── Join session (Player) ────────────────────────────────────────────────────

function promptJoinSession() {
  showModal(`
    <div class="join-session-modal">
      <h2>Join Session</h2>
      <p>Enter the 6-digit code from your Director:</p>
      <input
        type="text"
        id="session-code-input"
        class="session-code-input"
        maxlength="6"
        placeholder="000000"
        autocomplete="off"
        inputmode="numeric"
      />
      <button class="btn btn-primary" id="join-confirm-btn">Join</button>
      <p class="join-error hidden" id="join-error"></p>
    </div>
  `);

  const doJoin = async () => {
    const code = document.getElementById('session-code-input').value.trim();
    if (code.length !== 6) {
      showJoinError('Please enter a 6-digit code.');
      return;
    }
    await attemptJoinSession(code);
  };

  document.getElementById('join-confirm-btn').addEventListener('click', doJoin);

  setTimeout(() => {
    const input = document.getElementById('session-code-input');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
    }
  }, 100);
}

function showJoinError(msg) {
  const el = document.getElementById('join-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

async function attemptJoinSession(code) {
  const user = AppState.currentUser;
  const char = AppState.currentCharacter;
  if (!user || !char) return;

  try {
    const sessionRef = db.collection('sessions').doc(code);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      showJoinError('Session not found. Check the code and try again.');
      return;
    }

    const sessionData = sessionSnap.data();
    if (!sessionData.active) {
      showJoinError('This session has ended.');
      return;
    }

    const heroEntry = buildHeroEntry(user, char);
    const heroes = sessionData.heroes || [];
    const existingIdx = heroes.findIndex(h => h.userId === user.uid);

    if (existingIdx >= 0) {
      heroes[existingIdx] = { ...heroes[existingIdx], ...heroEntry };
    } else {
      heroes.push(heroEntry);
    }

    await sessionRef.update({ heroes });

    await sessionRef.update({
      heroes,
      userIds: firebase.firestore.FieldValue.arrayUnion(user.uid),
    });

    AppState.currentSession = {
      code,
      isDirector: sessionData.directorId === user.uid,
    };

    joinSessionListeners(code);
    activateCombatOverlay(sessionData.directorId === user.uid);
    hideModal();
  } catch (e) {
    console.error('Error joining session:', e);
    showJoinError('Error joining session. Check your connection.');
  }
}

// ── Build hero entry for session document ────────────────────────────────────

function buildHeroEntry(user, char) {
  return {
    userId: user.uid,
    characterId: char.id,
    displayName: char.name || user.displayName || 'Hero',
    currentHP: char.currentHP ?? char.maxHP ?? 0,
    maxHP: char.maxHP ?? 0,
    heroicResource: char.heroicResource ?? { name: 'Resource', current: 0, max: 10 },
    recoveries: char.recoveries ?? { current: 8, max: 8 },
    conditions: char.conditions ?? [],
    hasActed: false,
    hasManeuvered: false,
    hasUsedTriggered: false,
    hasUsedFreeTriggered: false,
    hasUsedFreeStrike: false,
    isActivated: false,
    usedOncePerEncounterAbilities: [],
    usedOncePerTurnAbilities: [],
  };
}

// ── Helper: update session doc fields ────────────────────────────────────────

async function updateSessionDoc(updates) {
  const session = AppState.currentSession;
  if (!session) return;
  try {
    await db.collection('sessions').doc(session.code).update(updates);
  } catch (e) {
    console.error('Error updating session doc:', e);
  }
}

// ── Live Firestore listener ──────────────────────────────────────────────────

function joinSessionListeners(code) {
  if (sessionUnsubscribe) sessionUnsubscribe();

  sessionUnsubscribe = db.collection('sessions').doc(code)
    .onSnapshot((snap) => {
      if (!snap.exists) { leaveSession(); return; }

      const data = snap.data();
      if (!data.active) { leaveSession(); return; }

      // Round display
      updateRoundDisplay(data.round);

      // Hero tokens
      const tokenEl = document.getElementById('hero-token-count');
      if (tokenEl) tokenEl.textContent = data.heroTokens ?? 0;

      // Active side banner
      updateActiveSideBanner(data.activeSide);

      // Sync my hero's card state
      const myHero = data.heroes?.find(h => h.userId === AppState.currentUser?.uid);
      if (myHero) {
        restoreCardStateFromSession(myHero);
        document.getElementById('hp-current').textContent = myHero.currentHP;
        document.getElementById('resource-current').textContent = myHero.heroicResource?.current ?? 0;

        // Show take-turn vs end-turn based on activation state
        const takeTurnBtn = document.getElementById('take-turn-btn');
        const endTurnBtn  = document.getElementById('end-turn-btn');
        if (takeTurnBtn && endTurnBtn) {
          if (myHero.isActivated) {
            takeTurnBtn.classList.add('hidden');
            endTurnBtn.classList.remove('hidden');
          } else {
            takeTurnBtn.classList.remove('hidden');
            endTurnBtn.classList.add('hidden');
          }
        }
      }

      // Director board
      if (AppState.currentSession?.isDirector) {
        updateDirectorBattleBoard(data);
      }
    }, (error) => {
      console.error('Session listener error:', error);
    });
}

// ── Update hero in session ────────────────────────────────────────────────────

async function updateHeroInSession(updates) {
  const session = AppState.currentSession;
  const user = AppState.currentUser;
  if (!session || !user) return;

  try {
    const sessionRef = db.collection('sessions').doc(session.code);
    const snap = await sessionRef.get();
    if (!snap.exists) return;

    const heroes = snap.data().heroes || [];
    const idx = heroes.findIndex(h => h.userId === user.uid);
    if (idx < 0) return;

    heroes[idx] = { ...heroes[idx], ...updates };
    await sessionRef.update({ heroes });
  } catch (e) {
    console.error('Error updating session hero:', e);
  }
}

// ── Take My Turn ─────────────────────────────────────────────────────────────

async function startMyTurn() {
  const char = AppState.currentCharacter;
  const user = AppState.currentUser;
  if (!char || !user) return;

  const gain = getTurnResourceGain(char.class);
  await adjustResource(gain);

  // Mark activated AND move this hero to the end of the waiting group so the
  // NEXT badge advances to the next un-acted hero automatically.
  const session = AppState.currentSession;
  if (session) {
    try {
      const sessionRef = db.collection('sessions').doc(session.code);
      const snap = await sessionRef.get();
      if (snap.exists) {
        const heroes = snap.data().heroes || [];
        const myIdx  = heroes.findIndex(h => h.userId === user.uid);
        if (myIdx >= 0) {
          heroes[myIdx] = { ...heroes[myIdx], isActivated: true };
          // Partition: waiting (not yet acted, not active), active/done, self
          const me      = heroes[myIdx];
          const others  = heroes.filter((_, i) => i !== myIdx);
          const waiting = others.filter(h => !h.hasActed && !h.isActivated);
          const rest    = others.filter(h => h.hasActed  ||  h.isActivated);
          // New order: [waiting heroes…, ME (now active), done/active heroes…]
          await sessionRef.update({ heroes: [...waiting, me, ...rest] });
        } else {
          await updateHeroInSession({ isActivated: true });
        }
      }
    } catch (e) {
      console.error('Error in startMyTurn reorder:', e);
      await updateHeroInSession({ isActivated: true });
    }
  } else {
    await updateHeroInSession({ isActivated: true });
  }

  showToast(`+${gain} ${char.heroicResource?.name ?? 'Resource'} — your turn begins!`, 'info');
}

// ── End Turn ─────────────────────────────────────────────────────────────────

async function endMyTurn() {
  // Reset per-turn state locally (does NOT reset triggered — per-round)
  resetTurnState();

  if (AppState.currentSession) {
    await updateHeroInSession({
      hasActed: false,
      hasManeuvered: false,
      hasUsedFreeStrike: false,
      isActivated: false,
      usedOncePerTurnAbilities: [],
      // hasUsedTriggered / hasUsedFreeTriggered NOT reset here — they reset on Next Round
    });
  }

  const btn = document.getElementById('end-turn-btn');
  if (btn) {
    btn.textContent = 'Turn ended ✓';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = 'End My Turn';
      btn.disabled = false;
    }, 2000);
  }
}

document.getElementById('take-turn-btn')?.addEventListener('click', startMyTurn);
document.getElementById('end-turn-btn')?.addEventListener('click', endMyTurn);

// ── Hero Tokens ───────────────────────────────────────────────────────────────

async function adjustHeroTokens(delta) {
  const session = AppState.currentSession;
  if (!session) return;

  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;

  const current = snap.data().heroTokens ?? 0;
  const newVal  = Math.max(0, current + delta);
  await updateSessionDoc({ heroTokens: newVal });
}

document.getElementById('token-minus')?.addEventListener('click', () => adjustHeroTokens(-1));
document.getElementById('token-plus')?.addEventListener('click',  () => adjustHeroTokens(1));

// ── Director: Next Round ──────────────────────────────────────────────────────

async function advanceRound() {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const sessionRef = db.collection('sessions').doc(session.code);
  const snap = await sessionRef.get();
  if (!snap.exists) return;

  const data = snap.data();
  const newRound = (data.round ?? 1) + 1;

  // Auto-gain malice: heroCount + newRound (gained at start of each new round)
  const heroCount = (data.heroes || []).length;
  const maliceGain = heroCount + newRound;
  const newMalice = (data.malice ?? 0) + maliceGain;

  // Reset all heroes' per-turn state AND triggered (per-round reset)
  const heroes = (data.heroes || []).map(h => ({
    ...h,
    hasActed: false,
    hasManeuvered: false,
    hasUsedTriggered: false,
    hasUsedFreeTriggered: false,
    hasUsedFreeStrike: false,
    isActivated: false,
    usedOncePerTurnAbilities: [],
  }));

  // Reset all enemies' activated state
  const enemies = (data.enemies || []).map(e => ({ ...e, isActivated: false }));

  await sessionRef.update({ round: newRound, heroes, enemies, malice: newMalice });

  showToast(`Round ${newRound} — Malice +${maliceGain} (now ${newMalice})`, 'info');
}

// ── Malice ────────────────────────────────────────────────────────────────────

async function adjustMalice(delta) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;
  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;
  const current = snap.data().malice ?? 0;
  await updateSessionDoc({ malice: Math.max(0, current + delta) });
}

async function startCombat() {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;

  const heroes = snap.data().heroes || [];
  const avgVictories = heroes.length
    ? Math.floor(heroes.reduce((sum, h) => sum + (h.victories ?? 0), 0) / heroes.length)
    : 0;

  await updateSessionDoc({ malice: avgVictories });
  showToast(`Combat started — Malice set to ${avgVictories} (avg victories)`, 'info');
}

// ── Active side ───────────────────────────────────────────────────────────────

async function setActiveSide(side) {
  await updateSessionDoc({ activeSide: side });
}

function updateActiveSideBanner(activeSide) {
  let banner = document.getElementById('active-side-banner');

  if (!activeSide) {
    if (banner) banner.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'active-side-banner';
    const indicator = document.getElementById('session-indicator');
    indicator?.after(banner);
  }

  if (activeSide === 'heroes') {
    banner.className = 'active-side-banner banner-heroes';
    banner.textContent = '⚔ HEROES — ACTIVATE!';
  } else {
    banner.className = 'active-side-banner banner-villains';
    banner.textContent = '☠ VILLAIN TURN';
  }
}

// ── Enemy roster ──────────────────────────────────────────────────────────────

function showAddEnemyModal() {
  showModal(`
    <div class="add-enemy-modal">
      <h2>Add Enemy</h2>
      <div class="wizard-field">
        <label class="wizard-label">Name</label>
        <input type="text" id="enemy-name-input" class="wizard-text-input" placeholder="Goblin Warchief" />
      </div>
      <div class="wizard-field">
        <label class="wizard-label">Max HP</label>
        <input type="number" id="enemy-hp-input" class="wizard-text-input" placeholder="60" min="1" />
      </div>
      <div class="enemy-boss-row">
        <label class="enemy-boss-label">
          <input type="checkbox" id="enemy-boss-check" />
          Boss / Solo (has Villain Actions)
        </label>
      </div>
      <button class="btn btn-primary" id="add-enemy-confirm-btn">Add to Encounter</button>
    </div>
  `);

  document.getElementById('add-enemy-confirm-btn')?.addEventListener('click', async () => {
    const name  = document.getElementById('enemy-name-input').value.trim();
    const maxHP = parseInt(document.getElementById('enemy-hp-input').value, 10);
    const isBoss = document.getElementById('enemy-boss-check').checked;

    if (!name || !maxHP || maxHP < 1) {
      showToast('Enter a name and valid HP.', 'danger');
      return;
    }

    await addEnemy({ name, maxHP, isBoss });
    hideModal();
  });
}

async function addEnemy(opts) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;

  const enemies = snap.data().enemies || [];
  enemies.push({
    id: Date.now().toString(),
    name: opts.name,
    maxHP: opts.maxHP,
    currentHP: opts.maxHP,
    conditions: [],
    isActivated: false,
    isBoss: opts.isBoss ?? false,
    villainActionsUsed: [],
  });

  await updateSessionDoc({ enemies });
}

async function removeEnemy(enemyId) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;

  const enemies = (snap.data().enemies || []).filter(e => e.id !== enemyId);
  await updateSessionDoc({ enemies });
}

async function updateEnemyHP(enemyId, newHP) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;

  const enemies = (snap.data().enemies || []).map(e =>
    e.id === enemyId ? { ...e, currentHP: newHP } : e
  );
  await updateSessionDoc({ enemies });
}

async function markEnemyActivated(enemyId, activated) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;

  const enemies = (snap.data().enemies || []).map(e =>
    e.id === enemyId ? { ...e, isActivated: activated } : e
  );
  await updateSessionDoc({ enemies });
}

async function toggleVillainAction(enemyId, actionNum) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;

  const enemies = (snap.data().enemies || []).map(e => {
    if (e.id !== enemyId) return e;
    const used = e.villainActionsUsed || [];
    const newUsed = used.includes(actionNum)
      ? used.filter(n => n !== actionNum)
      : [...used, actionNum];
    return { ...e, villainActionsUsed: newUsed };
  });
  await updateSessionDoc({ enemies });
}

function showEnemyHPModal(enemy) {
  showModal(`
    <div class="enemy-hp-modal">
      <h2>${enemy.name}</h2>
      <p class="enemy-hp-current">${enemy.currentHP} / ${enemy.maxHP} HP</p>
      <div class="enemy-hp-controls">
        <input type="number" id="enemy-hp-delta" class="wizard-text-input" placeholder="amount" style="width:100px;text-align:center;" />
        <div class="enemy-hp-btns">
          <button class="btn btn-danger" id="enemy-dmg-btn">− Damage</button>
          <button class="btn btn-secondary" id="enemy-heal-btn">+ Heal</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById('enemy-dmg-btn')?.addEventListener('click', async () => {
    const val = parseInt(document.getElementById('enemy-hp-delta').value, 10);
    if (!val || val < 1) return;
    const newHP = enemy.currentHP - val;
    await updateEnemyHP(enemy.id, newHP);
    hideModal();
  });

  document.getElementById('enemy-heal-btn')?.addEventListener('click', async () => {
    const val = parseInt(document.getElementById('enemy-hp-delta').value, 10);
    if (!val || val < 1) return;
    const newHP = Math.min(enemy.currentHP + val, enemy.maxHP);
    await updateEnemyHP(enemy.id, newHP);
    hideModal();
  });
}

// ── Turn order helpers (Director only) ──────────────────────────────────────

async function moveHeroOrder(fromIdx, toIdx) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;
  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;
  const heroes = [...(snap.data().heroes || [])];
  if (toIdx < 0 || toIdx >= heroes.length) return;
  const [item] = heroes.splice(fromIdx, 1);
  heroes.splice(toIdx, 0, item);
  await updateSessionDoc({ heroes });
}

async function moveEnemyOrder(fromIdx, toIdx) {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;
  const snap = await db.collection('sessions').doc(session.code).get();
  if (!snap.exists) return;
  const enemies = [...(snap.data().enemies || [])];
  if (toIdx < 0 || toIdx >= enemies.length) return;
  const [item] = enemies.splice(fromIdx, 1);
  enemies.splice(toIdx, 0, item);
  await updateSessionDoc({ enemies });
}

// ── Director battle board ─────────────────────────────────────────────────────

function updateDirectorBattleBoard(sessionData) {
  let board = document.getElementById('director-battle-board');
  if (!board) {
    board = document.createElement('div');
    board.id = 'director-battle-board';
    const economy = document.getElementById('action-economy');
    economy?.after(board);
  }
  // Re-apply className each render so collapsed state persists across snapshot updates
  board.className = `director-board ${directorBoardCollapsed ? 'collapsed' : ''}`;

  const heroes  = sessionData.heroes  || [];
  const enemies = sessionData.enemies || [];
  const round   = sessionData.round   ?? 1;
  const malice  = sessionData.malice  ?? 0;
  const tokens  = sessionData.heroTokens ?? 0;
  const maliceGainNext = heroes.length + (round + 1);

  // First hero who hasn't acted yet (and isn't currently active) gets NEXT badge
  const nextHeroIdx  = heroes.findIndex(h => !h.hasActed && !h.isActivated);
  // First enemy who hasn't activated yet gets NEXT badge
  const nextEnemyIdx = enemies.findIndex(e => !e.isActivated);

  board.innerHTML = `
    <div class="director-board-header">
      <button class="btn btn-ghost btn-xs board-collapse-btn" id="toggle-board-btn"
              title="${directorBoardCollapsed ? 'Expand' : 'Collapse'} board">
        ${directorBoardCollapsed ? '▸' : '▾'}
      </button>
      <span class="round-label">Round ${round}</span>
      <div class="director-header-stats">
        <span class="malice-pill">☠ ${malice} Malice</span>
        <span class="token-pill">◈ ${tokens} Tokens</span>
      </div>
      <div class="director-header-btns">
        <button class="btn btn-sm btn-ghost" id="next-round-btn">Next Round →</button>
        <button class="btn btn-sm btn-danger" id="end-session-btn">End Session</button>
      </div>
    </div>

    <div class="zipper-board">
      <div class="zipper-side zipper-heroes">
        <div class="zipper-side-label">⚔ HEROES</div>
        <div class="hero-roster">
          ${heroes.map((h, i) => buildHeroRosterCard(h, i, heroes.length, i === nextHeroIdx)).join('')}
        </div>
      </div>
      <div class="zipper-side zipper-villains">
        <div class="zipper-side-label">☠ VILLAINS</div>
        <div class="enemy-roster" id="enemy-roster">
          ${enemies.map((e, i) => buildEnemyCard(e, i, enemies.length, i === nextEnemyIdx)).join('')}
          <button class="btn btn-ghost btn-small" id="add-enemy-btn">+ Add Enemy</button>
        </div>
      </div>
    </div>

    <div class="director-board-footer">
      <div class="side-toggle">
        <button class="btn btn-sm ${sessionData.activeSide === 'heroes' ? 'btn-primary' : 'btn-ghost'}" id="heroes-go-btn">◀ Heroes Go</button>
        <button class="btn btn-sm ${sessionData.activeSide === 'villains' ? 'btn-primary' : 'btn-ghost'}" id="villains-go-btn">Enemies Go ▶</button>
      </div>
      <div class="malice-tracker">
        <span class="malice-label">MALICE</span>
        <button class="recovery-adj" id="malice-minus">−</button>
        <span class="malice-value" id="malice-value">${malice}</span>
        <button class="recovery-adj" id="malice-plus">+</button>
        <button class="btn btn-ghost btn-small" id="start-combat-btn">Set Start</button>
        <span class="malice-gain-preview">+${maliceGainNext} next round</span>
      </div>
    </div>
  `;

  // Wire buttons
  document.getElementById('toggle-board-btn')?.addEventListener('click', () => {
    directorBoardCollapsed = !directorBoardCollapsed;
    board.className = `director-board ${directorBoardCollapsed ? 'collapsed' : ''}`;
    const btn = document.getElementById('toggle-board-btn');
    if (btn) {
      btn.textContent = directorBoardCollapsed ? '▸' : '▾';
      btn.title = directorBoardCollapsed ? 'Expand board' : 'Collapse board';
    }
  });
  document.getElementById('next-round-btn')?.addEventListener('click', advanceRound);
  document.getElementById('end-session-btn')?.addEventListener('click', endSession);
  document.getElementById('add-enemy-btn')?.addEventListener('click', showAddEnemyModal);
  document.getElementById('heroes-go-btn')?.addEventListener('click', () => setActiveSide('heroes'));
  document.getElementById('villains-go-btn')?.addEventListener('click', () => setActiveSide('villains'));
  document.getElementById('malice-minus')?.addEventListener('click', () => adjustMalice(-1));
  document.getElementById('malice-plus')?.addEventListener('click', () => adjustMalice(1));
  document.getElementById('start-combat-btn')?.addEventListener('click', startCombat);

  // Wire hero order buttons
  heroes.forEach((hero, idx) => {
    document.getElementById(`hero-up-${idx}`)
      ?.addEventListener('click', () => moveHeroOrder(idx, idx - 1));
    document.getElementById(`hero-down-${idx}`)
      ?.addEventListener('click', () => moveHeroOrder(idx, idx + 1));
  });

  // Wire enemy-specific buttons
  enemies.forEach((enemy, idx) => {
    document.getElementById(`enemy-hp-btn-${enemy.id}`)
      ?.addEventListener('click', () => showEnemyHPModal(enemy));
    document.getElementById(`enemy-activated-${enemy.id}`)
      ?.addEventListener('click', () => markEnemyActivated(enemy.id, !enemy.isActivated));
    document.getElementById(`enemy-remove-${enemy.id}`)
      ?.addEventListener('click', () => {
        if (confirm(`Remove ${enemy.name}?`)) removeEnemy(enemy.id);
      });
    document.getElementById(`enemy-up-${idx}`)
      ?.addEventListener('click', () => moveEnemyOrder(idx, idx - 1));
    document.getElementById(`enemy-down-${idx}`)
      ?.addEventListener('click', () => moveEnemyOrder(idx, idx + 1));
    if (enemy.isBoss) {
      [1, 2, 3].forEach(n => {
        document.getElementById(`va-${enemy.id}-${n}`)
          ?.addEventListener('click', () => toggleVillainAction(enemy.id, n));
      });
    }
  });
}

function buildHeroRosterCard(hero, idx, total, isNext) {
  const hpPercent = hero.maxHP > 0 ? Math.round((hero.currentHP / hero.maxHP) * 100) : 0;
  const hpColor   = hpPercent > 60 ? '#2ecc71' : hpPercent > 30 ? '#f39c12' : '#e74c3c';
  const stateClass = hero.isActivated ? 'is-active' : hero.hasActed ? 'done' : '';

  return `
    <div class="hero-roster-card ${stateClass}">
      <div class="roster-name">
        <div class="roster-name-row">
          ${isNext ? '<span class="next-badge">NEXT ▶</span>' : ''}
          ${hero.displayName}
        </div>
        <div class="roster-order-btns">
          <button class="order-btn" id="hero-up-${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up">▲</button>
          <span class="order-pos">${idx + 1}</span>
          <button class="order-btn" id="hero-down-${idx}" ${idx === total - 1 ? 'disabled' : ''} title="Move down">▼</button>
        </div>
      </div>
      <div class="roster-state-badges">
        ${hero.isActivated ? '<span class="activation-badge badge-active">ACTIVE</span>' : hero.hasActed ? '<span class="activation-badge badge-done">DONE ✓</span>' : ''}
      </div>
      <div class="roster-hp">
        <div class="hp-bar-track">
          <div class="hp-bar-fill" style="width:${Math.max(0, hpPercent)}%;background:${hpColor}"></div>
        </div>
        <span class="hp-text">${hero.currentHP}/${hero.maxHP}</span>
      </div>
      <div class="roster-resource">
        ${hero.heroicResource?.current ?? 0}/${hero.heroicResource?.max ?? 0}
        <span class="roster-resource-name">${hero.heroicResource?.name ?? ''}</span>
      </div>
      ${hero.conditions?.length ? `
        <div class="roster-conditions">
          ${hero.conditions.map(c => `<span class="condition-badge">${c}</span>`).join('')}
        </div>
      ` : ''}
      <div class="roster-buckets">
        <span class="roster-bucket ${hero.hasActed ? 'spent' : 'ready'}" title="Action">⚔</span>
        <span class="roster-bucket ${hero.hasManeuvered ? 'spent' : 'ready'}" title="Maneuver">◈</span>
        <span class="roster-bucket ${hero.hasUsedTriggered ? 'spent' : 'ready'}" title="Triggered">⟳</span>
      </div>
    </div>
  `;
}

function buildEnemyCard(enemy, idx, total, isNext) {
  const hpPercent = enemy.maxHP > 0 ? Math.round((enemy.currentHP / enemy.maxHP) * 100) : 0;
  const hpColor   = hpPercent > 60 ? '#2ecc71' : hpPercent > 30 ? '#f39c12' : '#e74c3c';
  const vaUsed    = enemy.villainActionsUsed || [];

  return `
    <div class="enemy-roster-card ${enemy.isActivated ? 'enemy-done' : ''}">
      <div class="enemy-card-header">
        <div class="enemy-name-row">
          ${isNext ? '<span class="next-badge next-badge-enemy">NEXT ▶</span>' : ''}
          <span class="enemy-card-name">${enemy.name}${enemy.isBoss ? ' 👑' : ''}</span>
        </div>
        <div class="enemy-card-btns">
          <div class="roster-order-btns roster-order-btns-sm">
            <button class="order-btn" id="enemy-up-${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up">▲</button>
            <span class="order-pos">${idx + 1}</span>
            <button class="order-btn" id="enemy-down-${idx}" ${idx === total - 1 ? 'disabled' : ''} title="Move down">▼</button>
          </div>
          <button class="btn btn-ghost btn-xs" id="enemy-activated-${enemy.id}">
            ${enemy.isActivated ? 'DONE ✓' : 'Activate'}
          </button>
          <button class="btn btn-ghost btn-xs btn-danger-ghost" id="enemy-remove-${enemy.id}">✕</button>
        </div>
      </div>
      <div class="enemy-card-hp">
        <div class="hp-bar-track">
          <div class="hp-bar-fill" style="width:${Math.max(0, hpPercent)}%;background:${hpColor}"></div>
        </div>
        <button class="hp-text hp-text-btn" id="enemy-hp-btn-${enemy.id}">${enemy.currentHP}/${enemy.maxHP}</button>
      </div>
      ${enemy.conditions?.length ? `
        <div class="roster-conditions">
          ${enemy.conditions.map(c => `<span class="condition-badge">${c}</span>`).join('')}
        </div>
      ` : ''}
      ${enemy.isBoss ? `
        <div class="villain-actions">
          ${[1, 2, 3].map(n => `
            <button
              class="va-btn ${vaUsed.includes(n) ? 'used' : ''}"
              id="va-${enemy.id}-${n}"
              title="Villain Action ${n}">
              VA ${n}${vaUsed.includes(n) ? ' ✓' : ''}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ── Combat overlay activation ─────────────────────────────────────────────────

function activateCombatOverlay(isDirector) {
  document.getElementById('session-indicator')?.classList.remove('hidden');
  document.getElementById('action-economy')?.classList.remove('hidden');
  document.getElementById('session-controls')?.classList.remove('hidden');
  document.getElementById('hero-tokens-bar')?.classList.remove('hidden');
  document.getElementById('join-session-fab')?.classList.add('hidden');
  updateActionEconomyUI();
}

// ── Leave / end session ───────────────────────────────────────────────────────

async function endSession() {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;
  if (!confirm('End the session for everyone?')) return;

  try {
    await db.collection('sessions').doc(session.code).update({ active: false });
  } catch (e) {
    console.error('Error ending session:', e);
  }
  leaveSession();
}

function leaveSession() {
  if (sessionUnsubscribe) {
    sessionUnsubscribe();
    sessionUnsubscribe = null;
  }

  AppState.currentSession = null;

  document.getElementById('session-indicator')?.classList.add('hidden');
  document.getElementById('action-economy')?.classList.add('hidden');
  document.getElementById('session-controls')?.classList.add('hidden');
  document.getElementById('hero-tokens-bar')?.classList.add('hidden');
  document.getElementById('director-battle-board')?.remove();
  document.getElementById('active-side-banner')?.remove();
  document.getElementById('join-session-fab')?.classList.remove('hidden');

  // Reset take/end turn buttons to default state
  document.getElementById('take-turn-btn')?.classList.remove('hidden');
  document.getElementById('end-turn-btn')?.classList.add('hidden');

  resetTurnState();
}

// ── Round display ─────────────────────────────────────────────────────────────

function updateRoundDisplay(round) {
  const indicator = document.getElementById('session-indicator');
  if (indicator) {
    indicator.innerHTML = `
      <span class="session-pulse"></span>
      <span>IN SESSION · Round ${round}</span>
    `;
  }
}

// ── Check for resumable sessions ─────────────────────────────────────────────

/**
 * Returns { code, role: 'director'|'player' } if there's an active session
 * this user can resume (created within the last 24 hours), or null.
 */
async function checkForActiveSessions(userId) {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  try {
    // 1. Check if user is the director of any active session
    const directorSnap = await db.collection('sessions')
      .where('active', '==', true)
      .where('directorId', '==', userId)
      .limit(1)
      .get();

    if (!directorSnap.empty) {
      const doc = directorSnap.docs[0];
      const data = doc.data();
      const createdAt = data.createdAt?.toMillis?.() ?? 0;
      if (Date.now() - createdAt < TWENTY_FOUR_HOURS) {
        return { code: doc.id, role: 'director' };
      }
    }

    // 2. Check if user appears in any active session's userIds array
    const playerSnap = await db.collection('sessions')
      .where('active', '==', true)
      .where('userIds', 'array-contains', userId)
      .limit(1)
      .get();

    if (!playerSnap.empty) {
      const doc = playerSnap.docs[0];
      const data = doc.data();
      const createdAt = data.createdAt?.toMillis?.() ?? 0;
      if (Date.now() - createdAt < TWENTY_FOUR_HOURS) {
        // Make sure they're not the director (would have been caught above unless expired)
        const role = data.directorId === userId ? 'director' : 'player';
        return { code: doc.id, role };
      }
    }
  } catch (e) {
    console.error('Error checking for active sessions:', e);
  }

  return null;
}

// ── Resume a session (called from character sheet) ────────────────────────────

async function resumeSession(code, isDirector) {
  const user = AppState.currentUser;
  const char = AppState.currentCharacter;
  if (!user || !char) return;

  try {
    // Refresh hero entry in session doc so stats are current
    const sessionRef = db.collection('sessions').doc(code);
    const snap = await sessionRef.get();
    if (!snap.exists || !snap.data().active) {
      showToast('Session is no longer active.', 'danger');
      resetJoinSessionFab();
      return;
    }

    const heroEntry = buildHeroEntry(user, char);
    const heroes = snap.data().heroes || [];
    const existingIdx = heroes.findIndex(h => h.userId === user.uid);

    if (existingIdx >= 0) {
      heroes[existingIdx] = { ...heroes[existingIdx], ...heroEntry };
    } else {
      heroes.push(heroEntry);
    }

    await sessionRef.update({
      heroes,
      userIds: firebase.firestore.FieldValue.arrayUnion(user.uid),
    });

    AppState.currentSession = { code, isDirector };
    joinSessionListeners(code);
    activateCombatOverlay(isDirector);
  } catch (e) {
    console.error('Error resuming session:', e);
    showToast('Could not resume session.', 'danger');
  }
}

function resetJoinSessionFab() {
  const fab = document.getElementById('join-session-fab');
  if (!fab) return;
  fab.innerHTML = `
    <button id="join-session-btn" class="btn btn-secondary">Join Session</button>
    <button id="start-session-btn" class="btn btn-ghost btn-small">Start as Director</button>
  `;
  document.getElementById('join-session-btn')?.addEventListener('click', promptJoinSession);
  document.getElementById('start-session-btn')?.addEventListener('click', createSession);
}

// ── Wire up join/start buttons ────────────────────────────────────────────────

document.getElementById('join-session-btn')?.addEventListener('click', promptJoinSession);
document.getElementById('start-session-btn')?.addEventListener('click', createSession);

// ── Expose globals ────────────────────────────────────────────────────────────
window.createSession          = createSession;
window.promptJoinSession      = promptJoinSession;
window.updateHeroInSession    = updateHeroInSession;
window.leaveSession           = leaveSession;
window.checkForActiveSessions = checkForActiveSessions;
window.resumeSession          = resumeSession;
window.resetJoinSessionFab    = resetJoinSessionFab;
