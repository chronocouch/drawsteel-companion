/**
 * auth.js — Google Sign-In
 *
 * Sets a localStorage flag before redirecting so app.js knows to wait
 * for getRedirectResult() rather than immediately showing sign-in.
 */

const googleProvider = new firebase.auth.GoogleAuthProvider();

document.getElementById('google-signin-btn').addEventListener('click', () => {
  localStorage.setItem('ds:pendingRedirect', '1');
  auth.signInWithRedirect(googleProvider);
});
