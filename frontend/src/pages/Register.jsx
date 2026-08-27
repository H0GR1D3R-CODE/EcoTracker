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
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Leaf,
  Lock,
  LogIn,
  Mail,
  MapPin,
  User,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SelectField from '../components/SelectField';
import { EMAIL_ERROR, EMAIL_PATTERN, NAME_ERROR, isValidName, sanitizeNameInput } from '../utils/validation';
import { isNativeApp } from '../utils/platform';
import { executeRecaptcha } from '../utils/recaptcha';
import RecaptchaNotice from '../components/RecaptchaNotice';
import GoogleSignInButton from '../components/GoogleSignInButton';

const TOTAL_STEPS = 3;

// titleKey/subtitleKey, not title/subtitle - this array is evaluated once at
// module load, and useTranslation() is only callable inside a component, so
// the actual strings are resolved via t(key) where this is used below (the
// same labelKey pattern Navbar.jsx's APP_LINKS already uses).
const STEP_TITLES = [
  { titleKey: 'register.step1Title', subtitleKey: 'register.step1Subtitle' },
  { titleKey: 'register.step2Title', subtitleKey: 'register.step2Subtitle' },
  { titleKey: 'register.step3Title', subtitleKey: 'register.step3Subtitle' },
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

// The password rules. Each has a label and a test. These drive BOTH the live
// checklist shown next to the field AND whether the password is accepted - so
// the rules the user sees are exactly the rules that are enforced. The Flask
// backend enforces the same set, so the policy cannot be bypassed.
// labelKey, not label - same reasoning as STEP_TITLES above
const PASSWORD_RULES = [
  { labelKey: 'register.ruleMinLength', test: (p) => p.length >= 8 },
  { labelKey: 'register.ruleUppercase', test: (p) => /[A-Z]/.test(p) },
  { labelKey: 'register.ruleLowercase', test: (p) => /[a-z]/.test(p) },
  { labelKey: 'register.ruleNumber', test: (p) => /\d/.test(p) },
  { labelKey: 'register.ruleSpecial', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** How many rules a password satisfies, for the strength bar. */
function scorePassword(password) {
  if (!password) return { score: 0, labelKey: null, color: 'var(--eco-border)' };

  const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;

  // "Fair" was --eco-orange, which measures 3.29:1 on the paper ground - under
  // the 4.5:1 floor a label at this size needs. "Good" was a hardcoded
  // #eab308 matching no theme variable at all. Both are now measured,
  // theme-aware values: the instrument amber, then the electricity category's
  // gold, giving a real progression toward green rather than two granular
  // near-identical yellows.
  const levels = [
    { labelKey: 'register.strengthTooWeak', color: 'var(--eco-danger)' },
    { labelKey: 'register.strengthTooWeak', color: 'var(--eco-danger)' },
    { labelKey: 'register.strengthWeak', color: 'var(--eco-danger)' },
    { labelKey: 'register.strengthFair', color: 'var(--readout)' },
    { labelKey: 'register.strengthGood', color: 'var(--cat-electricity)' },
    { labelKey: 'register.strengthStrong', color: 'var(--eco-primary)' },
  ];

  return { score: met, total: PASSWORD_RULES.length, ...levels[met] };
}

export default function Register() {
  const { register, user, loading } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  // direction controls which way the slide animation moves: 1 forward, -1 back
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Set on a backend "email_exists" (code, not message text - see
  // AuthContext.register's own comment on why .code survives the wrap),
  // cleared the moment the email field changes again - a stale "this email
  // is taken" notice sitting under a DIFFERENT email the user has since
  // typed would be actively misleading.
  const [emailExistsError, setEmailExistsError] = useState(false);
  // Whether the requirements box is showing (opens when the password field is
  // focused, so it appears "when you click the password field")
  const [passwordFocused, setPasswordFocused] = useState(false);

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
          : !isValidName(form.name)
            ? NAME_ERROR
            : null,

    email: !form.email.trim()
      ? 'Email is required.'
      : !EMAIL_PATTERN.test(form.email.trim())
        ? EMAIL_ERROR
        : null,

    // Valid only when every rule passes - the same rules shown in the box
    password: !form.password
      ? 'Password is required.'
      : PASSWORD_RULES.every((rule) => rule.test(form.password))
        ? null
        : 'Password does not meet all the requirements below.',

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
    // The name field only ever accepts letters and name punctuation - stripped
    // as the user types rather than only complained about after the fact, so a
    // digit or symbol simply never appears in the field.
    const nextValue = name === 'name' ? sanitizeNameInput(value) : value;
    setForm((previous) => ({ ...previous, [name]: nextValue }));
    if (name === 'email' && emailExistsError) setEmailExistsError(false);
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
      const recaptchaToken = await executeRecaptcha('register');

      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        region: form.region,
        recaptchaToken,
      });

      // No welcome text here either - same reasoning as Login.jsx, the
      // dashboard banner is about to say it.
      toast.success('Account created.');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      // The email_exists case gets its own inline panel (rendered under the
      // email field on step 1, below) with real next steps - sign in, or
      // reset a forgotten password - rather than just a toast someone has
      // to remember the content of after being bounced back a step.
      if (error.code === 'email_exists') {
        setEmailExistsError(true);
        setDirection(-1);
        setStep(1);
      } else {
        toast.error(error.message);
        // Send the user back to the step that caused the problem, so they
        // are not left staring at a region dropdown when the password is
        // the issue
        if (/password/i.test(error.message)) {
          setDirection(-1);
          setStep(2);
        }
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
      <div className="eco-auth-grid">
        {/* ---------- the copy, at full size ---------- */}
        {/* The drifting orbs and rising motes are gone from both auth pages.
            They existed because a single card on a large empty page needs
            something to look at; the answer is copy worth reading, not ambient
            motion - and on the paper ground those washes read as smudges. */}
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
              {t('register.newAccountMarker')}
            </span>
            <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
          </div>

          <h1
            className="eco-display"
            style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', margin: '0 0 1.2rem' }}
          >
            Create your <span className="eco-gradient-text">account</span>
          </h1>
          <p
            className="eco-text-muted"
            style={{ fontSize: '1.05rem', maxWidth: '46ch', margin: '0 0 2.4rem' }}
          >
            {t('register.subtitle')}
          </p>

          {/* The step list, out here where there is room for it to say what each
              step actually asks for. Inside the card it was three 20px discs
              with no labels, which told the user how many steps there were and
              nothing else. */}
          <div style={{ display: 'grid', gap: '0.9rem', maxWidth: 420 }}>
            {STEP_TITLES.map((item, index) => {
              const stepNumber = index + 1;
              const done = stepNumber < step;
              const active = stepNumber === step;

              return (
                <div
                  key={item.titleKey}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.8rem',
                    paddingTop: '0.8rem',
                    // The rule is the state. The readout colour marks where
                    // the instrument currently is, the same mark used for
                    // every measured value in the app.
                    borderTop: `1px solid ${active ? 'var(--readout)' : 'var(--rule)'}`,
                    opacity: done || active ? 1 : 0.55,
                    transition: 'border-color 0.3s ease, opacity 0.3s ease',
                  }}
                >
                  <span
                    className="eco-readout"
                    style={{ fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}
                  >
                    {done ? <Check size={13} style={{ verticalAlign: -1 }} /> : String(stepNumber).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="eco-display" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {t(item.titleKey)}
                    </span>
                    <span
                      className="eco-text-muted"
                      style={{ display: 'block', fontSize: '0.84rem', marginTop: '0.1rem' }}
                    >
                      {t(item.subtitleKey)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: 0.08, ease: [0.4, 0, 0.2, 1] }}
          className="eco-card"
          style={{ width: '100%', padding: '2rem', zIndex: 1 }}
        >
        {/* ---------- Progress ---------- */}
        {/* The gradient pill is now a plain track with an amber fill: the bar is
            reporting how far through the form you are, which is a measurement,
            and measurements are amber here. */}
        <div style={{ marginBottom: '1.8rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: '0.6rem',
            }}
          >
            <span className="eco-marker">{t(STEP_TITLES[step - 1].titleKey)}</span>
            <span className="eco-readout" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {String(step).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')}
            </span>
          </div>

          <div style={{ height: 3, background: 'var(--rule-strong)', overflow: 'hidden' }}>
            {/* The fill animates its width whenever the step changes */}
            <motion.div
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.45, ease: 'easeInOut' }}
              style={{ height: '100%', background: 'var(--readout)' }}
            />
          </div>
        </div>

        {/* ---------- Form ---------- */}
        <form className="eco-form" onSubmit={handleSubmit} noValidate>
          {/* A plain keyed motion.div, not AnimatePresence mode="wait" - that
              combination turned out to be genuinely broken here: confirmed
              live, repeatedly, that clicking "Continue" correctly advanced
              the `step` state (checked directly via the fiber) while the DOM
              stayed frozen on the OLD step's fields forever, because
              mode="wait" holds the new child back until the old one's exit
              reports complete, and that exit was never completing - the
              same underlying framer-motion fragility BillScanner.jsx's own
              exit animation hit, just on a plain x/opacity tween this time,
              not a height:'auto' one, so the earlier fix's theory (it was
              specifically about layout measurement) does not fully explain
              this - but the fix is the same: stop depending on an exit
              animation completing before new content can appear. Dropping
              AnimatePresence means the old step's content is removed
              INSTANTLY (React's normal reconciliation, not gated behind
              framer-motion at all) the moment `step` changes; only the
              enter side is still animated, and if that hiccups the same way
              the worst case is the new step appearing at its settled
              position immediately rather than mid-slide - never stuck. */}
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
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
                        placeholder={t('register.fullNamePlaceholder')}
                        value={form.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="name"
                        // autoFocus puts the cursor here so the user can just start typing
                        autoFocus
                      />
                      <label htmlFor="reg-name">
                        <User size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        {t('register.fullName')}
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
                        {t('login.emailAddress')}
                      </label>
                    </div>
                    {touched.email && errors.email && (
                      <div className="eco-field-error">
                        <AlertCircle size={13} />
                        {errors.email}
                      </div>
                    )}
                  </div>

                  {/* Real next steps, not just a toast to remember - the
                      backend already told us exactly which of two things is
                      true (routes/auth.py's email_exists code): either this
                      is genuinely their account (send them to sign in) or
                      they forgot they have one (send them straight into
                      Login's reset flow, email already filled in). */}
                  {emailExistsError && (
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
                          {t('register.accountExists')}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="eco-btn eco-btn-primary"
                          style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }}
                          onClick={() =>
                            navigate('/login', { state: { prefillEmail: form.email.trim() } })
                          }
                        >
                          <LogIn size={14} /> {t('register.signInInstead')}
                        </button>
                        <button
                          type="button"
                          className="eco-btn eco-btn-outline"
                          style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }}
                          onClick={() =>
                            navigate('/login', {
                              state: { prefillEmail: form.email.trim(), openReset: true },
                            })
                          }
                        >
                          <KeyRound size={14} /> {t('login.forgotPassword')}
                        </button>
                      </div>
                    </div>
                  )}
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
                        placeholder={t('register.choosePasswordPlaceholder')}
                        value={form.password}
                        onChange={handleChange}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={(event) => {
                          handleBlur(event);
                          setPasswordFocused(false);
                        }}
                        autoComplete="new-password"
                        autoFocus
                        style={{ paddingRight: '3rem' }}
                      />
                      <label htmlFor="reg-password">
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

                    {/* Strength bar - fills and changes colour as more rules pass */}
                    {form.password && (
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
                        <div
                          className="eco-field-hint"
                          style={{ color: strength.color, fontWeight: 500 }}
                        >
                          {strength.labelKey ? t(strength.labelKey) : ''}
                        </div>
                      </>
                    )}

                    {/* Requirements box - appears when the field is focused (or
                        while it holds text), with a live tick as each rule is met.
                        A plain conditional, not AnimatePresence - that combination
                        (height:0 -> 'auto' -> exit back to 0) turned out to be
                        genuinely broken here: confirmed live that the exit tween
                        reaches its correct end state (height:0, opacity:0 - it
                        LOOKS collapsed) but the node is never actually removed
                        from the DOM afterward, the same "reaches the right style,
                        never truly unmounts" failure BillScanner.jsx's original
                        exit animation had. Dropping AnimatePresence means clearing
                        the field removes this box INSTANTLY (React's normal
                        reconciliation) rather than leaving an invisible stale copy
                        behind every time someone focuses then clears the field. */}
                    {(passwordFocused || form.password) && (
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
                              {t('register.passwordNeeds')}
                            </div>

                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                              {PASSWORD_RULES.map((rule) => {
                                const met = rule.test(form.password);
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
                                      // A hollow circle for a rule not yet met
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
                                    {t(rule.labelKey)}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
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
                        placeholder={t('register.confirmPasswordPlaceholder')}
                        value={form.confirmPassword}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="new-password"
                      />
                      <label htmlFor="reg-confirm">
                        <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        {t('register.confirmPassword')}
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
                      label={t('register.region')}
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
                      {t('register.regionHint')}
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
                      <span className="eco-text-muted">{t('register.reviewName')}</span>
                      <span style={{ fontWeight: 600 }}>{form.name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="eco-text-muted">{t('register.reviewEmail')}</span>
                      <span style={{ fontWeight: 600, wordBreak: 'break-all' }}>{form.email}</span>
                    </div>
                  </div>
                </>
              )}
          </motion.div>

          {/* ---------- Google, on the first step only ---------- */}
          {/* Only on step 1: Google replaces the whole three-step form, so
              offering it beside "Back" halfway through would be confusing -
              and the account would already be half-described by then. */}
          {step === 1 && (
            <>
              {!isNativeApp() && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.8rem',
                    margin: '1.5rem 0 1.2rem',
                  }}
                >
                  <span style={{ flex: 1, height: 1, background: 'var(--eco-border)' }} />
                  <span
                    className="eco-text-muted"
                    style={{ fontSize: '0.74rem', letterSpacing: '0.04em' }}
                  >
                    {t('login.orDivider')}
                  </span>
                  <span style={{ flex: 1, height: 1, background: 'var(--eco-border)' }} />
                </div>
              )}

              <GoogleSignInButton
                label={t('register.signUpWithGoogle')}
                onDone={() => navigate('/dashboard', { replace: true })}
              />

              {!isNativeApp() && (
                <p
                  className="eco-text-muted"
                  style={{ fontSize: '0.74rem', textAlign: 'center', margin: '0.7rem 0 0' }}
                >
                  {t('register.googleNoPassword')}
                </p>
              )}
            </>
          )}

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
                {t('register.back')}
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="eco-btn eco-btn-primary"
                style={{ flex: 1, padding: '0.8rem' }}
              >
                {t('register.continueBtn')}
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
                        // Matches the label beside it. Near-black on the
                        // primary button's dark gradient was invisible.
                        border: '2px solid rgba(255,255,255,0.35)',
                        borderTopColor: '#ffffff',
                        borderRadius: '50%',
                        animation: 'eco-spin 0.8s linear infinite',
                      }}
                    />
                    {t('register.creatingAccount')}
                  </>
                ) : (
                  <>
                    {t('register.createAccount')}
                    <Check size={17} />
                  </>
                )}
              </button>
            )}
          </div>
        </form>

        <RecaptchaNotice />

        <p
          className="eco-text-muted"
          style={{ textAlign: 'center', marginTop: '1.4rem', marginBottom: 0, fontSize: '0.88rem' }}
        >
          {t('register.alreadyHaveAccount')}{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            {t('login.signIn')}
          </Link>
        </p>
        </motion.div>
      </div>
    </div>
  );
}
