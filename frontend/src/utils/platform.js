// EcoTrack/frontend/src/utils/platform.js
//
// Whether the app is currently running inside the Capacitor-wrapped native
// shell (Android/iOS), as opposed to a normal browser tab or an installed PWA.
//
// WHY THIS MATTERS
// Google's OAuth endpoint refuses to complete inside an embedded WebView - it
// returns "disallowed_useragent" rather than letting signInWithPopup() work,
// which is exactly the environment Capacitor's native shell renders in.
// Fixing that properly means registering platform-specific OAuth client ids
// in Google Cloud Console and swapping to a native sign-in plugin - a real
// console-side project of its own. Until that happens, the honest short-term
// fix is to hide the Google button on native builds rather than show a button
// that always fails; email/password sign-in works identically everywhere,
// since it is a plain HTTPS call with no embedded-browser restriction.
import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}
