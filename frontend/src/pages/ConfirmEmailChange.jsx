// EcoTrack/frontend/src/pages/ConfirmEmailChange.jsx
// Where an email-CHANGE confirmation link lands - see backend/routes/auth.py's
// request_email_change/confirm_email_change and email_service.py's own
// "EMAIL CHANGE CONFIRMATION" section for the whole flow this is the last
// step of. Reached with ?uid=...&token=... from the email sent to the
// account's CURRENT address (never the new one - that is the entire point:
// whoever controls the OLD inbox is who approves this).
//
// No ProtectedRoute, same reasoning as ResetPassword.jsx: the person clicking
// this link may be signed out on this browser entirely (checking email on
// their phone while signed in only on their laptop), and confirming works
// purely off the token in the URL, with no dependency on any current session.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Leaf, LogIn, Loader2, Mail } from 'lucide-react';

import { authApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

export default function ConfirmEmailChange() {
  const { prefersReducedMotion } = useTheme();
  const [searchParams] = useSearchParams();

  // 'checking' | 'invalid' | 'success' - the same real-state-machine shape
  // ResetPassword.jsx's own `stage` uses, for the same reason: these are
  // mutually exclusive and the JSX below renders exactly one at a time.
  const [stage, setStage] = useState('checking');
  const [newEmail, setNewEmail] = useState('');
  const [invalidReason, setInvalidReason] = useState('');

  const uid = searchParams.get('uid');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!uid || !token) {
      setInvalidReason('This link is missing its confirmation code.');
      setStage('invalid');
      return;
    }

    let cancelled = false;
    authApi
      .confirmEmailChange(uid, token)
      .then((data) => {
        if (cancelled) return;
        setNewEmail(data?.newEmail || '');
        setStage('success');
      })
      .catch((error) => {
        if (cancelled) return;
        setInvalidReason(getErrorMessage(error, 'This link is invalid or has expired.'));
        setStage('invalid');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="eco-dot-grid"
      style={{
        minHeight: 'calc(100dvh - 68px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="eco-card"
        style={{ width: '100%', maxWidth: 460, padding: '2.2rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.6rem' }}>
          <Leaf size={16} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
          <span className="eco-marker">EcoTrack</span>
          <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
            EMAIL CHANGE
          </span>
        </div>

        {/* ---------- confirming ---------- */}
        {stage === 'checking' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 0 1rem' }}>
            <Loader2 size={18} style={{ animation: 'eco-spin 0.8s linear infinite', color: 'var(--eco-primary)' }} />
            <span className="eco-text-muted" style={{ fontSize: '0.94rem' }}>Confirming your new email…</span>
          </div>
        )}

        {/* ---------- expired / invalid / already used ---------- */}
        {stage === 'invalid' && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <AlertCircle size={22} style={{ color: 'var(--eco-danger)', display: 'block', marginBottom: '0.9rem' }} />
            <h1 className="eco-display" style={{ fontSize: 'clamp(1.5rem, 4vw, 1.9rem)', margin: '0 0 0.7rem' }}>
              This link isn&rsquo;t valid
            </h1>
            <p className="eco-text-muted" style={{ margin: '0 0 1.8rem', lineHeight: 1.6, fontSize: '0.94rem' }}>
              {invalidReason} Confirmation links only work once, and expire half an
              hour after they are sent - sign in and start the email change again from
              your profile.
            </p>
            <Link
              to="/login"
              className="eco-btn eco-btn-primary"
              style={{ width: '100%', padding: '0.85rem', display: 'flex', justifyContent: 'center' }}
            >
              <LogIn size={16} />
              Sign in
            </Link>
          </motion.div>
        )}

        {/* ---------- success ---------- */}
        {stage === 'success' && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <CheckCircle2 size={22} style={{ color: 'var(--eco-primary)', display: 'block', marginBottom: '0.9rem' }} />
            <h1 className="eco-display" style={{ fontSize: 'clamp(1.5rem, 4vw, 1.9rem)', margin: '0 0 0.7rem' }}>
              Email address changed
            </h1>
            <p className="eco-text-muted" style={{ margin: '0 0 1.8rem', lineHeight: 1.6, fontSize: '0.94rem' }}>
              {newEmail ? (
                <>
                  Your account now signs in with{' '}
                  <strong style={{ color: 'var(--eco-text)' }}>{newEmail}</strong>. Use it
                  the next time you sign in.
                </>
              ) : (
                'Your account now signs in with the new address. Use it the next time you sign in.'
              )}
            </p>
            <Link
              to="/login"
              className="eco-btn eco-btn-primary"
              style={{ width: '100%', padding: '0.85rem', display: 'flex', justifyContent: 'center' }}
            >
              <Mail size={16} />
              Continue to sign in
            </Link>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
