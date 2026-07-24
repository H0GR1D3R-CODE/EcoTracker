// EcoTrack/frontend/src/pages/Register.jsx
// Sign-up page, built as a three step form with a progress bar.
//
// WHY SPLIT IT INTO STEPS
// Asking for five things at once looks like work. Asking for two things three
// times looks easy, and the progress bar tells the user how much is left.
// Each step validates before it will let the user move on, so mistakes are
// caught immediately rather than all at once at the end.
//
//   Step 1  name + email
//   Step 2  password + confirmation
//   Step 3  region, then create the account

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Leaf,
  Lock,
  Mail,
  MapPin,
  User,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SelectField from '../components/SelectField';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const TOTAL_STEPS = 3;

const STEP_TITLES = [
  { title: 'Your details', subtitle: 'Tell us who you are' },
  { title: 'Secure your account', subtitle: 'Choose a strong password' },
  { title: 'Almost done', subtitle: 'Where are you tracking from?' },
];

// Region matters because emission factors differ by region - India's grid
// electricity is far more carbon-intensive than most of Europe's.
const REGIONS = [
  'India',
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'West Bengal',
  'Other',
];

/**
 * Score a password out of 4 for the strength bar.
 * This is a guide for the user, not a security check - the real minimum
 * (6 characters) is enforced by Firebase and by the Flask backend.
 */
function scorePassword(password) {
  if (!password) return { score: 0, label: '', color: 'var(--eco-border)' };

  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  // Mixed case and digits together count as one point
  if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const levels = [
    { label: 'Too short', color: 'var(--eco-danger)' },
    { label: 'Weak', color: 'var(--eco-danger)' },
    { label: 'Fair', color: 'var(--eco-orange)' },
    { label: 'Good', color: '#eab308' },
    { label: 'Strong', color: 'var(--eco-primary)' },
  ];

  return { score, ...levels[score] };
}

export default function Register() {
  const { register, user, loading } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  // direction controls which way the slide animation moves: 1 forward, -1 back
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    region: 'India',
  });

  const [touched, setTouched] = useState({});

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  const strength = scorePassword(form.password);

  // --- validation for every field, recalculated on each render ---
  const errors = {
    name: !form.name.trim()
      ? 'Name is required.'
      : form.name.trim().length < 2
        ? 'Name must be at least 2 characters.'
        : form.name.trim().length > 60
          ? 'Name must be 60 characters or fewer.'
          : null,

    email: !form.email.trim()
      ? 'Email is required.'
      : !EMAIL_PATTERN.test(form.email.trim())
        ? 'Please enter a valid email address.'
        : null,

    password: !form.password
      ? 'Password is required.'
      : form.password.length < 6
        ? 'Password must be at least 6 characters.'
        : null,

    confirmPassword: !form.confirmPassword
      ? 'Please confirm your password.'
      : form.confirmPassword !== form.password
        ? 'Passwords do not match.'
        : null,

    region: !form.region ? 'Please choose a region.' : null,
  };

  // Which fields belong to which step, so "can I continue?" is easy to answer
  const stepFields = {
    1: ['name', 'email'],
    2: ['password', 'confirmPassword'],
    3: ['region'],
  };

  const currentStepValid = stepFields[step].every((field) => !errors[field]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((previous) => ({ ...previous, [name]: true }));
  };

  const fieldClass = (field) => {
    if (!touched[field]) return '';
    return errors[field] ? 'is-invalid' : 'is-valid';
  };

  const goNext = () => {
    // Reveal any errors on this step before refusing to advance
    const newTouched = { ...touched };
    stepFields[step].forEach((field) => {
      newTouched[field] = true;
    });
    setTouched(newTouched);

    if (!currentStepValid) return;

    setDirection(1);
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((current) => Math.max(current - 1, 1));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Final check across every field, not just the current step
    setTouched({
      name: true,
      email: true,
      password: true,
      confirmPassword: true,
      region: true,
    });

    const allValid = Object.values(errors).every((error) => !error);
    if (!allValid || submitting) {
      if (!allValid) toast.error('Please fix the highlighted fields.');
      return;
    }

    setSubmitting(true);

    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        region: form.region,
      });

      toast.success('Account created. Welcome to EcoTrack!');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error.message);

      // Send the user back to the step that caused the problem, so they are
      // not left staring at a region dropdown when the email is the issue
      if (/email/i.test(error.message)) {
        setDirection(-1);
        setStep(1);
      } else if (/password/i.test(error.message)) {
        setDirection(-1);
        setStep(2);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Slide the outgoing step out one way and the incoming step in the other
  const slideVariants = prefersReducedMotion
    ? { enter: { opacity: 1, x: 0 }, center: { opacity: 1, x: 0 }, exit: { opacity: 1, x: 0 } }
    : {
        enter: (dir) => ({ opacity: 0, x: dir > 0 ? 44 : -44 }),
        center: { opacity: 1, x: 0 },
        exit: (dir) => ({ opacity: 0, x: dir > 0 ? -44 : 44 }),
      };

  const progressPercent = (step / TOTAL_STEPS) * 100;

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
      <div
        className="eco-glow-orb"
        style={{ width: 400, height: 400, background: 'var(--eco-purple)', top: '-10%', right: '-8%' }}
      />
      <div
        className="eco-glow-orb"
        style={{ width: 340, height: 340, background: 'var(--eco-primary)', bottom: '-12%', left: '-6%' }}
      />

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="eco-card eco-glass"
        style={{ width: '100%', maxWidth: 470, padding: '2.2rem 2rem', zIndex: 1 }}
      >
        {/* ---------- Header ---------- */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', color: 'var(--eco-primary)', marginBottom: '0.5rem' }}>
            <Leaf size={34} />
          </div>
          <h1 className="eco-gradient-text" style={{ fontSize: '1.7rem', marginBottom: '0.2rem' }}>
            Create your account
          </h1>
          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Start measuring your climate impact today
          </p>
        </div>

        {/* ---------- Progress bar ---------- */}
        <div style={{ marginBottom: '1.8rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.55rem',
              fontSize: '0.78rem',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--eco-primary)' }}>
              Step {step} of {TOTAL_STEPS}
            </span>
            <span className="eco-text-muted">{STEP_TITLES[step - 1].title}</span>
          </div>

          <div
            style={{
              height: 6,
              borderRadius: 6,
              background: 'var(--eco-border)',
              overflow: 'hidden',
            }}
          >
            {/* The fill animates its width whenever the step changes */}
            <motion.div
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.45, ease: 'easeInOut' }}
              style={{
                height: '100%',
                borderRadius: 6,
                background: 'linear-gradient(90deg, var(--eco-primary), var(--eco-purple))',
              }}
            />
          </div>

          {/* Step dots, ticked once passed */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.7rem' }}>
            {STEP_TITLES.map((item, index) => {
              const stepNumber = index + 1;
              const done = stepNumber < step;
              const active = stepNumber === step;

              return (
                <div
                  key={item.title}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem' }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: done || active ? 'var(--eco-primary)' : 'var(--eco-border)',
                      color: done || active ? '#04140c' : 'var(--eco-text-muted)',
                      fontWeight: 700,
                      fontSize: '0.68rem',
                      transition: 'background-color 0.3s ease',
                    }}
                  >
                    {done ? <Check size={12} /> : stepNumber}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------- Form ---------- */}
        <form className="eco-form" onSubmit={handleSubmit} noValidate>
          {/* custom={direction} passes the slide direction into the variants above */}
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: 'easeInOut' }}
            >
              {/* ============ STEP 1: name and email ============ */}
              {step === 1 && (
                <>
                  <div className="mb-3">
                    <div className="form-floating">
                      <input
                        type="text"
                        id="reg-name"
                        name="name"
                        className={`form-control ${fieldClass('name')}`}
                        placeholder="Your full name"
                        value={form.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="name"
                        // autoFocus puts the cursor here so the user can just start typing
                        autoFocus
                      />
                      <label htmlFor="reg-name">
                        <User size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        Full name
                      </label>
                    </div>
                    {touched.name && errors.name && (
                      <div className="eco-field-error">
                        <AlertCircle size={13} />
                        {errors.name}
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="form-floating">
                      <input
                        type="email"
                        id="reg-email"
                        name="email"
                        className={`form-control ${fieldClass('email')}`}
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="email"
                      />
                      <label htmlFor="reg-email">
                        <Mail size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        Email address
                      </label>
                    </div>
                    {touched.email && errors.email && (
                      <div className="eco-field-error">
                        <AlertCircle size={13} />
                        {errors.email}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ============ STEP 2: password ============ */}
              {step === 2 && (
                <>
                  <div className="mb-3">
                    <div className="form-floating" style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="reg-password"
                        name="password"
                        className={`form-control ${fieldClass('password')}`}
                        placeholder="Choose a password"
                        value={form.password}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="new-password"
                        autoFocus
                        style={{ paddingRight: '3rem' }}
                      />
                      <label htmlFor="reg-password">
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

                    {/* Strength bar - fills and changes colour as the password improves */}
                    {form.password && (
                      <>
                        <div className="eco-strength-bar">
                          <div
                            className="eco-strength-fill"
                            style={{
                              width: `${(strength.score / 4) * 100}%`,
                              backgroundColor: strength.color,
                            }}
                          />
                        </div>
                        <div
                          className="eco-field-hint"
                          style={{ color: strength.color, fontWeight: 500 }}
                        >
                          {strength.label}
                        </div>
                      </>
                    )}

                    {touched.password && errors.password && (
                      <div className="eco-field-error">
                        <AlertCircle size={13} />
                        {errors.password}
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="form-floating">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="reg-confirm"
                        name="confirmPassword"
                        className={`form-control ${fieldClass('confirmPassword')}`}
                        placeholder="Repeat your password"
                        value={form.confirmPassword}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="new-password"
                      />
                      <label htmlFor="reg-confirm">
                        <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        Confirm password
                      </label>
                    </div>
                    {touched.confirmPassword && errors.confirmPassword && (
                      <div className="eco-field-error">
                        <AlertCircle size={13} />
                        {errors.confirmPassword}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ============ STEP 3: region and review ============ */}
              {step === 3 && (
                <>
                  <div className="mb-3">
                    <SelectField
                      id="reg-region"
                      label="Region"
                      value={form.region}
                      // SelectField hands back the value directly rather than an
                      // event, so it is reshaped to match the other fields
                      onChange={(region) =>
                        setForm((previous) => ({ ...previous, region }))
                      }
                      options={REGIONS.map((region) => ({ value: region, label: region }))}
                    />
                    <div className="eco-field-hint">
                      <MapPin size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                      Emission factors vary by region — this keeps your results accurate.
                    </div>
                  </div>

                  {/* A quick review so the user can catch a typo before submitting */}
                  <div
                    style={{
                      background: 'rgba(var(--eco-primary-rgb), 0.05)',
                      border: '1px solid var(--eco-border)',
                      borderRadius: 'var(--eco-radius-sm)',
                      padding: '0.9rem 1rem',
                      marginTop: '1.2rem',
                      fontSize: '0.86rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span className="eco-text-muted">Name</span>
                      <span style={{ fontWeight: 600 }}>{form.name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="eco-text-muted">Email</span>
                      <span style={{ fontWeight: 600, wordBreak: 'break-all' }}>{form.email}</span>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {/* ---------- Navigation buttons ---------- */}
          <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.5rem' }}>
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="eco-btn eco-btn-ghost"
                disabled={submitting}
                style={{ flex: '0 0 auto', padding: '0.8rem 1.1rem' }}
              >
                <ArrowLeft size={17} />
                Back
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="eco-btn eco-btn-primary"
                style={{ flex: 1, padding: '0.8rem' }}
              >
                Continue
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                type="submit"
                className="eco-btn eco-btn-primary"
                style={{ flex: 1, padding: '0.8rem' }}
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
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <Check size={17} />
                  </>
                )}
              </button>
            )}
          </div>
        </form>

        <p
          className="eco-text-muted"
          style={{ textAlign: 'center', marginTop: '1.4rem', marginBottom: 0, fontSize: '0.88rem' }}
        >
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
