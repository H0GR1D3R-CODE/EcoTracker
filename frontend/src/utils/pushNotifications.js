// EcoTrack/frontend/src/utils/pushNotifications.js
// Turning on push notifications: ask the browser for permission, get an FCM
// registration token tied to this device, and hand it to the backend so
// backend/notifications.py's send_push_to_user() can find it later (used
// today by routes/cron.py's daily streak reminder).
//
// INACTIVE UNTIL VITE_FIREBASE_VAPID_KEY IS SET - the same "wired up, inert
// until configured" shape as RESEND_API_KEY (see backend/config.py's own
// comment on that one): this whole feature degrades to the Profile.jsx
// toggle explaining why it's unavailable, rather than a broken button,
// because getToken() cannot produce anything without a key only generated
// from Firebase Console > Project settings > Cloud Messaging > Web Push
// certificates > Generate key pair.
//
// REUSES THE APP-SHELL SERVICE WORKER, NOT A SECOND ONE
// Firebase's own docs default to a separate firebase-messaging-sw.js file,
// but a page can only ever be controlled by one service worker at a given
// scope - registering a second one at the same root scope as public/sw.js
// would just replace it, silently breaking the offline app shell that file
// already provides (see utils/offlineOutbox.js's sibling feature). Instead,
// sw.js itself has a plain `push` event listener (no Firebase SDK loaded
// inside the worker at all - see that file) and this module hands FCM the
// SAME registration via serviceWorkerRegistration below.

import { getMessaging, getToken } from 'firebase/messaging';

import firebaseApp from '../firebase';
import { notificationsApi } from './api';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const TOKEN_STORAGE_KEY = 'ecotrack-push-token';

export function pushNotificationsConfigured() {
  return Boolean(VAPID_KEY);
}

export function pushNotificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushNotificationsEnabled() {
  return Boolean(localStorage.getItem(TOKEN_STORAGE_KEY));
}

/**
 * Ask for permission, get a token, and register it with the backend.
 * Throws an Error with a message that is safe to show directly - no raw
 * Firebase error text ever reaches the caller.
 */
export async function enablePushNotifications() {
  if (!pushNotificationsConfigured()) {
    throw new Error('Push notifications are not set up on this deployment yet.');
  }
  if (!pushNotificationsSupported()) {
    throw new Error('This browser does not support push notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  // Idempotent - registering the same script at the same scope twice just
  // resolves to the existing registration, so this is safe to call even
  // though main.jsx already registered this file (and, in dev, deliberately
  // did not - see that file's comment - which is exactly the case this
  // makes the toggle work in dev too, not just the production build).
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Could not get a notification token from this browser.');
  }

  await notificationsApi.registerToken(token);
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  return token;
}

/** The reverse of enablePushNotifications - tells the backend to stop sending here. */
export async function disablePushNotifications() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  if (token) {
    // Best-effort: even if this fails (offline, the token was already
    // pruned server-side as dead), the toggle should still turn off
    // locally rather than trap the user in a "still on" state they cannot
    // escape without a network connection.
    await notificationsApi.removeToken(token).catch(() => {});
  }
}
