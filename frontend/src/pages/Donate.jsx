// EcoTrack/frontend/src/pages/Donate.jsx
// Public "Support EcoTrack" page - anyone can donate, with or without an account.
//
// THE THREE-STEP PAYMENT FLOW (the part worth explaining in the viva)
//   1. This page asks OUR server to open a Razorpay order  (POST /api/create-order)
//   2. Razorpay Checkout opens in its own secure overlay and takes the payment.
//      Card details are typed into Razorpay's window, never into EcoTrack - so
//      no card number ever touches this app or its server.
//   3. Checkout hands back a signature, which OUR server re-computes with the
//      secret key before the donation counts  (POST /api/verify-payment)
//
// Step 3 is what makes step 2 trustworthy: the browser could lie about having
// paid, but it cannot forge an HMAC signed with a secret it has never seen.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Heart,
  HeartHandshake,
  IndianRupee,
  Info,
  Leaf,
  Loader2,
  Lock,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import Photo from '../components/Photo';
import AuroraBackground from '../components/AuroraBackground';
import { PHOTOS } from '../utils/photos';
import { getErrorCode, getErrorMessage, paymentsApi } from '../utils/api';
import { loadRazorpay } from '../utils/razorpay';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// These mirror DONATION_MIN_PAISE / DONATION_MAX_PAISE in backend/config.py.
// The server enforces them for real; checking here just means the user finds
// out before a pointless round trip.
const MIN_RUPEES = 1;
const MAX_RUPEES = 100000;

// Suggested amounts. Deliberately small - this is a student project, and the
// running costs it covers are measured in rupees, not thousands.
const PRESETS = [49, 99, 249, 499];

// Razorpay Checkout renders in its own iframe, so it cannot read our CSS
// variables - its accent colour has to be a literal hex value.
const CHECKOUT_THEME = '#2f9d5c';

// What the money actually pays for. Honest and specific beats vague gratitude.
const USES = [
  {
    icon: Server,
    title: 'Hosting and servers',
    body: 'The API, the database and the site itself. Support keeps EcoTrack free to use and free of ads.',
  },
  {
    icon: Leaf,
    title: 'Keeping the science current',
    body: 'Emission factors move. Every DEFRA and IPCC revision has to be checked and folded back in.',
  },
  {
    icon: Sparkles,
    title: 'Building what is next',
    body: 'More categories, sharper reports, better guidance — the roadmap people keep asking for.',
  },
];

export default function Donate() {
  const { profile } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [amount, setAmount] = useState(String(PRESETS[1]));
  const [form, setForm] = useState({ name: '', email: '' });
  const [touched, setTouched] = useState({});

  // null | 'creating' | 'checkout' | 'verifying' - drives the button label and
  // stops a second submit while Razorpay's overlay is already open.
  const [stage, setStage] = useState(null);

  // Set when the server reports it has no Razorpay keys, so the page can say so
  // plainly instead of leaving the button looking broken.
  const [unavailable, setUnavailable] = useState(false);

  // The verified donation, once one has gone through.
  const [done, setDone] = useState(null);

  // Pre-fill from the profile when the visitor is already signed in
  useEffect(() => {
    if (profile) {
      setForm((current) => ({
        name: current.name || profile.name || '',
        email: current.email || profile.email || '',
      }));
    }
  }, [profile]);

  const rupees = Number(amount);

  const errors = {
    amount: !amount.trim()
      ? 'Choose or enter an amount.'
      : !Number.isFinite(rupees)
        ? 'That is not a valid amount.'
        : rupees < MIN_RUPEES
          ? `The smallest donation is ₹${MIN_RUPEES}.`
          : rupees > MAX_RUPEES
            ? `Please keep it under ₹${MAX_RUPEES.toLocaleString('en-IN')}.`
            : null,
    // Optional, but must look like an address if it is given
    email:
      form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())
        ? 'That email address does not look valid.'
        : null,
  };

  const isValid = !errors.amount && !errors.email;
  const busy = stage !== null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  // -------------------------------------------------------------------------
  // Step 3: hand the signed confirmation back to our server to be verified.
  // Called by Razorpay once a payment succeeds.
  // -------------------------------------------------------------------------
  const verify = async (response, order) => {
    setStage('verifying');
    try {
      const result = await paymentsApi.verifyPayment({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
        // Recorded alongside the donation; the server treats these as details,
        // never as proof - only the signature decides whether this counts.
        amount: order.amount,
        currency: order.currency,
        name: form.name.trim(),
        email: form.email.trim(),
      });

      setDone({
        paymentId: response.razorpay_payment_id,
        amount: order.amount,
      });
      toast.success(result?.message || 'Payment verified. Thank you!');
    } catch (error) {
      // The money may well have left their account, so never imply it did not.
      toast.error(
        getErrorMessage(error, 'We could not confirm that payment. Please contact us before retrying.')
      );
    } finally {
      setStage(null);
    }
  };

  // -------------------------------------------------------------------------
  // Steps 1 and 2: open an order, then hand it to Razorpay Checkout.
  // -------------------------------------------------------------------------
  const handleDonate = async (event) => {
    event.preventDefault();
    setTouched({ amount: true, email: true });
    if (!isValid || busy) return;

    setStage('creating');
    try {
      // Fetch the checkout script and open the order together - neither one
      // needs the other, so there is no reason to wait twice.
      const [Razorpay, order] = await Promise.all([
        loadRazorpay(),
        paymentsApi.createOrder({
          // Razorpay counts in paise, so ₹99 is 9900
          amount: Math.round(rupees * 100),
          currency: 'INR',
        }),
      ]);

      setStage('checkout');

      const checkout = new Razorpay({
        // The server returns the public key_id, so the frontend build does not
        // have to hard-code it. The env var is only a fallback.
        key: order.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: 'EcoTrack',
        description: 'Supporting EcoTrack · SDG 13 Climate Action',
        prefill: { name: form.name.trim(), email: form.email.trim() },
        theme: { color: CHECKOUT_THEME },
        handler: (response) => verify(response, order),
        modal: {
          // They closed the overlay without paying - just release the button.
          ondismiss: () => setStage(null),
        },
      });

      // Razorpay reports a declined card through this event rather than by
      // rejecting anything, so it needs its own listener.
      checkout.on('payment.failed', (event_) => {
        setStage(null);
        toast.error(event_?.error?.description || 'The payment did not go through.');
      });

      checkout.open();
    } catch (error) {
      setStage(null);

      // The server has no Razorpay keys configured. Say that in the page rather
      // than as a toast that fades away.
      if (getErrorCode(error) === 'razorpay_unconfigured') {
        setUnavailable(true);
        return;
      }

      toast.error(getErrorMessage(error, 'Could not start the payment. Please try again.'));
    }
  };

  // ---------- thank-you state ----------
  if (done) {
    return (
      <div
        className="container"
        style={{ paddingTop: '4rem', paddingBottom: '4rem', maxWidth: 520, textAlign: 'center' }}
      >
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="eco-card"
        >
          <motion.div
            initial={prefersReducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
            style={{ display: 'inline-flex' }}
          >
            <CheckCircle2 size={48} style={{ color: 'var(--eco-primary)' }} />
          </motion.div>

          <h1 style={{ fontSize: '1.5rem', marginTop: '1rem', marginBottom: '0.6rem' }}>
            Thank you
          </h1>
          <p className="eco-text-muted" style={{ marginBottom: '1.2rem' }}>
            Your donation of{' '}
            <strong style={{ color: 'var(--eco-primary)' }}>
              ₹{(done.amount / 100).toLocaleString('en-IN')}
            </strong>{' '}
            went through and was verified. It genuinely keeps EcoTrack running.
          </p>

          {/* The payment id is their receipt - worth showing, and worth being
              able to copy out of the page if they ever need to quote it. */}
          <div
            style={{
              padding: '0.7rem 0.9rem',
              borderRadius: 10,
              border: '1px solid var(--eco-border)',
              background: 'rgba(var(--eco-primary-rgb), 0.06)',
              marginBottom: '1.5rem',
            }}
          >
            <div className="eco-text-muted" style={{ fontSize: '0.72rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Payment reference
            </div>
            <code style={{ fontSize: '0.84rem', wordBreak: 'break-all' }}>{done.paymentId}</code>
          </div>

          <button
            type="button"
            className="eco-btn eco-btn-ghost"
            onClick={() => {
              setDone(null);
              setTouched({});
            }}
          >
            <Heart size={16} />
            Give again
          </button>
        </motion.div>
      </div>
    );
  }

  // ---------- main page ----------
  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: 960 }}>
      {/* hero */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
          marginBottom: '2rem',
          padding: 'clamp(2rem, 6vw, 3.6rem) 1rem',
          borderRadius: 'var(--eco-radius)',
        }}
      >
        <AuroraBackground opacity={0.3} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="eco-badge" style={{ marginBottom: '1rem' }}>
            <HeartHandshake size={14} style={{ color: 'var(--eco-primary)' }} />
            Support
          </span>
          <h1 style={{ fontSize: 'clamp(2.3rem, 6.5vw, 3.8rem)', lineHeight: 1.04, marginBottom: '0.9rem' }}>
            Help keep EcoTrack <span className="eco-gradient-text">free</span>
          </h1>
          <p className="eco-text-muted" style={{ margin: '0 auto', fontSize: '1.1rem', maxWidth: 540 }}>
            No ads, no paywall, no selling your data. Just running costs — and
            anything you give goes straight at them.
          </p>
        </div>
      </div>

      {/* test-mode notice: this deployment uses Razorpay TEST keys, so it would
          be dishonest to let the page imply real money is changing hands. */}
      <div
        style={{
          display: 'flex',
          gap: '0.7rem',
          alignItems: 'flex-start',
          padding: '0.85rem 1rem',
          borderRadius: 'var(--eco-radius-sm)',
          border: '1px solid rgba(var(--eco-primary-rgb), 0.3)',
          background: 'rgba(var(--eco-primary-rgb), 0.07)',
          marginBottom: '1.5rem',
        }}
      >
        <Info size={17} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.86rem', lineHeight: 1.6 }}>
          <strong>Demonstration mode.</strong> EcoTrack runs on Razorpay&apos;s test
          keys, so <strong>no real money moves</strong> and no card is ever charged.
          To try the full flow, pay with the test card{' '}
          <code style={{ fontSize: '0.82rem' }}>4111 1111 1111 1111</code> — any
          future expiry date, any CVV.
        </div>
      </div>

      {/* the server has no keys configured */}
      {unavailable && (
        <div
          style={{
            display: 'flex',
            gap: '0.7rem',
            alignItems: 'flex-start',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--eco-radius-sm)',
            border: '1px solid rgba(226, 100, 90, 0.35)',
            background: 'rgba(226, 100, 90, 0.08)',
            marginBottom: '1.5rem',
          }}
        >
          <AlertCircle size={17} style={{ color: 'var(--eco-danger)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.86rem', lineHeight: 1.6 }}>
            <strong>Donations are not set up on this server yet.</strong> Nothing
            was charged. If you are running EcoTrack yourself, add{' '}
            <code style={{ fontSize: '0.82rem' }}>RAZORPAY_KEY_ID</code> and{' '}
            <code style={{ fontSize: '0.82rem' }}>RAZORPAY_KEY_SECRET</code> to the
            backend environment.
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* ---------- what it pays for ---------- */}
        <motion.aside
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="eco-card"
          style={{ padding: 0, overflow: 'hidden' }}
        >
          <div className="eco-photo-zoom" style={{ height: 150, overflow: 'hidden' }}>
            <Photo
              id={PHOTOS.supportSoil}
              alt="A garden trowel scooping dark, rich potting soil"
              width={640}
              className="eco-photo-cover"
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>

          <div style={{ padding: '1.4rem' }}>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '0.4rem' }}>Where it goes</h2>
            <p className="eco-text-muted" style={{ fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1.3rem' }}>
              EcoTrack is a student project with real running costs. Every rupee
              covers one of these three things — nothing else.
            </p>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {USES.map((use) => {
                const Icon = use.icon;
                return (
                  <div key={use.title} style={{ display: 'flex', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(var(--eco-primary-rgb), 0.14)',
                        color: 'var(--eco-primary)',
                      }}
                    >
                      <Icon size={17} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{use.title}</div>
                      <div className="eco-text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                        {use.body}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.aside>

        {/* ---------- the donation form ---------- */}
        <motion.form
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="eco-card eco-form"
          onSubmit={handleDonate}
          noValidate
        >
          {/* preset amounts */}
          <div style={{ marginBottom: '1.1rem' }}>
            <label className="eco-text-muted" style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.55rem' }}>
              Choose an amount
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {PRESETS.map((preset) => {
                const active = amount.trim() === String(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      padding: '0.45rem 0.95rem',
                      borderRadius: 999,
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: active
                        ? '1px solid rgba(var(--eco-primary-rgb), 0.6)'
                        : '1px solid var(--eco-border)',
                      background: active ? 'rgba(var(--eco-primary-rgb), 0.12)' : 'transparent',
                      color: active ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    <IndianRupee size={13} />
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* custom amount */}
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="number"
                id="donate-amount"
                name="amount"
                inputMode="decimal"
                min={MIN_RUPEES}
                max={MAX_RUPEES}
                step="1"
                className={`form-control ${touched.amount && errors.amount ? 'is-invalid' : ''}`}
                placeholder="Amount in rupees"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, amount: true }))}
              />
              <label htmlFor="donate-amount">Amount (₹)</label>
            </div>
            {touched.amount && errors.amount && (
              <div className="eco-field-error">
                <AlertCircle size={13} />
                {errors.amount}
              </div>
            )}
          </div>

          {/* name (optional) */}
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="text"
                id="donate-name"
                name="name"
                className="form-control"
                placeholder="Your name"
                value={form.name}
                onChange={handleChange}
              />
              <label htmlFor="donate-name">Name (optional)</label>
            </div>
          </div>

          {/* email (optional) */}
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="email"
                id="donate-email"
                name="email"
                className={`form-control ${touched.email && errors.email ? 'is-invalid' : ''}`}
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              />
              <label htmlFor="donate-email">Email (optional, for the receipt)</label>
            </div>
            {touched.email && errors.email && (
              <div className="eco-field-error">
                <AlertCircle size={13} />
                {errors.email}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="eco-btn eco-btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={busy || !isValid || unavailable}
          >
            {busy ? (
              <>
                <Loader2 size={17} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                {stage === 'creating' && 'Opening secure checkout…'}
                {stage === 'checkout' && 'Waiting for payment…'}
                {stage === 'verifying' && 'Verifying payment…'}
              </>
            ) : (
              <>
                <Heart size={17} />
                Donate {errors.amount ? '' : `₹${rupees.toLocaleString('en-IN')}`}
              </>
            )}
          </button>

          <p
            className="eco-text-muted"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              fontSize: '0.78rem',
              margin: '0.9rem 0 0',
              textAlign: 'center',
            }}
          >
            <Lock size={13} style={{ flexShrink: 0 }} />
            Card details go straight to Razorpay — EcoTrack never sees them.
          </p>
        </motion.form>
      </div>

      {/* ---------- how the payment stays safe ---------- */}
      <div style={{ marginTop: 'clamp(2.5rem, 6vw, 4rem)' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.5rem, 3.4vw, 2.1rem)', marginBottom: '1.8rem' }}>
          How a donation stays <span className="eco-gradient-text">safe</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.1rem' }}>
          {[
            {
              icon: Server,
              step: '01',
              title: 'The server opens the order',
              body: 'EcoTrack asks Razorpay for an order using a secret key held only on the server.',
            },
            {
              icon: CreditCard,
              step: '02',
              title: 'Razorpay takes the payment',
              body: 'Payment happens inside Razorpay’s own window. No card number reaches EcoTrack.',
            },
            {
              icon: ShieldCheck,
              step: '03',
              title: 'The signature is checked',
              body: 'The server re-computes Razorpay’s signature. Only a match counts as a real donation.',
            },
          ].map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.step}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={prefersReducedMotion ? {} : { y: -5 }}
                className="eco-card eco-card-hover"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.8rem' }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(8,168,105,0.18), rgba(14,121,207,0.18))',
                      color: 'var(--eco-primary)',
                    }}
                  >
                    <Icon size={19} />
                  </div>
                  <span
                    style={{
                      fontFamily: 'Space Grotesk, sans-serif',
                      fontWeight: 700,
                      fontSize: '1.6rem',
                      color: 'var(--eco-primary)',
                      opacity: 0.35,
                    }}
                  >
                    {card.step}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>{card.title}</h3>
                <p className="eco-text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.55, margin: 0 }}>
                  {card.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
