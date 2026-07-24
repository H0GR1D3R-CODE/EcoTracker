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
import { AlertCircle, ArrowRight, Eye, EyeOff, Leaf, Lock, Mail } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// Same simple check the backend uses: something@something.something
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function Login() {
  const { login, user, loading } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  // "touched" tracks which fields the user has actually visited, so we do not
  // shout "email is required" at someone who has not reached that box yet
  const [touched, setTouched] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Where to go after a successful login. ProtectedRoute puts the page the user
  // originally wanted into location.state, so they land there rather than
  // always on the dashboard.
  const redirectTo = location.state?.from?.pathname || '/dashboard';

  // Someone already signed in has no reason to see this page
  useEffect(() => {
    if (!loading && user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, loading, navigate, redirectTo]);

  // --- validation, recalculated on every render so it is always current ---
  const errors = {
    email: !form.email
      ? 'Email is required.'
      : !EMAIL_PATTERN.test(form.email)
        ? 'Please enter a valid email address.'
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

    try {
      const profile = await login({ email: form.email.trim(), password: form.password });
      toast.success(`Welcome back, ${profile?.name?.split(' ')[0] || 'there'}!`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      // AuthContext has already turned Firebase's raw code into a readable message
      toast.error(error.message);
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
      {/* Soft coloured glows behind the card */}
      <div
        className="eco-glow-orb"
        style={{ width: 380, height: 380, background: 'var(--eco-primary)', top: '-8%', left: '-6%' }}
      />
      <div
        className="eco-glow-orb"
        style={{ width: 320, height: 320, background: 'var(--eco-purple)', bottom: '-10%', right: '-5%' }}
      />

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="eco-card eco-glass"
        style={{ width: '100%', maxWidth: 430, padding: '2.4rem 2rem', zIndex: 1 }}
      >
        {/* ---------- Header ---------- */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <motion.div
            animate={prefersReducedMotion ? {} : { y: [0, -7, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'inline-flex', color: 'var(--eco-primary)', marginBottom: '0.6rem' }}
          >
            <Leaf size={40} />
          </motion.div>

          <h1 className="eco-gradient-text" style={{ fontSize: '1.9rem', marginBottom: '0.3rem' }}>
            Welcome back
          </h1>
          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.92rem' }}>
            Sign in to continue tracking your footprint
          </p>
        </div>

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
                Email address
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
                placeholder="Your password"
                value={form.password}
                onChange={handleChange}
                onBlur={handleBlur}
                autoComplete="current-password"
                disabled={submitting}
                style={{ paddingRight: '3rem' }}
              />
              <label htmlFor="login-password">
                <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Password
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
          </div>

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
                    border: '2px solid rgba(0,0,0,0.25)',
                    borderTopColor: '#04140c',
                    borderRadius: '50%',
                    animation: 'eco-spin 0.8s linear infinite',
                  }}
                />
                Signing in…
              </>
            ) : (
              <>
                Sign in
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
          New to EcoTrack?{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>
            Create an account
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
