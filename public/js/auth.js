/**
 * auth.js — Google Sign-In
 *
 * Uses signInWithRedirect on mobile (popup is blocked by most mobile browsers)
 * and signInWithPopup on desktop. Auth state changes are handled in app.js.
 */

const googleProvider = new firebase.auth.GoogleAuthProvider();

function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}


document.getElementById('google-signin-btn').addEventListener('click', async () => {
  const btn = document.getElementById('google-signin-btn');

  if (isMobile()) {
    // Redirect flow — page will reload after Google auth
    try {
      await auth.signInWithRedirect(googleProvider);
    } catch (error) {
      console.error('Redirect sign-in error:', error);
      btn.textContent = 'Sign-in failed — try again';
    }
  } else {
    // Popup flow for desktop
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (error) {
      console.error('Sign-in error:', error);
      btn.textContent = 'Sign-in failed — try again';
      setTimeout(() => {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg> Sign in with Google`;
      }, 3000);
    }
  }
});
