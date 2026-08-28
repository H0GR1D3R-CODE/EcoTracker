// EcoTrack/frontend/src/pages/ResetPassword.jsx
// Where a password-reset EMAIL LINK actually lands - previously it did not
// land here at all: both the branded email (backend/routes/auth.py's
// forgot_password) and the plain Firebase fallback (AuthContext.resetPassword)
// generated a link with handleCodeInApp: false, which routes through
// Firebase's own generic hosted page (https://{authDomain}/__/auth/action) -
// unstyled, unbranded, and not part of this app at all. Both now set
// handleCodeInApp: true with this page's URL, so the whole flow - open the
// email, land here, choose a new password - stays inside EcoTrack.
//
// Reached with a query string Firebase itself appends: ?mode=resetPassword
// &oobCode=<one-time code>&apiKey=... - nothing here is typed in by hand.
// oobCode is a real, single-use, time-limited Firebase credential; this page
// never sees or needs the account's old password, only that code.
//
// No ProtectedRoute - a person clicking this link is very often signed OUT
// on this browser/device entirely (a different device than the one they are
// locked out of), and confirmPasswordReset works purely off oobCode, with no
// dependency on any current session at all.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Leaf,
  Loader2,
  Lock,
  LogIn,
} from 'lucide-react';

import { auth } from '../firebase';
import { useTheme } from '../context/ThemeContext';
import { PASSWORD_RULES, scorePassword } from '../utils/validation';

// Firebase's own action-link errors for this exact call - see MDN-style
// error codes in the Admin/Client SDK docs. Anything not in this map still
// gets a real, if generic, message rather than a raw error code on screen.
function friendlyResetError(error) {
  const messages = {
    'auth/expired-action-code': 'This link has expired. Request a new one from the sign-in page.',
    'auth/invalid-action-code': 'This link is invalid or has already been used. Request a new one from the sign-in page.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'This link no longer matches an EcoTrack account.',
    'auth/weak-password': 'Please choose a stronger password.',
    'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
  };
  return messages[error?.code] || 'Something went wrong. Please request a new reset link.';
}

export default function ResetPassword() {
  const { prefersReducedMotion } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 'checking' | 'invalid' | 'ready' | 'success' - a real state machine, not
  // booleans, because these four are mutually exclusive and the JSX below
  // renders exactly one of them at a time.
  const [stage, setStage] = useState('checking');
  const [email, setEmail] = useState('');
  const [invalidReason, setInvalidReason] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');

  // Verify the code the moment this page loads, before showing any form at
  // all - a form for a code that turns out to be expired is a dead end
  // someone only discovers after typing a whole new password.
  useEffect(() => {
    // Defensive: Firebase's action-handler URL pattern is shared across
    // resetPassword/verifyEmail/recoverEmail modes. This route is only ever
    // linked from a password-reset email, but a stale bookmark or a
    // hand-edited URL could still land here with the wrong mode - treat that
    // the same as an invalid code rather than trying to confirm a reset that
    // was never actually requested.
    if (!oobCode || mode !== 'resetPassword') {
      setInvalidReason(
        oobCode
          ? "This link isn't a password reset link."
          : 'This link is missing its reset code.'
      );
      setStage('invalid');
      return;
    }

    let cancelled = false;
    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        if (cancelled) return;
        setEmail(verifiedEmail);
        setStage('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setInvalidReason(friendlyResetError(error));
        setStage('invalid');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strength = scorePassword(password);

  const passwordError = !password
    ? 'Password is required.'
    : PASSWORD_RULES.every((rule) => rule.test(password))
      ? null
      : 'Password does not meet all the requirements below.';

  const confirmError = !confirmPassword
    ? 'Please confirm your password.'
    : confirmPassword !== password
      ? 'Passwords do not match.'
      : null;

  const isValid = !passwordError && !confirmError;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched({ password: true, confirmPassword: true });
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStage('success');
    } catch (error) {
      toast.error(friendlyResetError(error));
      // A code is single-use - if Firebase rejects it here (expired between
      // page-load and submit, or already used from another tab), the form
      // itself is now a dead end. Send them back to the invalid-link state
      // rather than leaving a form that will fail the same way again.
      if (error?.code === 'auth/expired-action-code' || error?.code === 'auth/invalid-action-code') {
        setInvalidReason(friendlyResetError(error));
        setStage('invalid');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (field, error) => {
    if (!touched[field]) return '';
    return error ? 'is-invalid' : 'is-valid';
  };

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
            PASSWORD RESET
          </span>
        </div>

        {/* ---------- checking the code ---------- */}
        {stage === 'checking' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 0 1rem' }}>
            <Loader2 size={18} style={{ animation: 'eco-spin 0.8s linear infinite', color: 'var(--eco-primary)' }} />
            <span className="eco-text-muted" style={{ fontSize: '0.94rem' }}>Checking your link…</span>
          </div>
        )}

        {/* ---------- expired / invalid / wrong mode ---------- */}
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
              {invalidReason} Reset links only work once, and expire an hour after
              they are sent.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login', { state: { openReset: true } })}
              className="eco-btn eco-btn-primary"
              style={{ width: '100%', padding: '0.85rem' }}
            >
              <KeyRound size={16} />
              Request a new link
            </button>
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
              Password updated
            </h1>
            <p className="eco-text-muted" style={{ margin: '0 0 1.8rem', lineHeight: 1.6, fontSize: '0.94rem' }}>
              You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="eco-btn eco-btn-primary"
              style={{ width: '100%', padding: '0.85rem' }}
            >
              <LogIn size={16} />
              Continue to sign in
            </button>
          </motion.div>
        )}

        {/* ---------- the form ---------- */}
        {stage === 'ready' && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Lock size={22} style={{ color: 'var(--eco-primary)', display: 'block', marginBottom: '0.9rem' }} />
            <h1 className="eco-display" style={{ fontSize: 'clamp(1.5rem, 4vw, 1.9rem)', margin: '0 0 0.5rem' }}>
              Choose a new password
            </h1>
            <p className="eco-text-muted" style={{ margin: '0 0 1.6rem', lineHeight: 1.6, fontSize: '0.94rem' }}>
              For <strong style={{ color: 'var(--eco-text)' }}>{email}</strong>
            </p>

            <form className="eco-form" onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <div className="form-floating" style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="reset-password"
                    className={`form-control ${fieldClass('password', passwordError)}`}
                    placeholder="Choose a password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => {
                      setTouched((previous) => ({ ...previous, password: true }));
                      setPasswordFocused(false);
                    }}
                    autoComplete="new-password"
                    autoFocus
                    disabled={submitting}
                    style={{ paddingRight: '3rem' }}
                  />
                  <label htmlFor="reset-password">
                    <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                    New password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--eco-text-muted)',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Strength bar - same pattern as Register.jsx step 2 */}
                {password && (
                  <>
                    <div className="eco-strength-bar">
                      <div
                        className="eco-strength-fill"
                        style={{
                          width: `${(strength.score / strength.total) * 100}%`,
                          backgroundColor: strength.color,
                        }}
                      />
                    </div>
                    <div className="eco-field-hint" style={{ color: strength.color, fontWeight: 500 }}>
                      {STRENGTH_LABELS[strength.labelKey] || ''}
                    </div>
                  </>
                )}

                {(passwordFocused || password) && (
                  <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        marginTop: '0.7rem',
                        padding: '0.8rem 0.9rem',
                        borderRadius: 'var(--eco-radius-sm)',
                        background: 'rgba(var(--eco-primary-rgb), 0.05)',
                        border: '1px solid var(--eco-border)',
                      }}
                    >
                      <div
                        className="eco-text-muted"
                        style={{ fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.55rem' }}
                      >
                        Your password needs:
                      </div>
                      <div style={{ display: 'grid', gap: '0.4rem' }}>
                        {PASSWORD_RULES.map((rule) => {
                          const met = rule.test(password);
                          // The RULE_LABELS map turns each rule's i18n key
                          // into plain English - this page has no
                          // useTranslation() of its own (same as
                          // VerifyTwoFactor.jsx, the closest precedent: a
                          // single-purpose action page reached from an
                          // email link, not the main nav), so the keys are
                          // resolved here instead of through t().
                          return (
                            <div
                              key={rule.labelKey}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.8rem',
                                color: met ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
                                transition: 'color 0.2s ease',
                              }}
                            >
                              {met ? (
                                <Check size={14} />
                              ) : (
                                <span
                                  style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    border: '1.5px solid var(--eco-text-muted)',
                                    flexShrink: 0,
                                    display: 'inline-block',
                                    opacity: 0.6,
                                  }}
                                />
                              )}
                              {RULE_LABELS[rule.labelKey]}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}

                {touched.password && passwordError && (
                  <div className="eco-field-error">
                    <AlertCircle size={13} />
                    {passwordError}
                  </div>
                )}
              </div>

              <div className="mb-3">
                <div className="form-floating">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="reset-confirm"
                    className={`form-control ${fieldClass('confirmPassword', confirmError)}`}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    onBlur={() => setTouched((previous) => ({ ...previous, confirmPassword: true }))}
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                  <label htmlFor="reset-confirm">
                    <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                    Confirm password
                  </label>
                </div>
                {touched.confirmPassword && confirmError && (
                  <div className="eco-field-error">
                    <AlertCircle size={13} />
                    {confirmError}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="eco-btn eco-btn-primary"
                style={{ width: '100%', marginTop: '0.6rem', padding: '0.85rem' }}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        border: '2px solid rgba(255,255,255,0.35)',
                        borderTopColor: '#ffffff',
                        borderRadius: '50%',
                        animation: 'eco-spin 0.8s linear infinite',
                      }}
                    />
                    Saving…
                  </>
                ) : (
                  <>
                    Save new password
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

// PASSWORD_RULES' labelKeys are i18n keys meant for t() (they are reused
// as-is from Register.jsx's own rule set, so a password typed here is held
// to the exact same policy) - this page has no translation of its own, so
// they are resolved to plain English here instead. Keep in sync with
// register.rule* in frontend/src/i18n/locales/en.json if that copy ever
// changes.
const RULE_LABELS = {
  'register.ruleMinLength': 'At least 8 characters',
  'register.ruleUppercase': 'One uppercase letter',
  'register.ruleLowercase': 'One lowercase letter',
  'register.ruleNumber': 'One number',
  'register.ruleSpecial': 'One special character',
};

// Same reasoning as RULE_LABELS above - scorePassword() (utils/validation.js)
// returns an i18n key meant for t(), resolved to plain English here instead.
// Keep in sync with register.strength* in en.json if that copy ever changes.
const STRENGTH_LABELS = {
  'register.strengthTooWeak': 'Too weak',
  'register.strengthWeak': 'Weak',
  'register.strengthFair': 'Fair',
  'register.strengthGood': 'Good',
  'register.strengthStrong': 'Strong',
};
