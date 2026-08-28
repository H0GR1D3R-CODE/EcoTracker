// EcoTrack/frontend/src/context/AuthContext.jsx
// The single source of truth for "who is signed in".
//
// TWO HALVES OF ONE IDENTITY
//   user     - the Firebase Auth account (uid, email). Firebase owns this.
//   profile  - the Firestore document (name, region, isAdmin). Flask owns this.
//
// Both are needed. Firebase proves the user is who they say they are; the
// profile holds everything the app actually displays.
//
// The listener below (onAuthStateChanged) is what keeps a user logged in
// across refreshes: Firebase restores the session (from sessionStorage in
// the browser, or its own persistent store on native - see firebase.js's
// authReady for which), fires the listener, and this file then fetches the
// matching profile from the backend.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
} from 'firebase/auth';

import { auth, authReady } from '../firebase';
import { authApi, getErrorCode, getErrorMessage } from '../utils/api';

const AuthContext = createContext(null);

/**
 * Turn a Firebase error code into a sentence a person can act on.
 * Firebase's own messages look like "Firebase: Error (auth/wrong-password)."
 */
function friendlyAuthError(error) {
  const code = error?.code || '';

  const messages = {
    'auth/invalid-email': 'That email address is not valid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with that email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters long.',
    'auth/too-many-requests': 'Too many failed attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    // Closing the Google popup is a decision, not a failure - say nothing
    // alarming about it.
    'auth/popup-closed-by-user': 'Sign-in cancelled.',
    'auth/cancelled-popup-request': 'Sign-in cancelled.',
    'auth/popup-blocked':
      'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    'auth/account-exists-with-different-credential':
      'You already have an account with this email. Sign in with your password instead.',
    'auth/operation-not-allowed':
      'Google sign-in is not enabled for this project yet.',
    'auth/unauthorized-domain':
      'This domain is not authorised for sign-in in the Firebase console.',
    'auth/missing-email': 'Enter your email address.',
    'auth/requires-recent-login':
      'For your security, please sign out and back in before changing your password.',
  };

  return messages[code] || error?.message || 'Authentication failed. Please try again.';
}

// Survives a page refresh mid-2FA-check: Firebase's own session is already
// valid by that point (see the TWO-STEP VERIFICATION note below on why), so
// without this a refresh on the "enter your code" screen would silently drop
// the person straight past it. Keyed by uid so switching accounts on the same
// browser can never carry a stale pending-2FA flag over to someone else.
const TWO_FACTOR_PENDING_KEY = 'eco_2fa_pending_uid';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // Firebase account
  const [profile, setProfile] = useState(null);  // Firestore profile from Flask
  const [loading, setLoading] = useState(true);  // true until the first auth check finishes

  // Set when the profile request fails for a reason that is not the user's
  // fault - usually the Flask backend being asleep or unreachable. Without
  // this, a failed fetch would leave profile as null and ProtectedRoute would
  // show a loading spinner that never goes away.
  const [profileError, setProfileError] = useState(null);

  // ---- two-step verification ----
  // Firebase has already fully signed this person in by the time this
  // becomes true - onAuthStateChanged fires the moment signInWithEmailAndPassword
  // resolves, well before this app decides whether to hand over their
  // profile. twoFactorPending is this app's OWN gate on top of that: while
  // true, ProtectedRoute sends every protected page to /verify-2fa instead
  // of rendering it, exactly like it already does for "no profile yet". This
  // is convenience, not a security boundary of its own - see the matching
  // comment on backend/routes/auth.py's verify_two_factor() for what it
  // actually adds and what it does not.
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorEmail, setTwoFactorEmail] = useState('');

  /**
   * Fetch the Firestore profile for whoever is currently signed in.
   * Exposed so pages can refresh it after the user edits their details.
   */
  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return null;
    }

    try {
      const data = await authApi.getProfile();
      setProfile(data);
      setProfileError(null); // clear any previous failure
      return data;
    } catch (error) {
      // A 404 here means the Auth account exists but the profile document does
      // not. The backend's login route repairs that, so it is not fatal.
      if (getErrorCode(error) === 'profile_not_found') {
        setProfile(null);
        setProfileError(null);
        return null;
      }

      // Anything else (backend asleep, no network) - keep the user signed in
      // and record the failure so the UI can offer a retry instead of hanging
      const message = getErrorMessage(error, 'Could not reach the server.');
      console.error('[EcoTrack] Could not load profile:', message);
      setProfileError(message);
      return null;
    }
  }, []);

  // Runs once when the app starts. Firebase calls this listener immediately
  // with the restored session (or null), and again on every login and logout.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // A pending-2FA flag left over from before this refresh, for THIS
        // exact account - restore the gate instead of fetching the profile,
        // which would otherwise hand over full access without the code ever
        // being checked.
        if (sessionStorage.getItem(TWO_FACTOR_PENDING_KEY) === firebaseUser.uid) {
          setTwoFactorPending(true);
          setTwoFactorEmail(firebaseUser.email || '');
        } else {
          await refreshProfile();
        }
      } else {
        setProfile(null);
        setTwoFactorPending(false);
        sessionStorage.removeItem(TWO_FACTOR_PENDING_KEY);
      }

      // Only now is it safe for ProtectedRoute to decide anything. Before this
      // point "no user" just means "we have not checked yet".
      setLoading(false);
    });

    // Stop listening if the provider is ever unmounted
    return () => unsubscribe();
  }, [refreshProfile]);

  /**
   * Create a new account.
   *
   * The backend does the account creation (it needs to write the Firestore
   * profile in the same operation), then we sign in on the client to get a
   * token for all future requests.
   */
  const register = useCallback(async ({ name, email, password, region, recaptchaToken }) => {
    try {
      // Step 1: Flask creates the Firebase Auth account AND the profile
      await authApi.register({ name, email, password, region, recaptchaToken });
    } catch (error) {
      // .code carried across the wrap, not just the message text - so a
      // caller (Register.jsx) can branch on the exact backend reason
      // ("email_exists") rather than pattern-matching English wording,
      // which breaks the moment that wording changes.
      const wrapped = new Error(getErrorMessage(error, 'Registration failed. Please try again.'));
      wrapped.code = getErrorCode(error);
      throw wrapped;
    }

    try {
      // Wait for firebase.js to finish choosing session-only vs. persistent
      // storage before this sign-in writes anywhere - otherwise a sign-in
      // fast enough to race that setup silently lands under Firebase's
      // default persistent mode instead of the one actually intended.
      await authReady;
      // Step 2: sign in so the browser holds a valid ID token
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      // Step 3: swap the token for the profile
      const data = await authApi.login(idToken);
      setProfile(data);
      return data;
    } catch (error) {
      // The account was created but sign-in failed - send them to the login
      // page rather than leaving them stuck on a half-finished registration
      throw new Error(
        'Your account was created, but signing in failed. Please go to the login page.'
      );
    }
  }, []);

  /**
   * Handle POST /api/auth/login's response, whichever shape it comes back in.
   *
   * Shared by login() and loginWithGoogle(): both reach this exact same fork
   * once Firebase itself has already succeeded, so the two-step-verification
   * branch only needs writing once. See the twoFactorPending state comment
   * above for what the flag actually means.
   */
  const handleLoginResponse = useCallback((data, fallbackEmail) => {
    if (data?.twoFactorRequired) {
      const email = data.email || fallbackEmail || '';
      setTwoFactorEmail(email);
      setTwoFactorPending(true);
      if (auth.currentUser) {
        sessionStorage.setItem(TWO_FACTOR_PENDING_KEY, auth.currentUser.uid);
      }
      return { twoFactorRequired: true, email };
    }

    setProfile(data);
    return { twoFactorRequired: false };
  }, []);

  /**
   * Sign in an existing user.
   *
   * Returns {twoFactorRequired: true} instead of the profile when the
   * account has two-step verification on - Login.jsx checks this to decide
   * whether to head to /dashboard or /verify-2fa next.
   */
  const login = useCallback(async ({ email, password }) => {
    let credential;

    try {
      // See register()'s own comment on authReady - same race, same fix.
      await authReady;
      credential = await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      // .code carried across the wrap (same reasoning as register()'s own
      // comment on this) - specifically so Login.jsx can tell "no account
      // with this email at all" (auth/user-not-found) apart from "wrong
      // password for a real account" (auth/wrong-password/invalid-credential)
      // and show the former its own "you need to sign up first" panel
      // instead of a plain toast.
      const wrapped = new Error(friendlyAuthError(error));
      wrapped.code = error?.code;
      throw wrapped;
    }

    try {
      const idToken = await credential.user.getIdToken();
      const data = await authApi.login(idToken);
      return handleLoginResponse(data, email);
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not load your profile.'));
    }
  }, [handleLoginResponse]);

  /**
   * Sign in with Google.
   *
   * On the Register tab (requireExisting: false, the default) there is
   * deliberately no separate "register with Google" path - Google tells us
   * whether the account is new; either way the same two steps follow, and
   * POST /api/auth/login builds the Firestore profile from the token when
   * one does not exist yet, using the display name and email Google
   * supplies. No password is ever needed here, on either tab - Google has
   * already proven the person owns that inbox.
   *
   * On the Login tab (requireExisting: true) this is deliberately NOT
   * symmetric with Register: signing in with a Google identity EcoTrack has
   * never seen before must not silently create a brand-new account just
   * because someone clicked Google on the wrong tab - that would leave them
   * looking "logged in" to an empty account with no idea a second one now
   * exists. See the isNewUser branch below for how that is caught and
   * undone before it ever reaches the backend.
   */
  const loginWithGoogle = useCallback(async ({ requireExisting = false } = {}) => {
    let credential;

    try {
      // Same authReady race as register()/login() - a Google sign-in this
      // fast is unlikely (the popup itself takes a moment), but there is no
      // reason to leave the window open just because it is narrower here.
      await authReady;
      const provider = new GoogleAuthProvider();
      // Always ask which account to use. Without this, anyone already signed
      // in to one Google account is silently forced into it, which is
      // maddening on a shared machine.
      provider.setCustomParameters({ prompt: 'select_account' });
      credential = await signInWithPopup(auth, provider);
    } catch (error) {
      throw new Error(friendlyAuthError(error));
    }

    // signInWithPopup above ALWAYS creates the Firebase Auth account on the
    // spot for a Google identity it has never seen, whether or not anyone
    // asked for that - there is no "check first" step in the SDK. isNewUser
    // is what tells apart "this exact call just created it" from "this
    // Google identity already had an EcoTrack account".
    if (requireExisting && getAdditionalUserInfo(credential)?.isNewUser) {
      try {
        // Undo the account Firebase just created, rather than leaving an
        // orphaned Auth user with no EcoTrack profile behind it forever -
        // the sign-in is as fresh as a sign-in can be, so this never needs
        // the reauthentication a delete normally requires. If they come
        // back and use Google from the Sign Up tab instead, this identity
        // is genuinely new again, with no half-created leftover in the way.
        await deleteUser(credential.user);
      } catch {
        // Could not delete (rare) - at minimum, do not leave them looking
        // signed in to an account that was never actually let through.
        await signOut(auth).catch(() => {});
      }
      const notFound = new Error(
        'No EcoTrack account found for that Google account. Please use Sign Up instead.'
      );
      notFound.code = 'google_account_not_registered';
      throw notFound;
    }

    try {
      const idToken = await credential.user.getIdToken();
      const data = await authApi.login(idToken);
      return handleLoginResponse(data, credential.user.email);
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not load your profile.'));
    }
  }, [handleLoginResponse]);

  /**
   * Submit the 6-digit code from the two-step-verification email.
   *
   * On success, this is the moment the profile withheld by login()/
   * loginWithGoogle() finally arrives - clearing twoFactorPending is what lets
   * ProtectedRoute through to the real app.
   */
  const verifyTwoFactorCode = useCallback(async (code) => {
    try {
      const data = await authApi.verifyTwoFactorCode(code);
      setProfile(data);
      setTwoFactorPending(false);
      setTwoFactorEmail('');
      sessionStorage.removeItem(TWO_FACTOR_PENDING_KEY);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not verify that code.'));
    }
  }, []);

  /** Ask for a fresh code - the last one issued (at login, or by a previous call to this) stops working. */
  const resendTwoFactorCode = useCallback(async () => {
    try {
      const result = await authApi.resendTwoFactorCode();
      return Boolean(result?.sent);
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not send a new code.'));
    }
  }, []);

  /**
   * Give up on the code and back out entirely.
   *
   * There is no partial state to unwind to: Firebase already holds a fully
   * valid session (see twoFactorPending's own comment), so the only honest
   * way to actually stop being signed in is a real sign-out, not just
   * clearing the pending flag - that would just silently drop the person into
   * the app with the check skipped.
   */
  const cancelTwoFactor = useCallback(async () => {
    sessionStorage.removeItem(TWO_FACTOR_PENDING_KEY);
    setTwoFactorPending(false);
    setTwoFactorEmail('');
    await signOut(auth);
  }, []);

  /**
   * Turn two-step verification on or off from Profile.
   */
  const setTwoFactorEnabled = useCallback(async (enabled) => {
    try {
      const data = await authApi.setTwoFactor(enabled);
      setProfile(data);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not update two-step verification.'));
    }
  }, []);

  /**
   * Send a password-reset email for an account that is locked out entirely -
   * the "forgot password" path, reachable from the login page without being
   * signed in at all.
   *
   * TWO EMAILS, ONE FUNCTION
   * Tries EcoTrack's own branded email first (POST /api/auth/forgot-password,
   * which generates the reset link via the Admin SDK and sends it through
   * Resend - see backend/email_service.py). If the server reports that path
   * as unavailable (no RESEND_API_KEY configured yet, or Resend itself could
   * not deliver) - or if the backend cannot be reached AT ALL - this falls
   * back to Firebase's own built-in sendPasswordResetEmail, exactly as this
   * function worked before the branded email existed. Either path ends with
   * the user getting a real, working reset link; only which envelope it
   * arrives in differs; there is no case where a genuine account is left with
   * no way to reset at all just because Resend is not configured yet.
   *
   * DELIBERATELY does not distinguish "no account with that email" from
   * "email sent" in what it shows the user: telling a stranger which email
   * addresses have EcoTrack accounts is an account-enumeration leak. The
   * backend already treats a not-found address as {sent: true} for the same
   * reason; auth/user-not-found from the Firebase fallback gets the same
   * treatment here.
   *
   * THIS FALLBACK EMAIL STILL LANDS ON FIREBASE'S OWN HOSTED PAGE
   * Unlike the branded email (backend/routes/auth.py's forgot_password,
   * which builds its own link straight to pages/ResetPassword.jsx - see that
   * route's own comment for why), this path calls Firebase's native
   * sendPasswordResetEmail(), which composes and sends the ENTIRE email
   * itself - there is no hook to rewrite the link inside it the way the
   * backend can for its own email. actionCodeSettings.url below still adds
   * a "continue" link back to /reset-password after Firebase's hosted page
   * finishes the reset (confirmed live: handleCodeInApp does not skip that
   * hosted page for a web app - it is a mobile deep-linking flag), so this
   * is a smaller improvement, not the same fix. In practice this path is
   * rarely hit at all: RESEND_API_KEY is configured, so the branded email
   * above - the one that DOES land directly on this app - is what real
   * users actually get.
   */
  const resetPassword = useCallback(async (email) => {
    const actionCodeSettings = { url: `${window.location.origin}/reset-password`, handleCodeInApp: true };

    try {
      const result = await authApi.forgotPassword(email);
      if (result?.sent) return; // the branded email genuinely went out (or a safe no-op)
    } catch {
      // Backend unreachable or erroring - fall through to Firebase below
      // rather than surfacing a failure for a path that still works.
    }

    try {
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
    } catch (error) {
      if (error?.code === 'auth/user-not-found') return;
      throw new Error(friendlyAuthError(error));
    }
  }, []);

  /**
   * Change the password for the currently signed-in account.
   *
   * Firebase requires a RECENT sign-in for this - if the session is more than
   * a few minutes old it throws auth/requires-recent-login instead of making
   * the change. Re-authenticating with the current password here means the
   * user never has to sign out and back in first; it also doubles as
   * confirming they actually know the current password before setting a new
   * one, which is worth having anyway.
   *
   * Only meaningful for an email/password account - a Google-only account has
   * no password on this side to change, which is why the Profile page only
   * shows this form when auth.currentUser.providerData includes 'password'.
   */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      throw new Error('You need to be signed in to change your password.');
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
    } catch (error) {
      // Re-authentication failing almost always means the current password
      // was typed wrong - say so plainly rather than the generic message.
      if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
        throw new Error('Your current password is incorrect.');
      }
      throw new Error(friendlyAuthError(error));
    }

    try {
      await updatePassword(currentUser, newPassword);
    } catch (error) {
      throw new Error(friendlyAuthError(error));
    }
  }, []);

  /**
   * Sign out. onAuthStateChanged fires straight after and clears the state.
   */
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setTwoFactorPending(false);
      setTwoFactorEmail('');
      sessionStorage.removeItem(TWO_FACTOR_PENDING_KEY);
    } catch (error) {
      throw new Error(friendlyAuthError(error));
    }
  }, []);

  /**
   * Save changes to the user's name, region, any of the privacy preferences
   * (leaderboard opt-in/alias, public journey page opt-in), their avatar
   * (a preset, or null/null to clear it back to plain initials - a custom
   * uploaded photo is set only by uploadAvatar below, never through here,
   * matching backend/routes/auth.py's own update_profile/upload_avatar
   * split), or their email digest cadence. Only the fields actually passed
   * are sent - see that route, which only touches whatever keys are
   * present in the request body. EVERY field this function can save has to
   * be listed in BOTH the destructured params below AND its own `body.x =`
   * line - a field present in one but not the other is silently dropped
   * (confirmed live: this is exactly what happened to digestFrequency when
   * it was added to the backend and the JSX but missed here - the request
   * went out with an empty body, and the backend correctly 400'd it as
   * "nothing to update").
   */
  const updateProfile = useCallback(
    async ({
      name,
      region,
      leaderboardOptIn,
      leaderboardAlias,
      publicProfileOptIn,
      avatarType,
      avatarValue,
      digestFrequency,
    }) => {
      try {
        const body = {};
        if (name !== undefined) body.name = name;
        if (region !== undefined) body.region = region;
        if (leaderboardOptIn !== undefined) body.leaderboardOptIn = leaderboardOptIn;
        if (leaderboardAlias !== undefined) body.leaderboardAlias = leaderboardAlias;
        if (publicProfileOptIn !== undefined) body.publicProfileOptIn = publicProfileOptIn;
        if (avatarType !== undefined) body.avatarType = avatarType;
        if (avatarValue !== undefined) body.avatarValue = avatarValue;
        if (digestFrequency !== undefined) body.digestFrequency = digestFrequency;

        const data = await authApi.updateProfile(body);
        setProfile(data);
        return data;
      } catch (error) {
        throw new Error(getErrorMessage(error, 'Could not update your profile.'));
      }
    },
    []
  );

  /**
   * Upload a custom avatar photo - the one profile mutation that is not a
   * plain field update, so it gets its own function rather than overloading
   * updateProfile with a base64 payload. See backend/routes/auth.py's
   * upload_avatar for the whole round trip (Storage upload + Firestore
   * write, done together server-side); this just forwards the already
   * downscaled-and-cropped image AvatarPicker.jsx built and syncs the
   * profile this app already holds in memory with what came back.
   */
  const uploadAvatar = useCallback(async (imageBase64, mimeType) => {
    try {
      const data = await authApi.uploadAvatar({ imageBase64, mimeType });
      setProfile(data);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not upload that photo.'));
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      profileError,
      // Truthy only once Firebase has confirmed a session
      isAuthenticated: Boolean(user),
      // The backend decides who is an admin - the frontend only reflects it.
      // Hiding the admin link is convenience, not security: every admin route
      // re-checks the admins collection server-side on every request.
      isAdmin: Boolean(profile?.isAdmin),
      twoFactorPending,
      twoFactorEmail,
      register,
      login,
      loginWithGoogle,
      logout,
      updateProfile,
      uploadAvatar,
      refreshProfile,
      resetPassword,
      changePassword,
      verifyTwoFactorCode,
      resendTwoFactorCode,
      cancelTwoFactor,
      setTwoFactorEnabled,
    }),
    [
      user,
      profile,
      loading,
      profileError,
      twoFactorPending,
      twoFactorEmail,
      register,
      login,
      loginWithGoogle,
      logout,
      updateProfile,
      uploadAvatar,
      refreshProfile,
      resetPassword,
      verifyTwoFactorCode,
      resendTwoFactorCode,
      cancelTwoFactor,
      setTwoFactorEnabled,
      changePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Use auth anywhere:  const { user, profile, logout } = useAuth();
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }

  return context;
}

export default AuthContext;
