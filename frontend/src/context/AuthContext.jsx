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
// The listener below (onAuthStateChanged) is what keeps a user logged in across
// refreshes: Firebase restores the session from localStorage, fires the
// listener, and this file then fetches the matching profile from the backend.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
} from 'firebase/auth';

import { auth } from '../firebase';
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // Firebase account
  const [profile, setProfile] = useState(null);  // Firestore profile from Flask
  const [loading, setLoading] = useState(true);  // true until the first auth check finishes

  // Set when the profile request fails for a reason that is not the user's
  // fault - usually the Flask backend being asleep or unreachable. Without
  // this, a failed fetch would leave profile as null and ProtectedRoute would
  // show a loading spinner that never goes away.
  const [profileError, setProfileError] = useState(null);

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
        await refreshProfile();
      } else {
        setProfile(null);
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
  const register = useCallback(async ({ name, email, password, region }) => {
    try {
      // Step 1: Flask creates the Firebase Auth account AND the profile
      await authApi.register({ name, email, password, region });
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Registration failed. Please try again.'));
    }

    try {
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
   * Sign in an existing user.
   */
  const login = useCallback(async ({ email, password }) => {
    let credential;

    try {
      credential = await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw new Error(friendlyAuthError(error));
    }

    try {
      const idToken = await credential.user.getIdToken();
      const data = await authApi.login(idToken);
      setProfile(data);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not load your profile.'));
    }
  }, []);

  /**
   * Sign in with Google, for both new and returning people.
   *
   * There is deliberately no separate "register with Google" path. Google tells
   * us whether the account is new; either way the same two steps follow, and
   * POST /api/auth/login builds the Firestore profile from the token when one
   * does not exist yet - using the display name and email Google supplies.
   *
   * A side benefit worth knowing: Google has already proven the person owns
   * that inbox, so these accounts arrive verified with no email round trip.
   */
  const loginWithGoogle = useCallback(async () => {
    let credential;

    try {
      const provider = new GoogleAuthProvider();
      // Always ask which account to use. Without this, anyone already signed
      // in to one Google account is silently forced into it, which is
      // maddening on a shared machine.
      provider.setCustomParameters({ prompt: 'select_account' });
      credential = await signInWithPopup(auth, provider);
    } catch (error) {
      throw new Error(friendlyAuthError(error));
    }

    try {
      const idToken = await credential.user.getIdToken();
      const data = await authApi.login(idToken);
      setProfile(data);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not load your profile.'));
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
   */
  const resetPassword = useCallback(async (email) => {
    try {
      const result = await authApi.forgotPassword(email);
      if (result?.sent) return; // the branded email genuinely went out (or a safe no-op)
    } catch {
      // Backend unreachable or erroring - fall through to Firebase below
      // rather than surfacing a failure for a path that still works.
    }

    try {
      await sendPasswordResetEmail(auth, email);
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
    } catch (error) {
      throw new Error(friendlyAuthError(error));
    }
  }, []);

  /**
   * Save changes to the user's name or region.
   */
  const updateProfile = useCallback(async ({ name, region }) => {
    try {
      const data = await authApi.updateProfile({ name, region });
      setProfile(data);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Could not update your profile.'));
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
      register,
      login,
      loginWithGoogle,
      logout,
      updateProfile,
      refreshProfile,
      resetPassword,
      changePassword,
    }),
    [
      user,
      profile,
      loading,
      profileError,
      register,
      login,
      loginWithGoogle,
      logout,
      updateProfile,
      refreshProfile,
      resetPassword,
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
