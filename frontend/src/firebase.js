// EcoTrack/frontend/src/firebase.js
// Connects the React app to Firebase Authentication.
//
// This file does NOT talk to Firestore. All database access goes through the
// Flask backend, which verifies your identity token before touching any data.
// Firebase's only job on the frontend is proving who the user is.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Every value comes from the .env file. import.meta.env is how Vite exposes
// environment variables to browser code - only names starting with VITE_ work.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Catch the most common setup mistake early. Without this check, a missing key
// produces a confusing "auth/invalid-api-key" error deep inside Firebase that
// gives no hint about which file to fix.
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value || String(value).startsWith('paste-') || String(value).startsWith('your-'))
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(
    `[EcoTrack] Firebase is not configured. Missing or placeholder values for: ${missingKeys.join(', ')}.\n` +
      'Fix: open frontend/.env and paste the real values from\n' +
      'Firebase Console > Project settings > General > Your apps > Web app > Config.\n' +
      'Restart "npm run dev" afterwards - Vite only reads .env at startup.'
  );
}

// Start Firebase. This runs once when the app first loads.
const firebaseApp = initializeApp(firebaseConfig);

// The auth object is what every login, logout and token call uses.
// By default Firebase remembers the session in localStorage, so a user stays
// signed in after closing the tab.
export const auth = getAuth(firebaseApp);

export default firebaseApp;
