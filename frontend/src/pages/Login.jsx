// EcoTrack/frontend/src/pages/Login.jsx
// Sign-in page: a glassmorphism card with floating labels, inline validation
// that reacts as the user types, and a password visibility toggle.
//
// The actual sign-in happens in AuthContext.login(), which talks to Firebase
// and then swaps the resulting token for the user's profile from Flask.

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Leaf, Lock, Mail, Send, UserPlus } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authApi } from '../utils/api';
import { EMAIL_ERROR, EMAIL_PATTERN } from '../utils/validation';
import { isNativeApp } from '../utils/platform';
import GoogleSignInButton from '../components/GoogleSignInButton';

// Which Firebase codes plausibly mean "wrong email or password" - worth a
// follow-up check-email call to tell the two apart. Anything else (network
// trouble, too-many-requests, a disabled account) is a different problem
// that a "did you mean to sign up?" panel would only confuse.
const BAD_CREDENTIAL_CODES = new Set(['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']);

export default function Login() {
  const { login, resetPassword, user, loading, isAdmin, twoFactorPending } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // 'signin' is the form everyone sees first. 'reset' swaps the card's
  // content for the forgot-password flow without leaving the page - the
  // person is already looking at the right place, so there is no reason to
  // send them to a separate route for it.
  //
  // Both can be deep-linked into via location.state (the same mechanism
  // ProtectedRoute already uses for redirectTo, above) - Register.jsx sends
  // someone here already in reset mode, email prefilled, when they tried to
  // register an address that already has an account, rather than leaving
  // them to retype it after a bare "already exists" toast.
  const [mode, setMode] = useState(location.state?.openReset ? 'reset' : 'signin');

  const [form, setForm] = useState({ email: location.state?.prefillEmail || '', password: '' });
  // "touched" tracks which fields the user has actually visited, so we do not
  // shout "email is required" at someone who has not reached that box yet
  const [touched, setTouched] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Set after a failed sign-in turns out to be for an email with no EcoTrack
  // account at all - mirrors Register.jsx's emailExistsError panel for the
  // opposite case, so "no account with this email" gets real next steps (a
  // Create account button) instead of just a toast to remember. Cleared the
  // moment the email field changes again - same reasoning as Register's
  // version.
  //
  // WHY THIS NEEDS A SEPARATE CHECK-EMAIL CALL, NOT JUST error.code
  // Confirmed live against this project's own Firebase Auth: it returns the
  // same generic INVALID_LOGIN_CREDENTIALS (auth/invalid-credential) for a
  // wrong password AND for an email with no account at all - a deliberate
  // Google anti-enumeration measure, not a bug, and not something client
  // code can see past. So a failed sign-in with a credential-shaped error
  // triggers the SAME check-email call Register.jsx already uses (POST
  // /api/auth/check-email - see that route's own docstring on why this is
  // an accepted, already-existing trade-off, not a new exposure) to find
  // out which of the two actually happened, instead of guessing from a code
  // that no longer reveals it.
  const [accountNotFoundError, setAccountNotFoundError] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);

  // --- forgot password ---
  const [resetEmail, setResetEmail] = useState(location.state?.prefillEmail || '');
  const [resetTouched, setResetTouched] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Where to go after a successful login. ProtectedRoute puts the page the user
  // originally wanted into location.state, so they land there rather than
  // always on the dashboard.
  const redirectTo = location.state?.from?.pathname || '/dashboard';

  // Someone already signed in has no reason to see this page. Admins go to
  // their console, everyone else to wherever they were headed - unless a code
  // is still outstanding, in which case Firebase already considers them
  // signed in but this app does not yet: send them to finish that first.
  useEffect(() => {
    if (loading || !user) return;
    if (twoFactorPending) {
      navigate('/verify-2fa', { replace: true });
      return;
    }
    navigate(isAdmin ? '/admin' : redirectTo, { replace: true });
  }, [user, loading, isAdmin, twoFactorPending, navigate, redirectTo]);

  // --- validation, recalculated on every render so it is always current ---
  const errors = {
    email: !form.email
      ? 'Email is required.'
      : !EMAIL_PATTERN.test(form.email.trim())
        ? EMAIL_ERROR
        : null,
    password: !form.password
      ? 'Password is required.'
      : form.password.length < 6
        ? 'Password must be at least 6 characters.'
        : null,
  };

  const isValid = !errors.email && !errors.password;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    if (name === 'email' && accountNotFoundError) setAccountNotFoundError(false);
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((previous) => ({ ...previous, [name]: true }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault(); // stop the browser reloading the page

    // Mark everything touched so any remaining errors become visible
    setTouched({ email: true, password: true });
    if (!isValid || submitting) return;

    setSubmitting(true);
    setAccountNotFoundError(false);

    try {
      const result = await login({ email: form.email.trim(), password: form.password });
      if (result?.twoFactorRequired) {
        navigate('/verify-2fa', { replace: true });
        return;
      }
      // No "welcome back" toast here - the dashboard's own banner says exactly
      // that a moment later, and saying it twice in two different places felt
      // like two different systems greeting you rather than one.
      // The admin account is admin-only, so send it straight to the console
      navigate(result?.isAdmin ? '/admin' : redirectTo, { replace: true });
    } catch (error) {
      // The password was correct and Firebase signed them in - only the
      // profile load after that failed. AuthContext.login() has already
      // signed them back out rather than leave that broken half-session
      // sitting there, so this sends them somewhere that works right now
      // instead of back onto a sign-in form for an account that isn't the
      // problem - see AuthContext.login()'s own comment on this exact code.
      if (error.code === 'sign_in_load_failed') {
        toast.error(error.message);
        setForm((previous) => ({ ...previous, password: '' }));
        navigate('/', { replace: true });
        return;
      }

      // A credential-shaped failure could mean "wrong password" or "no
      // account at all" - Firebase's own error code no longer distinguishes
      // these (see accountNotFoundError's own comment above), so ask the
      // backend which one it actually was before deciding what to show.
      if (BAD_CREDENTIAL_CODES.has(error.code)) {
        setCheckingAccount(true);
        try {
          const result = await authApi.checkEmail(form.email.trim());
          if (result?.exists === false) {
            setAccountNotFoundError(true);
          } else {
            toast.error(error.message);
          }
        } catch {
          // The check itself failed (network, rate limit) - fall back to the
          // plain, still-accurate-either-way message rather than leaving the
          // user with no feedback at all.
          toast.error(error.message);
        } finally {
          setCheckingAccount(false);
        }
      } else {
        // AuthContext has already turned Firebase's raw code into a readable message
        toast.error(error.message);
      }
      // Clear only the password - retyping the email every time is annoying
      setForm((previous) => ({ ...previous, password: '' }));
    } finally {
      // finally always runs, so the button never stays stuck on "Signing in…"
      setSubmitting(false);
    }
  };

  /** Which Bootstrap validation class a field should carry right now. */
  const fieldClass = (field) => {
    if (!touched[field]) return '';
    return errors[field] ? 'is-invalid' : 'is-valid';
  };

  // --- forgot password ---
  const resetEmailError = !resetEmail
    ? 'Email is required.'
    : !EMAIL_PATTERN.test(resetEmail.trim())
      ? EMAIL_ERROR
      : null;

  const openResetMode = () => {
    // Carry over whatever was already typed into the sign-in email field -
    // someone clicking "Forgot password?" almost always just typed the email
    // they are stuck on
    setResetEmail(form.email);
    setResetTouched(false);
    setResetSent(false);
    setMode('reset');
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();
    setResetTouched(true);
    if (resetEmailError || resetSending) return;

    setResetSending(true);
    try {
      await resetPassword(resetEmail.trim());
      setResetSent(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResetSending(false);
    }
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
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="eco-auth-grid">
        {/* ---------- the copy, at full size ---------- */}
        {/* This is what the drifting orbs and rising motes were standing in for.
            The page was a small card on a very large empty area, so the
            background was most of what a visitor looked at - and on the paper
            ground those washes read as smudges and the motes as dirt on the
            screen. The header that was squeezed into the top of the card now
            has the room to be a headline. */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              flexWrap: 'wrap',
              marginBottom: '1.8rem',
            }}
          >
            <Leaf size={16} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
            <span className="eco-marker">EcoTrack</span>
            <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
              {t('login.signInMarker')}
            </span>
            <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
          </div>

          <h1
            className="eco-display"
            style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', margin: '0 0 1.2rem' }}
          >
            Welcome <span className="eco-gradient-text">back</span>
          </h1>
          <p
            className="eco-text-muted"
            style={{ fontSize: '1.05rem', maxWidth: '46ch', margin: '0 0 2.4rem' }}
          >
            {t('login.subtitle')}
          </p>

          <div style={{ display: 'grid', gap: '1rem', maxWidth: 420 }}>
            {[
              [t('login.feature1Title'), t('login.feature1Note')],
              [t('login.feature2Title'), t('login.feature2Note')],
            ].map(([title, note]) => (
              <div key={title} style={{ paddingTop: '0.8rem', borderTop: '1px solid var(--rule)' }}>
                <div className="eco-display" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {title}
                </div>
                <div className="eco-text-muted" style={{ fontSize: '0.84rem', marginTop: '0.15rem' }}>
                  {note}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: 0.08, ease: [0.4, 0, 0.2, 1] }}
          className="eco-card"
          style={{ width: '100%', padding: '2rem', zIndex: 1, overflow: 'hidden' }}
        >
        {/* A plain ternary, not AnimatePresence mode="wait" - that
            combination turned out to be genuinely broken here: confirmed
            live (in Register.jsx's identical step-transition pattern, then
            fixed there first) that the state driving which branch to show
            updates correctly while the DOM stays frozen on the OLD branch
            forever, because mode="wait" holds the new content back until
            the old one's exit reports complete, and that exit was never
            completing. For a sign-in page specifically, that failure mode
            is "click Forgot password, or Back to sign in, and the form
            never appears again" - about as severe as a bug here gets. */}
        {mode === 'reset' ? (
          <motion.div
            key="reset"
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              onClick={() => setMode('signin')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'none',
                border: 'none',
                padding: 0,
                marginBottom: '1.3rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--eco-text-muted)',
              }}
            >
              <ArrowLeft size={15} />
              {t('login.backToSignIn')}
            </button>

            {resetSent ? (
              // Deliberately the same confirmation regardless of whether the
              // address had an account - see resetPassword's own comment in
              // AuthContext for why that is not an oversight.
              <div style={{ paddingTop: '1.1rem', borderTop: '2px solid var(--readout)' }}>
                <span className="eco-marker" style={{ display: 'block', marginBottom: '0.7rem' }}>
                  {t('login.checkInbox')}
                </span>
                <h2 className="eco-display" style={{ fontSize: '1.5rem', margin: '0 0 0.8rem' }}>
                  {t('login.resetLinkSent')}
                </h2>
                <p className="eco-text-muted" style={{ margin: 0, lineHeight: 1.65 }}>
                  If an EcoTrack account exists for <strong style={{ color: 'var(--eco-text)' }}>{resetEmail.trim()}</strong>,
                  an email with a link to choose a new password is on its way. It can take a
                  minute or two, and it is worth a look in spam.
                </p>
              </div>
            ) : (
              <>
                <h2 className="eco-display" style={{ fontSize: '1.5rem', margin: '0 0 0.6rem' }}>
                  {t('login.resetTitle')}
                </h2>
                <p className="eco-text-muted" style={{ margin: '0 0 1.5rem', fontSize: '0.92rem', lineHeight: 1.6 }}>
                  {t('login.resetSubtitle')}
                </p>

                <form className="eco-form" onSubmit={handleResetSubmit} noValidate>
                  <div className="mb-2">
                    <div className="form-floating">
                      <input
                        type="email"
                        id="reset-email"
                        className={`form-control ${resetTouched ? (resetEmailError ? 'is-invalid' : 'is-valid') : ''}`}
                        placeholder="you@example.com"
                        value={resetEmail}
                        onChange={(event) => setResetEmail(event.target.value)}
                        onBlur={() => setResetTouched(true)}
                        autoComplete="email"
                        disabled={resetSending}
                      />
                      <label htmlFor="reset-email">
                        <Mail size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        {t('login.emailAddress')}
                      </label>
                    </div>
                    {resetTouched && resetEmailError && (
                      <div className="eco-field-error">
                        <AlertCircle size={13} />
                        {resetEmailError}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="eco-btn eco-btn-primary"
                    style={{ width: '100%', marginTop: '1rem', padding: '0.85rem' }}
                    disabled={resetSending}
                  >
                    {resetSending ? (
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
                        {t('login.sending')}
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        {t('login.sendResetLink')}
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="signin"
            initial={prefersReducedMotion ? false : { opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
        {/* ---------- Google, first ---------- */}
        {/* Above the form on purpose: it is one click against typing an email
            and a password, so burying it under the thing it replaces would be
            perverse. It signs in existing accounts and creates new ones. */}
        <GoogleSignInButton
          label={t('login.signInWithGoogle')}
          requireExisting
          onDone={(result) =>
            navigate(result?.twoFactorRequired ? '/verify-2fa' : redirectTo, { replace: true })
          }
        />

        {!isNativeApp() && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
              margin: '1.3rem 0',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'var(--eco-border)' }} />
            <span className="eco-text-muted" style={{ fontSize: '0.74rem', letterSpacing: '0.04em' }}>
              {t('login.orDivider')}
            </span>
            <span style={{ flex: 1, height: 1, background: 'var(--eco-border)' }} />
          </div>
        )}

        {/* ---------- Form ---------- */}
        {/* noValidate turns off the browser's own popup messages so ours show instead */}
        <form className="eco-form" onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="email"
                id="login-email"
                name="email"
                className={`form-control ${fieldClass('email')}`}
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                onBlur={handleBlur}
                autoComplete="email"
                disabled={submitting}
              />
              <label htmlFor="login-email">
                <Mail size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                {t('login.emailAddress')}
              </label>
            </div>

            {touched.email && errors.email && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="eco-field-error"
              >
                <AlertCircle size={13} />
                {errors.email}
              </motion.div>
            )}
          </div>

          {/* Password */}
          <div className="mb-2">
            <div className="form-floating" style={{ position: 'relative' }}>
              <input
                // Swapping the type is what shows or hides the characters
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                name="password"
                className={`form-control ${fieldClass('password')}`}
                placeholder={t('login.passwordPlaceholder')}
                value={form.password}
                onChange={handleChange}
                onBlur={handleBlur}
                autoComplete="current-password"
                disabled={submitting}
                style={{ paddingRight: '3rem' }}
              />
              <label htmlFor="login-password">
                <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                {t('login.password')}
              </label>

              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
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

            {touched.password && errors.password && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="eco-field-error"
              >
                <AlertCircle size={13} />
                {errors.password}
              </motion.div>
            )}

            <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={openResetMode}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: '0.83rem',
                  fontWeight: 500,
                  color: 'var(--eco-text-muted)',
                }}
              >
                {t('login.forgotPassword')}
              </button>
            </div>
          </div>

          {/* Real next steps, not just a toast to remember - mirrors
              Register.jsx's own "this email already exists" panel for the
              opposite case. The check-email call above (not Firebase's own
              error, which no longer distinguishes this - see
              accountNotFoundError's own comment) has confirmed no account
              exists for this email, so a "Create account" button (email
              carried over, same as Register's own reverse link) is a
              genuine action, not a guess. */}
          {accountNotFoundError && (
            <div
              style={{
                padding: '0.9rem 1rem',
                marginBottom: '1rem',
                borderRadius: 'var(--eco-radius-sm)',
                border: '1px solid color-mix(in srgb, var(--eco-danger) 35%, var(--eco-border))',
                background: 'color-mix(in srgb, var(--eco-danger) 6%, var(--eco-card))',
              }}
            >
              <div style={{ display: 'flex', gap: '0.55rem', marginBottom: '0.8rem' }}>
                <AlertCircle size={16} style={{ color: 'var(--eco-danger)', flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.87rem', lineHeight: 1.5 }}>
                  No EcoTrack account found for that email address.
                </p>
              </div>
              <button
                type="button"
                className="eco-btn eco-btn-primary"
                style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }}
                onClick={() =>
                  navigate('/register', { state: { prefillEmail: form.email.trim() } })
                }
              >
                <UserPlus size={14} /> Create an account
              </button>
            </div>
          )}

          <button
            type="submit"
            className="eco-btn eco-btn-primary"
            style={{ width: '100%', marginTop: '1.3rem', padding: '0.85rem' }}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    // White, matching the label beside it. It was near-black on
                    // a button whose gradient is dark enough to need white
                    // text - the spinner was all but invisible on it.
                    border: '2px solid rgba(255,255,255,0.35)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'eco-spin 0.8s linear infinite',
                  }}
                />
                {checkingAccount ? 'Checking…' : t('login.signingIn')}
              </>
            ) : (
              <>
                {t('login.signIn')}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>

        {/* ---------- Footer ---------- */}
        <p
          className="eco-text-muted"
          style={{ textAlign: 'center', marginTop: '1.6rem', marginBottom: 0, fontSize: '0.9rem' }}
        >
          {t('login.newToEcoTrack')}{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>
            {t('login.createAccount')}
          </Link>
        </p>
          </motion.div>
        )}
        </motion.div>
      </div>
    </div>
  );
}
