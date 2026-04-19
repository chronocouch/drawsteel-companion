/**
 * app.js — Main entry point and screen router
 *
 * Manages which screen is visible and wires up global navigation.
 * All screens are defined in index.html. Only one is "active" at a time.
 */

// ── Screen IDs ───────────────────────────────────────────────────────────────
const SCREENS = {
  LOADING: 'loading-screen',
  SIGNIN: 'signin-screen',
  CHARACTER_SELECT: 'character-select-screen',
  CHARACTER_SHEET: 'character-sheet-screen',
  WIZARD: 'wizard-screen',
  CAMPAIGN: 'campaign-screen',
  ENCOUNTER_RUNNER: 'encounter-runner-screen',
};

// ── Current app state ────────────────────────────────────────────────────────
const AppState = {
  currentUser: null,
  currentCharacter: null,
  currentSession: null,
  currentScreen: SCREENS.LOADING,
};

// ── Screen navigation ────────────────────────────────────────────────────────

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    AppState.currentScreen = screenId;
  } else {
    console.error(`Screen not found: ${screenId}`);
  }
}

// ── Auth state listener ──────────────────────────────────────────────────────
// signInWithRedirect causes a page reload. Firebase can fire onAuthStateChanged
// with null BEFORE it finishes processing the redirect result — which would
// incorrectly show the sign-in screen. We write a localStorage flag in auth.js
// before the redirect so we know to wait here on the way back.

const pendingRedirect = localStorage.getItem('ds:pendingRedirect') === '1';

// Only call getRedirectResult when we know a redirect was initiated.
// Always resolves (errors are swallowed) so awaiting it is always safe.
const redirectResultPromise = pendingRedirect
  ? auth.getRedirectResult()
      .then(r  => { localStorage.removeItem('ds:pendingRedirect'); return r; })
      .catch(() => { localStorage.removeItem('ds:pendingRedirect'); return null; })
  : Promise.resolve(null);

auth.onAuthStateChanged(async (user) => {
  if (user) {
    // Signed in — clear any stale flag and navigate
    localStorage.removeItem('ds:pendingRedirect');
    AppState.currentUser = user;
    showScreen(SCREENS.CHARACTER_SELECT);
    loadCharacterList(user.uid);
    checkDirectorMode(user.uid);
    db.collection('users').doc(user.uid).set({
      displayName: user.displayName,
      email: user.email,
    }, { merge: true }).catch(e => console.warn('User profile write failed:', e));
  } else {
    if (pendingRedirect) {
      // A redirect was in flight — wait for it to complete before deciding
      await redirectResultPromise;
      // If redirect succeeded, Firebase already fired onAuthStateChanged(user)
      // and handled navigation above. Only show sign-in if still no user.
      if (auth.currentUser) return;
    }
    AppState.currentUser = null;
    AppState.currentCharacter = null;
    showScreen(SCREENS.SIGNIN);
  }
});

// ── Tab switching ────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tabId}`)?.classList.add('active');
  });
});

// ── Modal ────────────────────────────────────────────────────────────────────

function showModal(contentHTML) {
  document.getElementById('modal-content').innerHTML = contentHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', hideModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) hideModal();
});

// ── Global navigation listeners ──────────────────────────────────────────────

document.getElementById('back-to-list-btn').addEventListener('click', () => {
  AppState.currentCharacter = null;
  showScreen(SCREENS.CHARACTER_SELECT);
  loadCharacterList(AppState.currentUser.uid);
});

document.getElementById('campaign-back-btn')?.addEventListener('click', () => {
  showScreen(SCREENS.CHARACTER_SELECT);
});

document.getElementById('runner-back-btn')?.addEventListener('click', () => {
  showScreen(SCREENS.CAMPAIGN);
});

document.getElementById('signout-btn').addEventListener('click', () => {
  auth.signOut();
});

// ── Expose globals ───────────────────────────────────────────────────────────
window.AppState = AppState;
window.SCREENS = SCREENS;
window.showScreen = showScreen;
window.showModal = showModal;
window.hideModal = hideModal;
