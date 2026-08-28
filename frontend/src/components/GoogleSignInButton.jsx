// EcoTrack/frontend/src/components/GoogleSignInButton.jsx
//
// One button shared by Login and Register - almost the same thing on both,
// but not quite: pass requireExisting on the Login tab so a Google identity
// EcoTrack has never seen is rejected with "sign up first" instead of
// silently creating a new account (see AuthContext.loginWithGoogle for where
// that is actually decided; this component only forwards the flag).
//
// The caller owns navigation - this component only signs in and reports errors.

import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isNativeApp } from '../utils/platform';

/**
 * Google's "G", drawn inline.
 *
 * Inline rather than an <img> from Google's CDN for three reasons: it cannot
 * fail to load, it costs no request, and it does not tell Google that someone
 * opened our login page before they have chosen to use it.
 */
function GoogleMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({ label = 'Continue with Google', onDone, requireExisting = false }) {
  const { loginWithGoogle } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const [busy, setBusy] = useState(false);

  // Google's OAuth popup does not complete inside Capacitor's embedded
  // WebView (see utils/platform.js) - email/password stays as the one
  // working sign-in path there, so this never renders a button that would
  // just fail on tap.
  if (isNativeApp()) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await loginWithGoogle({ requireExisting });
      // Two-step verification pending: no profile to greet by name yet, and
      // the caller's onDone is what sends them to enter the code instead of
      // wherever a normal sign-in would go.
      if (!result?.twoFactorRequired) {
        toast.success(`Welcome, ${result?.name || 'there'}!`);
      }
      onDone?.(result);
    } catch (error) {
      // Closing the popup is a choice, not an error worth shouting about
      if (error.message === 'Sign-in cancelled.') {
        setBusy(false);
        return;
      }
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={busy}
      whileHover={prefersReducedMotion || busy ? {} : { y: -2 }}
      whileTap={prefersReducedMotion || busy ? {} : { scale: 0.985 }}
      style={{
        width: '100%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.65rem',
        padding: '0.8rem 1rem',
        borderRadius: 'var(--eco-radius-sm)',
        // Google's brand guidance wants its mark on a plain light or dark
        // surface, not tinted with ours - so this button stays neutral rather
        // than adopting the green used everywhere else.
        border: '1px solid var(--eco-border)',
        background: 'var(--eco-card-hover)',
        color: 'var(--eco-text)',
        fontWeight: 600,
        fontSize: '0.92rem',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.7 : 1,
        transition: 'opacity 0.18s ease, border-color 0.18s ease',
      }}
    >
      {busy ? (
        <span
          style={{
            width: 17,
            height: 17,
            border: '2px solid rgba(var(--eco-primary-rgb), 0.3)',
            borderTopColor: 'var(--eco-primary)',
            borderRadius: '50%',
            animation: 'eco-spin 0.8s linear infinite',
          }}
        />
      ) : (
        <GoogleMark />
      )}
      {busy ? 'Opening Google…' : label}
    </motion.button>
  );
}
