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
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
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
      logout,
      updateProfile,
      refreshProfile,
    }),
    [user, profile, loading, profileError, register, login, logout, updateProfile, refreshProfile]
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
