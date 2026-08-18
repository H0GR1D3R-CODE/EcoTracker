// EcoTrack/frontend/src/pages/VerifyTwoFactor.jsx
// The second step of signing in to an account with two-step verification on.
//
// Reached only through AuthContext's own gate: login()/loginWithGoogle() set
// twoFactorPending when the backend withholds the profile, and both Login and
// ProtectedRoute redirect here while it is true. There is no direct path in -
// landing here with nothing pending just sends you back to /login.

import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowRight, KeyRound, Leaf, LogOut, Mail } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyTwoFactor() {
  const { user, loading, twoFactorPending, twoFactorEmail, verifyTwoFactorCode, resendTwoFactorCode, cancelTwoFactor } =
    useAuth();
  const { prefersReducedMotion } = useTheme();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef(null);

  // Focus the code field the moment this screen is actually shown, not on
  // every render - autoFocus alone fights the page transition's own timing.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cooldown ticks down once a second while positive, so "Resend" cannot be
  // hammered into repeatedly asking the backend for a fresh code.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Nothing pending and nothing to check - either this was reached directly,
  // or verification already finished elsewhere. Do not show a dead-end form.
  if (!loading && (!user || !twoFactorPending)) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (code.length !== CODE_LENGTH || submitting) return;

    setSubmitting(true);
    try {
      const profile = await verifyTwoFactorCode(code);
      navigate(profile?.isAdmin ? '/admin' : '/dashboard', { replace: true });
    } catch (error) {
      toast.error(error.message);
      setCode('');
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      const sent = await resendTwoFactorCode();
      toast.success(sent ? 'A new code is on its way.' : 'Continuing without a code this time.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelTwoFactor();
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.message);
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
      }}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="eco-card"
        style={{ width: '100%', maxWidth: 440, padding: '2.2rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.6rem' }}>
          <Leaf size={16} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
          <span className="eco-marker">EcoTrack</span>
          <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
            TWO-STEP VERIFICATION
          </span>
        </div>

        <KeyRound size={22} style={{ color: 'var(--eco-primary)', display: 'block', marginBottom: '0.9rem' }} />
        <h1 className="eco-display" style={{ fontSize: 'clamp(1.6rem, 4vw, 2rem)', margin: '0 0 0.7rem' }}>
          Enter your code
        </h1>
        <p className="eco-text-muted" style={{ margin: '0 0 1.8rem', lineHeight: 1.6, fontSize: '0.94rem' }}>
          {twoFactorEmail ? (
            <>
              We sent a 6-digit code to <strong style={{ color: 'var(--eco-text)' }}>{twoFactorEmail}</strong>.
              It expires in 10 minutes.
            </>
          ) : (
            'We sent a 6-digit code to your email. It expires in 10 minutes.'
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            disabled={submitting}
            placeholder="000000"
            aria-label="6-digit verification code"
            className="eco-readout"
            style={{
              width: '100%',
              padding: '0.9rem',
              fontSize: '1.9rem',
              fontWeight: 500,
              textAlign: 'center',
              letterSpacing: '0.35em',
              background: 'var(--eco-bg-alt)',
              border: '1px solid var(--eco-border)',
              borderRadius: 'var(--eco-radius-sm)',
              color: 'var(--readout)',
            }}
          />

          <button
            type="submit"
            className="eco-btn eco-btn-primary"
            style={{ width: '100%', marginTop: '1.3rem', padding: '0.85rem' }}
            disabled={code.length !== CODE_LENGTH || submitting}
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
                Verifying…
              </>
            ) : (
              <>
                Verify and continue
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.8rem',
            marginTop: '1.6rem',
            paddingTop: '1.1rem',
            borderTop: '1px solid var(--rule)',
          }}
        >
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: cooldown > 0 ? 'default' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: cooldown > 0 ? 'var(--eco-text-muted)' : 'var(--eco-primary)',
            }}
          >
            <Mail size={14} />
            {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: 'var(--eco-text-muted)',
            }}
          >
            <LogOut size={14} />
            Cancel and sign out
          </button>
        </div>
      </motion.div>
    </div>
  );
}
