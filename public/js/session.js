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

      // Director board — runner screen or classic overlay
      if (AppState.currentSession?.isRunnerMode) {
        updateEncounterRunner(data);
      } else if (AppState.currentSession?.isDirector) {
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
  // Stamina thresholds read from the design system, not flat-UI hex.
  const hpColor   = hpPercent > 60 ? 'var(--stamina-fill)'
                  : hpPercent > 30 ? 'var(--stamina-winded)' : 'var(--stamina-dying)';
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
  // Stamina thresholds read from the design system, not flat-UI hex.
  const hpColor   = hpPercent > 60 ? 'var(--stamina-fill)'
                  : hpPercent > 30 ? 'var(--stamina-winded)' : 'var(--stamina-dying)';
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

let _leavingSession = false;

function leaveSession() {
  if (_leavingSession) return;
  _leavingSession = true;

  const wasRunnerMode = AppState.currentSession?.isRunnerMode;

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
  document.getElementById('take-turn-btn')?.classList.remove('hidden');
  document.getElementById('end-turn-btn')?.classList.add('hidden');

  resetTurnState();

  // Runner mode: navigate back to campaign screen
  if (wasRunnerMode) {
    AppState.currentRunnerCampaign  = null;
    AppState.currentRunnerEncounter = null;
    if (typeof showScreen === 'function' && typeof SCREENS !== 'undefined') {
      showScreen(SCREENS.CAMPAIGN);
      if (typeof renderCampaignScreen === 'function') renderCampaignScreen();
    }
  }

  _leavingSession = false;
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

// ── J2: Encounter Runner ──────────────────────────────────────────────────────

function updateEncounterRunner(sessionData) {
  // Non-combat encounter types get their own trackers
  if (sessionData.encounterType === 'negotiation') {
    renderNegotiationRunner(sessionData);
    return;
  }
  if (sessionData.encounterType === 'montage') {
    renderMontageRunner(sessionData);
    return;
  }

  const heroes  = sessionData.heroes  || [];
  const enemies = sessionData.enemies || [];
  const round   = sessionData.round   ?? 1;
  const malice  = sessionData.malice  ?? 0;
  const tokens  = sessionData.heroTokens ?? 0;

  // Header stats
  const roundEl = document.getElementById('runner-round');
  if (roundEl) roundEl.textContent = `Round ${round}`;

  // Malice
  const maliceEl = document.getElementById('runner-malice-value');
  if (maliceEl) maliceEl.textContent = malice;
  const maliceNextEl = document.getElementById('runner-malice-next');
  if (maliceNextEl) maliceNextEl.textContent = `+${heroes.length + round + 1} next rnd`;

  // Tokens
  const tokenEl = document.getElementById('runner-token-count');
  if (tokenEl) tokenEl.textContent = tokens;

  // Active side
  const activeLabel    = document.getElementById('runner-active-label');
  const heroesGoBtn    = document.getElementById('runner-heroes-go-btn');
  const villainsGoBtn  = document.getElementById('runner-villains-go-btn');
  if (activeLabel) {
    activeLabel.textContent = sessionData.activeSide === 'heroes' ? '⚔ HEROES GO'
      : sessionData.activeSide === 'villains' ? '☠ ENEMIES GO' : '—';
  }
  if (heroesGoBtn)   heroesGoBtn.className   = `btn btn-sm ${sessionData.activeSide === 'heroes'   ? 'btn-primary' : 'btn-ghost'}`;
  if (villainsGoBtn) villainsGoBtn.className = `btn btn-sm ${sessionData.activeSide === 'villains' ? 'btn-primary' : 'btn-ghost'}`;

  // Hero list
  const nextHeroIdx  = heroes.findIndex(h => !h.hasActed && !h.isActivated);
  const heroListEl   = document.getElementById('runner-hero-list');
  if (heroListEl) heroListEl.innerHTML = heroes.map((h, i) => buildRunnerHeroCard(h, i, i === nextHeroIdx)).join('') || '<p class="panel-empty">No heroes yet.</p>';

  // Enemy list
  const nextEnemyIdx = enemies.findIndex(e => !e.isActivated);
  const enemyListEl  = document.getElementById('runner-enemy-list');
  if (enemyListEl) enemyListEl.innerHTML = enemies.map((e, i) => buildRunnerEnemyCard(e, i, enemies.length, i === nextEnemyIdx)).join('') || '<p class="panel-empty">No enemies.</p>';

  // Turn order (center)
  const turnOrderEl = document.getElementById('runner-turn-order');
  if (turnOrderEl) {
    turnOrderEl.innerHTML = `
      <div class="runner-turn-section">
        <div class="runner-turn-section-label">⚔ HEROES</div>
        ${heroes.map((h, i) => buildRunnerTurnRow(h.displayName, 'hero', h.isActivated, h.hasActed, i === nextHeroIdx)).join('') || '<div class="runner-turn-empty">None</div>'}
      </div>
      <div class="runner-turn-section">
        <div class="runner-turn-section-label">☠ ENEMIES</div>
        ${enemies.map((e, i) => buildRunnerTurnRow(e.name, 'enemy', e.isActivated, false, i === nextEnemyIdx)).join('') || '<div class="runner-turn-empty">None</div>'}
        <button class="btn btn-ghost btn-small runner-add-enemy-turn" id="runner-add-enemy-turn-btn" style="margin-top:8px">+ Add Enemy</button>
      </div>
    `;
  }

  wireRunnerButtons(sessionData);
}

// ── K2: Negotiation Runner ────────────────────────────────────────────────────

function negInterestLabel(n) {
  return ['', 'Hostile', 'Suspicious', 'Neutral', 'Friendly', 'Allied'][n] || '';
}

function renderNegotiationRunner(sessionData) {
  const neg     = sessionData.negotiation || {};
  const round   = sessionData.round   ?? 1;
  const heroes  = sessionData.heroes  || [];
  const interest = neg.currentInterest ?? 3;
  const patience = neg.currentPatience ?? 3;
  const npcName  = neg.npcName || 'Unknown NPC';
  const motivations = neg.motivations || [];
  const pitfalls    = neg.pitfalls    || [];

  // Header round
  const roundEl = document.getElementById('runner-round');
  if (roundEl) roundEl.textContent = `Round ${round}`;

  const INTEREST_COLORS = ['', '#c0392b', '#e67e22', '#d4ac0d', 'var(--color-available)', 'var(--color-gold)'];
  const patienceColor = patience <= 1 ? 'var(--color-danger)' : patience <= 2 ? '#e67e22' : 'var(--color-available)';

  // Replace body with negotiation layout
  const body = document.querySelector('#encounter-runner-screen .runner-body');
  if (body) {
    body.innerHTML = `
      <!-- Left: NPC reference -->
      <div class="runner-panel runner-panel-neg-ref">
        <div class="runner-panel-header">
          <span class="runner-panel-title">NPC REFERENCE</span>
        </div>
        <div class="neg-runner-npc-name">${npcName}</div>
        ${neg.npcDescription ? `<p class="neg-runner-npc-desc">${neg.npcDescription}</p>` : ''}

        ${motivations.length ? `
          <div class="neg-runner-section">
            <div class="neg-runner-section-title neg-section-motivation">MOTIVATIONS</div>
            <ul class="neg-runner-list">
              ${motivations.filter(Boolean).map(m => `<li>${m}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${pitfalls.length ? `
          <div class="neg-runner-section">
            <div class="neg-runner-section-title neg-section-pitfall">PITFALLS</div>
            <ul class="neg-runner-list neg-runner-list-pitfall">
              ${pitfalls.filter(Boolean).map(p => `<li>${p}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${neg.successOutcome || neg.failureOutcome ? `
          <div class="neg-runner-section">
            <div class="neg-runner-section-title">OUTCOMES</div>
            ${neg.successOutcome ? `<div class="neg-outcome-row neg-outcome-success"><span class="neg-outcome-label">Success:</span> ${neg.successOutcome}</div>` : ''}
            ${neg.failureOutcome ? `<div class="neg-outcome-row neg-outcome-failure"><span class="neg-outcome-label">Failure:</span> ${neg.failureOutcome}</div>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Center: Interest tracker -->
      <div class="runner-panel runner-panel-neg-tracker">
        <div class="runner-panel-header">
          <span class="runner-panel-title">INTEREST TRACKER</span>
        </div>
        <div class="neg-runner-interest-block">
          <div class="neg-runner-pips">
            ${[1,2,3,4,5].map(n => `
              <div class="neg-runner-pip ${n <= interest ? 'neg-runner-pip-filled' : ''}"
                style="${n <= interest ? `background:${INTEREST_COLORS[n]};border-color:${INTEREST_COLORS[n]}` : ''}">
                ${n}
              </div>
            `).join('')}
          </div>
          <div class="neg-runner-interest-text" style="color:${INTEREST_COLORS[interest]}">
            ${negInterestLabel(interest).toUpperCase()}
          </div>
          <div class="neg-runner-interest-controls">
            <button class="btn btn-large neg-interest-change-btn" id="neg-minus-btn"
              ${interest <= 1 ? 'disabled' : ''}>−</button>
            <span class="neg-runner-interest-value" style="color:${INTEREST_COLORS[interest]}">${interest}</span>
            <button class="btn btn-large neg-interest-change-btn" id="neg-plus-btn"
              ${interest >= 5 ? 'disabled' : ''}>+</button>
          </div>
        </div>

        <div class="neg-runner-patience-block">
          <div class="neg-runner-patience-label">PATIENCE REMAINING</div>
          <div class="neg-runner-patience-value" style="color:${patienceColor}">${patience}</div>
          <div class="neg-runner-patience-hint">${patience === 0 ? 'Patience exhausted!' : patience === 1 ? 'Last round!' : `rounds left`}</div>
        </div>
      </div>

      <!-- Right: Heroes -->
      <div class="runner-panel runner-panel-neg-heroes">
        <div class="runner-panel-header">
          <span class="runner-panel-title">HEROES</span>
        </div>
        <div class="neg-runner-hero-list">
          ${heroes.map(h => {
            const accent = (typeof CLASS_COLORS !== 'undefined' && CLASS_COLORS?.[h.class]?.accent) || '#2980B9';
            return `
              <div class="neg-runner-hero-row" style="border-left-color:${accent}">
                <span class="neg-runner-hero-name">${h.displayName}</span>
                <span class="neg-runner-hero-class">${h.class || ''}</span>
              </div>
            `;
          }).join('') || '<p class="panel-empty">No heroes yet.</p>'}
        </div>
      </div>
    `;
  }

  // Replace bottom bar
  const bottomBar = document.querySelector('#encounter-runner-screen .runner-bottom-bar');
  if (bottomBar) {
    bottomBar.innerHTML = `
      <div class="neg-runner-bottom">
        <span class="neg-runner-round-label">Round ${round}</span>
        <button class="btn btn-secondary" id="neg-next-round-btn"
          ${patience === 0 ? 'disabled' : ''}>Next Round →</button>
        <button class="btn btn-danger btn-small" id="neg-end-btn">End Negotiation</button>
      </div>
    `;
  }

  wireNegotiationButtons(sessionData);

  // Auto-detect end conditions
  if (interest >= 5) {
    setTimeout(() => showNegotiationEndModal('success', sessionData), 200);
  } else if (interest <= 1) {
    setTimeout(() => showNegotiationEndModal('failure', sessionData), 200);
  } else if (patience === 0) {
    setTimeout(() => showNegotiationEndModal('patience', sessionData), 200);
  }
}

function wireNegotiationButtons(sessionData) {
  const code = AppState.currentSession?.code;
  if (!code) return;

  document.getElementById('neg-minus-btn')?.addEventListener('click', () => {
    changeNegotiationInterest(-1, sessionData, code);
  });
  document.getElementById('neg-plus-btn')?.addEventListener('click', () => {
    changeNegotiationInterest(+1, sessionData, code);
  });
  document.getElementById('neg-next-round-btn')?.addEventListener('click', () => {
    advanceNegotiationRound(sessionData, code);
  });
  document.getElementById('neg-end-btn')?.addEventListener('click', () => {
    const neg = sessionData.negotiation || {};
    const interest = neg.currentInterest ?? 3;
    const outcome = interest >= 5 ? 'success' : interest <= 1 ? 'failure' : 'patience';
    showNegotiationEndModal(outcome, sessionData);
  });
}

async function changeNegotiationInterest(delta, sessionData, code) {
  const neg     = sessionData.negotiation || {};
  const current = neg.currentInterest ?? 3;
  const newVal  = Math.max(1, Math.min(5, current + delta));
  if (newVal === current) return;
  try {
    await db.collection('sessions').doc(code).update({
      'negotiation.currentInterest': newVal,
    });
  } catch (e) {
    console.error('changeNegotiationInterest:', e);
    showToast('Could not update interest.', 'danger');
  }
}

async function advanceNegotiationRound(sessionData, code) {
  const neg        = sessionData.negotiation || {};
  const patience   = neg.currentPatience ?? 1;
  const newPatience = Math.max(0, patience - 1);
  const newRound   = (sessionData.round ?? 1) + 1;
  try {
    await db.collection('sessions').doc(code).update({
      round: newRound,
      'negotiation.currentPatience': newPatience,
    });
  } catch (e) {
    console.error('advanceNegotiationRound:', e);
    showToast('Could not advance round.', 'danger');
  }
}

function showNegotiationEndModal(outcome, sessionData) {
  const neg     = sessionData.negotiation || {};
  const npcName = neg.npcName || 'the NPC';

  const OUTCOME_CONFIG = {
    success: {
      title:   'Negotiation Succeeded!',
      icon:    '◆',
      color:   'var(--color-gold)',
      desc:    `${npcName} has been won over. Interest reached 5.`,
      outcome: neg.successOutcome || '',
      vicCount: 1,
    },
    failure: {
      title:   'Negotiation Failed',
      icon:    '✕',
      color:   'var(--color-danger)',
      desc:    `${npcName} has turned hostile. Interest fell to 1.`,
      outcome: neg.failureOutcome || '',
      vicCount: 0,
    },
    patience: {
      title:   'Patience Exhausted',
      icon:    '⧗',
      color:   '#e67e22',
      desc:    `${npcName} has ended the negotiation. Patience ran out.`,
      outcome: neg.failureOutcome || '',
      vicCount: 0,
    },
  };

  const cfg = OUTCOME_CONFIG[outcome] || OUTCOME_CONFIG.failure;

  showModal(`
    <div class="neg-end-modal">
      <div class="neg-end-icon" style="color:${cfg.color}">${cfg.icon}</div>
      <h2 class="neg-end-title" style="color:${cfg.color}">${cfg.title}</h2>
      <p class="neg-end-desc">${cfg.desc}</p>
      ${cfg.outcome ? `<p class="neg-end-outcome-text">${cfg.outcome}</p>` : ''}

      ${cfg.vicCount > 0 ? `
        <div class="neg-end-victory-row">
          <span class="neg-end-victory-label">Victory Awarded:</span>
          <span class="neg-end-victory-value">1V per hero</span>
        </div>
        <button class="btn btn-primary" id="neg-award-victory-btn"
          style="width:100%;margin-top:12px">
          Award Victory &amp; End
        </button>
        <button class="btn btn-ghost btn-small" id="neg-no-victory-btn"
          style="width:100%;margin-top:6px">
          End Without Victory
        </button>
      ` : `
        <button class="btn btn-primary" id="neg-no-victory-btn"
          style="width:100%;margin-top:12px">
          End Negotiation
        </button>
      `}
    </div>
  `);

  const campaign = AppState.currentRunnerCampaign;
  const enc      = AppState.currentRunnerEncounter;
  const code     = AppState.currentSession?.code;

  document.getElementById('neg-award-victory-btn')?.addEventListener('click', () => {
    if (typeof performEndEncounter === 'function') {
      performEndEncounter(campaign, enc, code, cfg.vicCount);
    }
  });
  document.getElementById('neg-no-victory-btn')?.addEventListener('click', () => {
    if (typeof performEndEncounter === 'function') {
      performEndEncounter(campaign, enc, code, 0);
    }
  });
}

// ── L2: Montage Runner ────────────────────────────────────────────────────────

function renderMontageRunner(sessionData) {
  const m        = sessionData.montage || {};
  const round    = sessionData.round ?? 1;
  const heroes   = sessionData.heroes || [];
  const needed   = m.successesNeeded ?? 4;
  const limit    = m.roundLimit      ?? 4;
  const total    = m.totalSuccesses  ?? 0;
  const heroResults = m.heroResults  || heroes.map(() => null);
  const challenges  = m.challenges   || [];
  const pct      = Math.min(100, Math.round((total / needed) * 100));
  const barColor = total >= needed ? 'var(--color-gold)'
    : pct >= 60 ? 'var(--color-available)' : '#2980B9';
  const roundsLeft = limit - round + 1;
  const roundColor = roundsLeft <= 1 ? 'var(--color-danger)' : roundsLeft <= 2 ? '#e67e22' : 'var(--color-available)';

  // Update round header
  const roundEl = document.getElementById('runner-round');
  if (roundEl) roundEl.textContent = `Round ${round}`;

  const RESULT_CFG = {
    success: { label: 'Success',   pts: 2, color: 'var(--color-available)', icon: '◆' },
    partial: { label: 'Partial',   pts: 1, color: '#e67e22',                icon: '◈' },
    failure: { label: 'Failure',   pts: 0, color: 'var(--color-danger)',    icon: '✕' },
  };

  const body = document.querySelector('#encounter-runner-screen .runner-body');
  if (body) {
    body.innerHTML = `
      <!-- Left: Challenge reference -->
      <div class="runner-panel runner-panel-montage-ref">
        <div class="runner-panel-header">
          <span class="runner-panel-title">CHALLENGES</span>
        </div>
        ${m.description ? `<p class="montage-runner-desc">${m.description}</p>` : ''}
        ${challenges.length ? `
          <div class="montage-challenge-list">
            ${challenges.filter(Boolean).map(ch => `
              <div class="montage-runner-challenge">
                <div class="montage-runner-ch-name">${ch.name || 'Unnamed'}
                  <span class="montage-runner-ch-tier montage-tier-${ch.tier || 'medium'}">${(ch.tier || 'medium').toUpperCase()}</span>
                </div>
                ${ch.desc ? `<div class="montage-runner-ch-desc">${ch.desc}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : '<p class="panel-empty">No challenges defined.</p>'}
        ${m.successOutcome || m.failureOutcome ? `
          <div class="montage-outcomes-section">
            ${m.successOutcome ? `<div class="montage-outcome-row montage-outcome-success"><span class="neg-outcome-label">Success:</span> ${m.successOutcome}</div>` : ''}
            ${m.failureOutcome ? `<div class="montage-outcome-row montage-outcome-failure"><span class="neg-outcome-label">Failure:</span> ${m.failureOutcome}</div>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Center: Per-hero test recording -->
      <div class="runner-panel runner-panel-montage-heroes">
        <div class="runner-panel-header">
          <span class="runner-panel-title">ROUND ${round} TESTS</span>
        </div>
        <div class="montage-hero-tests">
          ${heroes.map((h, i) => {
            const accent  = (typeof CLASS_COLORS !== 'undefined' && CLASS_COLORS?.[h.class]?.accent) || '#2980B9';
            const result  = heroResults[i];
            const resCfg  = result ? RESULT_CFG[result] : null;
            return `
              <div class="montage-hero-row" style="border-left-color:${accent}">
                <div class="montage-hero-name-row">
                  <span class="montage-hero-name">${h.displayName}</span>
                  <span class="montage-hero-class">${h.class || ''}</span>
                </div>
                <div class="montage-result-btns">
                  ${Object.entries(RESULT_CFG).map(([key, cfg]) => `
                    <button class="montage-result-btn ${result === key ? 'montage-result-active' : ''}"
                      data-hero-idx="${i}" data-result="${key}"
                      style="${result === key ? `background:${cfg.color};border-color:${cfg.color};color:#fff` : ''}">
                      ${cfg.icon} ${cfg.label}
                    </button>
                  `).join('')}
                </div>
                ${resCfg ? `<div class="montage-hero-result-label" style="color:${resCfg.color}">${resCfg.icon} ${resCfg.label} (+${resCfg.pts})</div>` : '<div class="montage-hero-result-label" style="color:var(--text-dim)">No result yet</div>'}
              </div>
            `;
          }).join('') || '<p class="panel-empty">No heroes.</p>'}
        </div>
      </div>

      <!-- Right: Progress tracker -->
      <div class="runner-panel runner-panel-montage-progress">
        <div class="runner-panel-header">
          <span class="runner-panel-title">PROGRESS</span>
        </div>

        <div class="montage-progress-block">
          <div class="montage-progress-label">SUCCESSES</div>
          <div class="montage-progress-fraction">
            <span class="montage-progress-current" style="color:${barColor}">${total}</span>
            <span class="montage-progress-sep">/</span>
            <span class="montage-progress-needed">${needed}</span>
          </div>
          <div class="montage-progress-bar-track">
            <div class="montage-progress-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div class="montage-progress-pct">${pct}%</div>
        </div>

        <div class="montage-rounds-block">
          <div class="montage-rounds-label">ROUNDS REMAINING</div>
          <div class="montage-rounds-value" style="color:${roundColor}">${roundsLeft}</div>
          <div class="montage-rounds-hint">${roundsLeft <= 0 ? 'Time is up!' : roundsLeft === 1 ? 'Final round!' : `of ${limit} total`}</div>
        </div>

        <div class="montage-this-round-block">
          <div class="montage-this-round-label">THIS ROUND</div>
          ${heroes.map((h, i) => {
            const r = heroResults[i];
            const cfg = r ? RESULT_CFG[r] : null;
            return `
              <div class="montage-round-hero-row">
                <span class="montage-round-hero-name">${h.displayName}</span>
                <span class="montage-round-hero-result" style="color:${cfg ? cfg.color : 'var(--text-dim)'}">
                  ${cfg ? `${cfg.icon} +${cfg.pts}` : '—'}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Bottom bar
  const bottomBar = document.querySelector('#encounter-runner-screen .runner-bottom-bar');
  if (bottomBar) {
    const allRecorded = heroes.length > 0 && heroResults.every(r => r !== null && r !== undefined);
    bottomBar.innerHTML = `
      <div class="neg-runner-bottom">
        <span class="neg-runner-round-label">Round ${round} / ${limit}</span>
        <button class="btn btn-secondary" id="montage-end-round-btn"
          ${!allRecorded || roundsLeft <= 0 ? 'disabled' : ''}
          title="${!allRecorded ? 'Record all hero results first' : ''}">
          End Round →
        </button>
        <button class="btn btn-danger btn-small" id="montage-end-btn">End Montage</button>
      </div>
    `;
  }

  wireMontageButtons(sessionData);

  // Auto-detect end conditions
  if (total >= needed) {
    setTimeout(() => showMontageEndModal('success', sessionData), 200);
  } else if (roundsLeft <= 0) {
    setTimeout(() => showMontageEndModal('failure', sessionData), 200);
  }
}

function wireMontageButtons(sessionData) {
  const code = AppState.currentSession?.code;
  if (!code) return;

  document.querySelectorAll('.montage-result-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const heroIdx = parseInt(btn.dataset.heroIdx, 10);
      const result  = btn.dataset.result;
      recordMontageResult(heroIdx, result, sessionData, code);
    });
  });

  document.getElementById('montage-end-round-btn')?.addEventListener('click', () => {
    advanceMontageRound(sessionData, code);
  });

  document.getElementById('montage-end-btn')?.addEventListener('click', () => {
    const m      = sessionData.montage || {};
    const total  = m.totalSuccesses ?? 0;
    const needed = m.successesNeeded ?? 4;
    const outcome = total >= needed ? 'success' : 'failure';
    showMontageEndModal(outcome, sessionData);
  });
}

async function recordMontageResult(heroIdx, result, sessionData, code) {
  const m           = sessionData.montage || {};
  const heroResults = [...(m.heroResults || (sessionData.heroes || []).map(() => null))];
  heroResults[heroIdx] = result;
  try {
    await db.collection('sessions').doc(code).update({
      'montage.heroResults': heroResults,
    });
  } catch (e) {
    console.error('recordMontageResult:', e);
    showToast('Could not record result.', 'danger');
  }
}

async function advanceMontageRound(sessionData, code) {
  const m           = sessionData.montage || {};
  const heroResults = m.heroResults || [];
  const RESULT_PTS  = { success: 2, partial: 1, failure: 0 };
  const roundPts    = heroResults.reduce((sum, r) => sum + (RESULT_PTS[r] ?? 0), 0);
  const newTotal    = (m.totalSuccesses ?? 0) + roundPts;
  const newRound    = (sessionData.round ?? 1) + 1;
  // Reset heroResults for the new round
  const clearedResults = (sessionData.heroes || []).map(() => null);
  // Append to testLog
  const newLog = [...(m.testLog || []), {
    round: sessionData.round ?? 1,
    results: [...heroResults],
    pointsEarned: roundPts,
  }];
  try {
    await db.collection('sessions').doc(code).update({
      round:                   newRound,
      'montage.totalSuccesses': newTotal,
      'montage.heroResults':    clearedResults,
      'montage.testLog':        newLog,
    });
  } catch (e) {
    console.error('advanceMontageRound:', e);
    showToast('Could not advance round.', 'danger');
  }
}

function showMontageEndModal(outcome, sessionData) {
  const m       = sessionData.montage || {};
  const total   = m.totalSuccesses ?? 0;
  const needed  = m.successesNeeded ?? 4;

  const OUTCOME_CONFIG = {
    success: {
      title:    'Montage Complete!',
      icon:     '◆',
      color:    'var(--color-gold)',
      desc:     `The heroes succeeded! ${total} successes — goal of ${needed} reached.`,
      outcome:  m.successOutcome || '',
      vicCount: 1,
    },
    failure: {
      title:    'Time Ran Out',
      icon:     '⧗',
      color:    'var(--color-danger)',
      desc:     `The heroes fell short. Only ${total} of ${needed} successes were achieved.`,
      outcome:  m.failureOutcome || '',
      vicCount: 0,
    },
  };

  const cfg = OUTCOME_CONFIG[outcome] || OUTCOME_CONFIG.failure;

  showModal(`
    <div class="neg-end-modal">
      <div class="neg-end-icon" style="color:${cfg.color}">${cfg.icon}</div>
      <h2 class="neg-end-title" style="color:${cfg.color}">${cfg.title}</h2>
      <p class="neg-end-desc">${cfg.desc}</p>
      ${cfg.outcome ? `<p class="neg-end-outcome-text">${cfg.outcome}</p>` : ''}

      ${cfg.vicCount > 0 ? `
        <div class="neg-end-victory-row">
          <span class="neg-end-victory-label">Victory Awarded:</span>
          <span class="neg-end-victory-value">1V per hero</span>
        </div>
        <button class="btn btn-primary" id="montage-award-victory-btn"
          style="width:100%;margin-top:12px">
          Award Victory &amp; End
        </button>
        <button class="btn btn-ghost btn-small" id="montage-no-victory-btn"
          style="width:100%;margin-top:6px">
          End Without Victory
        </button>
      ` : `
        <button class="btn btn-primary" id="montage-no-victory-btn"
          style="width:100%;margin-top:12px">
          End Montage
        </button>
      `}
    </div>
  `);

  const campaign = AppState.currentRunnerCampaign;
  const enc      = AppState.currentRunnerEncounter;
  const code     = AppState.currentSession?.code;

  document.getElementById('montage-award-victory-btn')?.addEventListener('click', () => {
    if (typeof performEndEncounter === 'function') {
      performEndEncounter(campaign, enc, code, cfg.vicCount);
    }
  });
  document.getElementById('montage-no-victory-btn')?.addEventListener('click', () => {
    if (typeof performEndEncounter === 'function') {
      performEndEncounter(campaign, enc, code, 0);
    }
  });
}

function buildRunnerHeroCard(hero, idx, isNext) {
  const hpPct   = hero.maxHP > 0 ? Math.max(0, Math.round((hero.currentHP / hero.maxHP) * 100)) : 0;
  const hpColor = hpPct > 60 ? 'var(--stamina-fill)'
                : hpPct > 30 ? 'var(--stamina-winded)' : 'var(--stamina-dying)';
  const accent  = (typeof CLASS_COLORS !== 'undefined' && CLASS_COLORS?.[hero.class]?.accent) || '#2980B9';
  const stateClass = hero.isActivated ? 'runner-hero-active' : hero.hasActed ? 'runner-hero-done' : '';

  return `
    <div class="runner-hero-card ${stateClass}" style="border-left-color:${accent}">
      <div class="runner-hero-header">
        <div class="runner-hero-name-row">
          ${isNext      ? '<span class="runner-next-badge">NEXT</span>' : ''}
          ${hero.isActivated ? '<span class="runner-state-badge runner-badge-active">ACTIVE</span>'
            : hero.hasActed ? '<span class="runner-state-badge runner-badge-done">DONE</span>' : ''}
          <span class="runner-hero-name">${hero.displayName}</span>
          ${hero.class  ? `<span class="runner-hero-class">${hero.class}</span>` : ''}
        </div>
        <button class="runner-hero-edit-btn" data-hero-idx="${idx}" title="Adjust">✎</button>
      </div>
      <div class="runner-hero-hp-row">
        <div class="hp-bar-track runner-hp-track">
          <div class="hp-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div>
        </div>
        <span class="runner-hero-hp-text">${hero.currentHP}/${hero.maxHP}</span>
      </div>
      <div class="runner-hero-resource-row">
        <span class="runner-resource-name">${hero.heroicResource?.name || 'Resource'}</span>
        <span class="runner-resource-value">${hero.heroicResource?.current ?? 0}/${hero.heroicResource?.max ?? 0}</span>
      </div>
      ${hero.conditions?.length ? `<div class="roster-conditions">${hero.conditions.map(c => `<span class="condition-badge">${c}</span>`).join('')}</div>` : ''}
      <div class="runner-buckets">
        <span class="runner-bucket ${hero.hasActed        ? 'rbucket-spent' : 'rbucket-ready'}" title="Action">⚔</span>
        <span class="runner-bucket ${hero.hasManeuvered   ? 'rbucket-spent' : 'rbucket-ready'}" title="Maneuver">◈</span>
        <span class="runner-bucket ${hero.hasUsedTriggered? 'rbucket-spent' : 'rbucket-ready'}" title="Triggered">⟳</span>
      </div>
    </div>
  `;
}

function buildRunnerEnemyCard(enemy, idx, total, isNext) {
  const hpPct   = enemy.maxHP > 0 ? Math.max(0, Math.round((enemy.currentHP / enemy.maxHP) * 100)) : 0;
  const hpColor = hpPct > 60 ? 'var(--stamina-fill)'
                : hpPct > 30 ? 'var(--stamina-winded)' : 'var(--stamina-dying)';
  const vaUsed  = enemy.villainActionsUsed || [];

  return `
    <div class="runner-enemy-card ${enemy.isActivated ? 'runner-enemy-done' : ''}">
      <div class="runner-enemy-header">
        <div class="runner-enemy-name-row">
          ${isNext ? '<span class="runner-next-badge runner-next-enemy">NEXT</span>' : ''}
          <span class="runner-enemy-name">${enemy.name}${enemy.isBoss ? ' 👑' : ''}</span>
        </div>
        <div class="runner-enemy-ctrl">
          <button class="runner-enemy-activate-btn ${enemy.isActivated ? 'is-done' : ''}" data-enemy-id="${enemy.id}">
            ${enemy.isActivated ? '✓ Done' : 'Activate'}
          </button>
          <button class="runner-enemy-hp-btn" data-enemy-id="${enemy.id}" title="Edit HP">✎</button>
          <button class="runner-enemy-remove-btn" data-enemy-id="${enemy.id}" title="Remove">✕</button>
        </div>
      </div>
      <div class="runner-enemy-hp-row">
        <div class="hp-bar-track runner-hp-track">
          <div class="hp-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div>
        </div>
        <span class="runner-enemy-hp-text">${enemy.currentHP}/${enemy.maxHP}</span>
      </div>
      ${enemy.conditions?.length ? `<div class="roster-conditions">${enemy.conditions.map(c => `<span class="condition-badge">${c}</span>`).join('')}</div>` : ''}
      ${enemy.isBoss ? `
        <div class="villain-actions">
          ${[1,2,3].map(n => `
            <button class="va-btn ${vaUsed.includes(n) ? 'used' : ''}" data-enemy-id="${enemy.id}" data-va="${n}">
              VA ${n}${vaUsed.includes(n) ? ' ✓' : ''}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function buildRunnerTurnRow(name, type, isActivated, hasActed, isNext) {
  return `
    <div class="runner-turn-row turn-row-${type} ${isActivated || hasActed ? 'turn-row-done' : ''}">
      <span class="runner-turn-indicator">${isNext ? '▶' : ''}</span>
      <span class="runner-turn-name">${name}</span>
      ${isActivated || hasActed ? '<span class="runner-turn-check">✓</span>' : ''}
    </div>
  `;
}

function wireRunnerButtons(sessionData) {
  const heroes  = sessionData.heroes  || [];
  const enemies = sessionData.enemies || [];

  document.getElementById('runner-next-round-btn')  ?.addEventListener('click', advanceRound);
  document.getElementById('runner-heroes-go-btn')   ?.addEventListener('click', () => setActiveSide('heroes'));
  document.getElementById('runner-villains-go-btn') ?.addEventListener('click', () => setActiveSide('villains'));
  document.getElementById('runner-malice-minus')    ?.addEventListener('click', () => adjustMalice(-1));
  document.getElementById('runner-malice-plus')     ?.addEventListener('click', () => adjustMalice(1));
  document.getElementById('runner-token-minus')     ?.addEventListener('click', () => adjustHeroTokens(-1));
  document.getElementById('runner-token-plus')      ?.addEventListener('click', () => adjustHeroTokens(1));
  document.getElementById('runner-set-malice-btn')  ?.addEventListener('click', startCombat);
  document.getElementById('runner-add-enemy-btn')   ?.addEventListener('click', showAddEnemyModal);
  document.getElementById('runner-add-enemy-turn-btn')?.addEventListener('click', showAddEnemyModal);

  document.getElementById('runner-end-encounter-btn')?.addEventListener('click', () => {
    const campaign = AppState.currentRunnerCampaign;
    const enc      = AppState.currentRunnerEncounter;
    const code     = AppState.currentSession?.code;
    if (typeof showEndEncounterModal === 'function' && campaign && enc) {
      showEndEncounterModal(campaign, enc, code);
    } else {
      endSession();
    }
  });

  // Hero edit buttons
  document.querySelectorAll('#runner-hero-list .runner-hero-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = parseInt(btn.dataset.heroIdx, 10);
      if (!isNaN(idx) && heroes[idx]) showRunnerHeroEditModal(heroes[idx]);
    });
  });

  // Enemy: activate
  document.querySelectorAll('#runner-enemy-list .runner-enemy-activate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const enemy = enemies.find(e => e.id === btn.dataset.enemyId);
      if (enemy) markEnemyActivated(enemy.id, !enemy.isActivated);
    });
  });
  // Enemy: HP edit
  document.querySelectorAll('#runner-enemy-list .runner-enemy-hp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const enemy = enemies.find(e => e.id === btn.dataset.enemyId);
      if (enemy) showEnemyHPModal(enemy);
    });
  });
  // Enemy: remove
  document.querySelectorAll('#runner-enemy-list .runner-enemy-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const enemy = enemies.find(e => e.id === btn.dataset.enemyId);
      if (enemy && confirm(`Remove ${enemy.name}?`)) removeEnemy(enemy.id);
    });
  });
  // Villain actions
  document.querySelectorAll('#runner-enemy-list .va-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleVillainAction(btn.dataset.enemyId, parseInt(btn.dataset.va, 10)));
  });
}

function showRunnerHeroEditModal(hero) {
  showModal(`
    <div class="runner-hero-edit-modal">
      <h2>${hero.displayName}</h2>
      <div class="enc-field-row" style="gap:16px;margin-top:8px">
        <div class="enc-field">
          <label class="enc-label">Stamina</label>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" id="runner-hp-in" class="wizard-text-input"
              value="${hero.currentHP}" min="0" max="${hero.maxHP || 9999}" style="width:80px" />
            <span style="color:var(--text-dim);font-size:13px">/ ${hero.maxHP}</span>
          </div>
        </div>
        <div class="enc-field">
          <label class="enc-label">${hero.heroicResource?.name || 'Resource'}</label>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" id="runner-res-in" class="wizard-text-input"
              value="${hero.heroicResource?.current ?? 0}" min="0" max="${hero.heroicResource?.max ?? 99}" style="width:80px" />
            <span style="color:var(--text-dim);font-size:13px">/ ${hero.heroicResource?.max ?? 10}</span>
          </div>
        </div>
      </div>
      <button class="btn btn-primary" id="runner-hero-save-btn" style="width:100%;margin-top:12px">Save</button>
    </div>
  `);

  document.getElementById('runner-hero-save-btn')?.addEventListener('click', async () => {
    const newHP  = parseInt(document.getElementById('runner-hp-in')?.value, 10);
    const newRes = parseInt(document.getElementById('runner-res-in')?.value, 10);
    if (isNaN(newHP) || isNaN(newRes)) return;

    const session = AppState.currentSession;
    if (!session) return;
    try {
      const snap = await db.collection('sessions').doc(session.code).get();
      if (!snap.exists) return;
      const heroes = [...(snap.data().heroes || [])];
      const idx = heroes.findIndex(h => h.displayName === hero.displayName && h.userId === hero.userId);
      if (idx < 0) return;
      heroes[idx] = { ...heroes[idx], currentHP: newHP, heroicResource: { ...heroes[idx].heroicResource, current: newRes } };
      await db.collection('sessions').doc(session.code).update({ heroes });
      hideModal();
    } catch (e) {
      console.error('Hero edit error:', e);
      showToast('Could not save.', 'danger');
    }
  });
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
