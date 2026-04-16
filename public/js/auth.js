/**
 * auth.js — Google Sign-In
 *
 * Uses signInWithRedirect on all platforms. signInWithPopup is blocked by
 * COOP headers on modern browsers and fails entirely on mobile Safari.
 * Redirect result is handled in app.js via getRedirectResult().
 */

const googleProvider = new firebase.auth.GoogleAuthProvider();

document.getElementById('google-signin-btn').addEventListener('click', () => {
  auth.signInWithRedirect(googleProvider);
});
