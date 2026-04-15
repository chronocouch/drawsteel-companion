/**
 * session.js — Combat session mode
 *
 * Handles:
 *  - Creating a session (Director)
 *  - Joining a session (Player)
 *  - Live Firestore onSnapshot sync
 *  - Director battle board
 *  - End Turn flow
 */

let sessionUnsubscribe = null; // Firestore listener cleanup

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
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      heroes: [heroEntry],
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

  // Auto-focus and uppercase
  setTimeout(() => {
    const input = document.getElementById('session-code-input');
    if (input) input.focus();
  }, 100);

  document.getElementById('join-confirm-btn').addEventListener('click', async () => {
    const code = document.getElementById('session-code-input').value.trim();
    if (code.length !== 6) {
      showJoinError('Please enter a 6-digit code.');
      return;
    }
    await attemptJoinSession(code);
  });
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

    // Add or update hero entry in session
    const heroEntry = buildHeroEntry(user, char);
    const heroes = sessionData.heroes || [];
    const existingIdx = heroes.findIndex(h => h.userId === user.uid);

    if (existingIdx >= 0) {
      heroes[existingIdx] = { ...heroes[existingIdx], ...heroEntry };
    } else {
      heroes.push(heroEntry);
    }

    await sessionRef.update({ heroes });

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
    conditions: char.conditions ?? [],
    hasActed: false,
    hasManeuvered: false,
    hasUsedTriggered: false,
    hasUsedFreeTriggered: false,
    hasUsedFreeStrike: false,
    usedOncePerEncounterAbilities: [],
  };
}

// ── Live Firestore listener ──────────────────────────────────────────────────

function joinSessionListeners(code) {
  // Clean up any existing listener
  if (sessionUnsubscribe) sessionUnsubscribe();

  sessionUnsubscribe = db.collection('sessions').doc(code)
    .onSnapshot((snap) => {
      if (!snap.exists) {
        // Session was deleted — Director ended session
        leaveSession();
        return;
      }

      const data = snap.data();

      if (!data.active) {
        leaveSession();
        return;
      }

      // Update round counter
      updateRoundDisplay(data.round);

      // Update this player's card state from session
      const myHero = data.heroes?.find(h => h.userId === AppState.currentUser?.uid);
      if (myHero) {
        restoreCardStateFromSession(myHero);
        // Sync local HP and resource display
        document.getElementById('hp-current').textContent = myHero.currentHP;
        document.getElementById('resource-current').textContent = myHero.heroicResource?.current ?? 0;
      }

      // If Director, update battle board
      if (AppState.currentSession?.isDirector) {
        updateDirectorBattleBoard(data);
      }
    }, (error) => {
      console.error('Session listener error:', error);
    });
}

// ── Update hero in session (called after any state change) ───────────────────

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

// ── End Turn ─────────────────────────────────────────────────────────────────

document.getElementById('end-turn-btn').addEventListener('click', async () => {
  // Reset local card state
  resetTurnState();

  // Sync reset to session
  if (AppState.currentSession) {
    await updateHeroInSession({
      hasActed: false,
      hasManeuvered: false,
      hasUsedTriggered: false,
      hasUsedFreeTriggered: false,
      hasUsedFreeStrike: false,
      usedOncePerTurnAbilities: [],
    });
  }

  // Visual feedback
  const btn = document.getElementById('end-turn-btn');
  btn.textContent = 'Turn ended ✓';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'End My Turn';
    btn.disabled = false;
  }, 2000);
});

// ── Director: Next Round ──────────────────────────────────────────────────────

async function advanceRound() {
  const session = AppState.currentSession;
  if (!session?.isDirector) return;

  const sessionRef = db.collection('sessions').doc(session.code);
  const snap = await sessionRef.get();
  if (!snap.exists) return;

  const data = snap.data();
  const newRound = (data.round ?? 1) + 1;

  // Reset all heroes' per-turn state
  const heroes = (data.heroes || []).map(h => ({
    ...h,
    hasActed: false,
    hasManeuvered: false,
    hasUsedTriggered: false,
    hasUsedFreeTriggered: false,
    hasUsedFreeStrike: false,
    usedOncePerTurnAbilities: [],
  }));

  await sessionRef.update({ round: newRound, heroes });
}

// ── Director battle board ─────────────────────────────────────────────────────

function updateDirectorBattleBoard(sessionData) {
  let board = document.getElementById('director-battle-board');
  if (!board) {
    board = document.createElement('div');
    board.id = 'director-battle-board';
    board.className = 'director-board';
    // Insert after action economy bar
    const economy = document.getElementById('action-economy');
    economy?.after(board);
  }

  board.innerHTML = `
    <div class="director-board-header">
      <span class="round-label">Round ${sessionData.round}</span>
      <button class="btn btn-sm btn-ghost" id="next-round-btn">Next Round →</button>
      <button class="btn btn-sm btn-danger" id="end-session-btn">End Session</button>
    </div>
    <div class="hero-roster">
      ${(sessionData.heroes || []).map(hero => buildHeroRosterCard(hero)).join('')}
    </div>
  `;

  document.getElementById('next-round-btn')?.addEventListener('click', advanceRound);
  document.getElementById('end-session-btn')?.addEventListener('click', endSession);
}

function buildHeroRosterCard(hero) {
  const hpPercent = hero.maxHP > 0 ? Math.round((hero.currentHP / hero.maxHP) * 100) : 0;
  const hpColor = hpPercent > 60 ? '#2ecc71' : hpPercent > 30 ? '#f39c12' : '#e74c3c';
  const acted = hero.hasActed;

  return `
    <div class="hero-roster-card ${acted ? 'has-acted' : ''}">
      <div class="roster-name">${hero.displayName}</div>
      <div class="roster-hp">
        <div class="hp-bar-track">
          <div class="hp-bar-fill" style="width:${hpPercent}%;background:${hpColor}"></div>
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

// ── Combat overlay activation ─────────────────────────────────────────────────

function activateCombatOverlay(isDirector) {
  // Show session indicator
  document.getElementById('session-indicator')?.classList.remove('hidden');

  // Show action economy tracker
  document.getElementById('action-economy')?.classList.remove('hidden');

  // Show End Turn button
  document.getElementById('session-controls')?.classList.remove('hidden');

  // Hide join session fabs
  document.getElementById('join-session-fab')?.classList.add('hidden');

  // Update action economy UI
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

  // Hide combat overlay elements
  document.getElementById('session-indicator')?.classList.add('hidden');
  document.getElementById('action-economy')?.classList.add('hidden');
  document.getElementById('session-controls')?.classList.add('hidden');
  document.getElementById('director-battle-board')?.remove();

  // Show join fabs again
  document.getElementById('join-session-fab')?.classList.remove('hidden');

  // Reset turn state
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

// ── Wire up join/start buttons ────────────────────────────────────────────────

document.getElementById('join-session-btn')?.addEventListener('click', promptJoinSession);
document.getElementById('start-session-btn')?.addEventListener('click', createSession);

// ── Expose globals ────────────────────────────────────────────────────────────
window.createSession = createSession;
window.promptJoinSession = promptJoinSession;
window.updateHeroInSession = updateHeroInSession;
window.leaveSession = leaveSession;
