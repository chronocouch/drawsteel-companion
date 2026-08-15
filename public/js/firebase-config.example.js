// Firebase configuration — TEMPLATE.
//
// The real public/js/firebase-config.js is gitignored (it holds your project's
// keys). To run the app from a fresh clone: copy this file to
// firebase-config.js in the same folder and fill in the values from the
// Firebase console → Project settings → General → "Your apps" → SDK setup.
//
// These are Firebase *client* keys — they are safe to ship to the browser
// (security is enforced by firestore.rules / storage.rules, not by hiding
// them). The file is gitignored mainly to keep the repo project-agnostic.

const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT',
  storageBucket:     'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
  measurementId:     'YOUR_MEASUREMENT_ID',
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Expose db and auth globally for other scripts
const db = firebase.firestore();
const auth = firebase.auth();
