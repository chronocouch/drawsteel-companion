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
// On mobile, signInWithRedirect causes a page reload. Firebase fires
// onAuthStateChanged with null before it has processed the redirect result,
// which would incorrectly show the sign-in screen. We resolve the redirect
// result first and wait for it before deciding to show sign-in.

const redirectResultPromise = auth.getRedirectResult().catch(err => {
  if (err.code !== 'auth/no-auth-event') {
    console.error('Redirect sign-in error:', err);
  }
  return null;
});

auth.onAuthStateChanged(async (user) => {
  if (user) {
    AppState.currentUser = user;
    showScreen(SCREENS.CHARACTER_SELECT);
    loadCharacterList(user.uid);
    db.collection('users').doc(user.uid).set({
      displayName: user.displayName,
      email: user.email,
    }, { merge: true }).catch(e => console.warn('User profile write failed:', e));
  } else {
    // Wait for any pending redirect before giving up and showing sign-in
    await redirectResultPromise;
    if (!auth.currentUser) {
      AppState.currentUser = null;
      AppState.currentCharacter = null;
      showScreen(SCREENS.SIGNIN);
    }
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

document.getElementById('signout-btn').addEventListener('click', () => {
  auth.signOut();
});

// ── Expose globals ───────────────────────────────────────────────────────────
window.AppState = AppState;
window.SCREENS = SCREENS;
window.showScreen = showScreen;
window.showModal = showModal;
window.hideModal = hideModal;
