// EcoTrack/frontend/src/pages/Donate.jsx
// Public "give to the cause" page - anyone can donate, with or without an account.
//
// WHAT THIS PAGE PROMISES
// Money given here does not stay with EcoTrack. It is forwarded to established
// climate organisations (see PARTNERS below), minus Razorpay's processing fee,
// which is the only deduction. Every claim on this page has to stay true to
// that - if the forwarding ever stops, the copy here has to change with it.
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
import confetti from 'canvas-confetti';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Download,
  Heart,
  HeartHandshake,
  IndianRupee,
  Leaf,
  Loader2,
  Lock,
  Server,
  ShieldCheck,
  TreePine,
  Wind,
} from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS, photoUrl } from '../utils/photos';
import { getErrorCode, getErrorMessage, paymentsApi } from '../utils/api';
import { loadRazorpay } from '../utils/razorpay';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCounter } from '../hooks/useCounter';
import { EMAIL_ERROR, EMAIL_PATTERN } from '../utils/validation';

// These mirror DONATION_MIN_PAISE / DONATION_MAX_PAISE in backend/config.py.
// The server enforces them for real; checking here just means the user finds
// out before a pointless round trip.
const MIN_RUPEES = 1;
const MAX_RUPEES = 100000;

// Suggested amounts, each with what it becomes once forwarded.
//
// The tree figures come from One Tree Planted's own published rate of one tree
// per US$1, converted at roughly ₹88 to the dollar and rounded DOWN so the page
// never over-promises. They are labelled "about" for the same reason - the rate
// moves, and a donation is not a purchase order for an exact number of trees.
const PRESETS = [
  { rupees: 99, impact: 'about 1 tree planted' },
  { rupees: 249, impact: 'about 3 trees' },
  { rupees: 499, impact: 'about 5 trees' },
  { rupees: 999, impact: 'about 11 trees' },
];

// Razorpay Checkout renders in its own iframe, so it cannot read our CSS
// variables - its accent colour has to be a literal hex value.
const CHECKOUT_THEME = '#2f9d5c';

// Razorpay key ids carry their own mode: rzp_test_... or rzp_live_.... So the
// "nothing is really charged" notice can decide for itself whether to appear,
// and switching to live keys removes it with no code change.
//
// Deliberately shows ONLY for a confirmed test key. If the id were missing we
// would not know the mode, and the dangerous direction is telling someone their
// card is safe while it is actually being charged - so an unknown mode says
// nothing rather than guessing "demo".
const IS_TEST_MODE = String(import.meta.env.VITE_RAZORPAY_KEY_ID || '').startsWith('rzp_test_');

// Where the money is forwarded. The same four organisations the home page links
// to directly, so the two pages never tell different stories.
const PARTNERS = [
  {
    name: 'One Tree Planted',
    icon: TreePine,
    focus: 'Reforestation',
    body: 'Plants trees worldwide to restore habitat and pull carbon back out of the air.',
    href: 'https://onetreeplanted.org/products/plant-trees',
  },
  {
    name: 'Cool Earth',
    icon: Leaf,
    focus: 'Rainforest protection',
    body: 'Backs the people who live in rainforests to keep them standing.',
    href: 'https://www.coolearth.org/act-now/ways-to-donate/',
  },
  {
    name: 'Clean Air Task Force',
    icon: Wind,
    focus: 'Cutting emissions',
    body: 'Pushes the clean-energy technology and policy that drives emissions down at scale.',
    href: 'https://www.catf.us/donate/',
  },
  {
    name: 'Gold Standard',
    icon: ShieldCheck,
    focus: 'Verified offsets',
    body: 'Certifies offset projects, so a contribution provably removes greenhouse gases.',
    href: 'https://www.goldstandard.org/donate-to-gold-standard',
  },
];

/**
 * A short, stable receipt number derived from the payment id.
 *
 * Deriving it rather than storing a counter means the same payment always
 * produces the same receipt number, with no extra database write and no risk of
 * two donations racing for the same sequence value.
 */
function receiptNumber(paymentId, when) {
  const tail = String(paymentId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return `ECO-${when.getFullYear()}-${tail || '000000'}`;
}

export default function Donate() {
  const { profile } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [amount, setAmount] = useState(String(PRESETS[0].rupees));
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

  // The amount counts up on the thank-you screen. Declared here, unconditionally,
  // because the thank-you screen returns early - a hook called inside that branch
  // would run on some renders and not others, which React forbids.
  const [amountRef, amountShown] = useCounter(done ? done.amount / 100 : 0, {
    decimals: 0,
    startOnView: false,
  });

  // Pre-fill from the profile when the visitor is already signed in
  useEffect(() => {
    if (profile) {
      setForm((current) => ({
        name: current.name || profile.name || '',
        email: current.email || profile.email || '',
      }));
    }
  }, [profile]);

  // A short burst of confetti the moment a donation is confirmed. Skipped
  // entirely for anyone who asked for reduced motion.
  useEffect(() => {
    if (!done || prefersReducedMotion) return;

    const colours = ['#2f9d5c', '#4fbe80', '#3fb0a8', '#e6a748'];
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.35 }, colors: colours });

    const second = setTimeout(() => {
      confetti({ particleCount: 50, spread: 100, origin: { y: 0.4 }, colors: colours });
    }, 260);

    return () => clearTimeout(second);
  }, [done, prefersReducedMotion]);

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
        ? EMAIL_ERROR
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
        orderId: response.razorpay_order_id,
        amount: order.amount,
        name: form.name.trim(),
        email: form.email.trim(),
        at: new Date(),
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
        description: 'Donation forwarded to climate organisations',
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

  // =========================================================================
  // THANK-YOU + RECEIPT
  //
  // Printing is how the receipt is saved: the browser's own "Save as PDF" makes
  // a perfectly good file and costs no extra library. index.css already turns
  // the page white and hides .eco-no-print, so marking everything except the
  // receipt keeps the printed page to the receipt alone.
  // =========================================================================
  if (done) {
    const rupeesGiven = done.amount / 100;
    const number = receiptNumber(done.paymentId, done.at);

    const receiptRows = [
      ['Receipt no.', number],
      ['Date', done.at.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
      ['Donor', done.name || 'Anonymous'],
      ['Email', done.email || '—'],
      ['Amount', `₹${rupeesGiven.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
      ['Payment ref', done.paymentId],
      ['Order ref', done.orderId],
    ];

    return (
      <div style={{ paddingBottom: '0' }}>
        {/* ---------- the plate, then the confirmation ---------- */}
        {/* This was a full-bleed photograph taken down to 96% black at its
            bottom edge so white type could sit on it, with the amount set in
            mint Space Grotesk. Same treatment as everywhere else now: the
            photograph is left alone and the words go underneath it. */}
        <section className="eco-no-print" style={{ position: 'relative', overflow: 'hidden', height: 'clamp(240px, 34vh, 380px)' }}>
          <img
            src={photoUrl(PHOTOS.ancientTree, 1600)}
            alt="Sunlight bursting through the canopy of a huge old tree with sprawling roots"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </section>

        <div className="container" style={{ maxWidth: 660 }}>
          <div
            className="eco-no-print"
            style={{ marginTop: '1.6rem', paddingTop: '1.1rem', borderTop: '2px solid var(--readout)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.1rem' }}>
              <motion.span
                initial={prefersReducedMotion ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 190, damping: 13 }}
                style={{ display: 'inline-flex', color: 'var(--eco-primary)' }}
              >
                <CheckCircle2 size={22} />
              </motion.span>
              <span className="eco-marker">Verified · donation received</span>
            </div>

            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="eco-display"
              style={{ fontSize: 'clamp(2.2rem, 6vw, 3.6rem)', margin: '0 0 1.2rem' }}
            >
              Thank you, <span className="eco-gradient-text">truly</span>
            </motion.h1>

            {/* the amount counts up rather than just appearing */}
            <motion.div
              ref={amountRef}
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.24 }}
              className="eco-readout"
              style={{
                fontSize: 'clamp(2.6rem, 9vw, 4.2rem)',
                fontWeight: 500,
                lineHeight: 1,
                margin: '0 0 0.4rem',
              }}
            >
              ₹{amountShown}
            </motion.div>
            <div className="eco-marker" style={{ display: 'block', marginBottom: '1.3rem' }}>
              forwarded in full, less the processing fee
            </div>

            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34 }}
              className="eco-text-muted"
              style={{ fontSize: '1rem', lineHeight: 1.7, maxWidth: '54ch', margin: '0 0 2.4rem' }}
            >
              Verified and on its way to the organisations below. Whether it was
              small or large, it is more than most people ever give — and it goes
              to the work, not to us.
            </motion.p>
          </div>

        {/* ---------- the receipt (the only thing that prints) ---------- */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="eco-card"
          style={{ padding: 0, overflow: 'hidden' }}
        >
          <div
            style={{
              padding: '1.1rem 1.4rem',
              borderBottom: '1px dashed var(--eco-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <Leaf size={19} style={{ color: 'var(--eco-primary)' }} />
              <strong className="eco-display" style={{ fontSize: '1rem' }}>
                EcoTrack
              </strong>
            </div>
            <span className="eco-marker" style={{ fontSize: '0.66rem' }}>
              Donation receipt
            </span>
          </div>

          <div style={{ padding: '1.4rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <tbody>
                {receiptRows.map(([label, value]) => (
                  <tr key={label}>
                    <td
                      className="eco-text-muted"
                      style={{ padding: '0.42rem 0', verticalAlign: 'top', whiteSpace: 'nowrap', paddingRight: '1rem' }}
                    >
                      {label}
                    </td>
                    <td style={{ padding: '0.42rem 0', wordBreak: 'break-all', fontWeight: 500 }}>
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p
              className="eco-text-muted"
              style={{
                fontSize: '0.75rem',
                lineHeight: 1.6,
                margin: '1.1rem 0 0',
                paddingTop: '0.9rem',
                borderTop: '1px dashed var(--eco-border)',
              }}
            >
              This is a payment receipt, not a tax-exemption certificate — EcoTrack
              is a student project and is not registered for 80G. Donations are
              forwarded to the organisations listed on this page, less Razorpay&apos;s
              processing fee. Keep this reference for any query about the payment.
            </p>
          </div>
        </motion.div>

        {/* ---------- actions ---------- */}
        <div
          className="eco-no-print"
          style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1.5rem' }}
        >
          <button type="button" className="eco-btn eco-btn-primary" onClick={() => window.print()}>
            <Download size={17} />
            Download receipt
          </button>
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
        </div>

        {/* ---------- where it is going ---------- */}
        {/* Exactly two columns, never auto-fit: there are four partners, and an
            auto-fit track lands on three at some widths, orphaning the fourth on
            a row of its own. Two always divides evenly. */}
        <div className="eco-no-print" style={{ marginTop: '3rem' }}>
          <div className="eco-marker" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Where this goes
          </div>
          <p className="eco-text-muted" style={{ fontSize: '0.88rem', margin: '0 0 1.5rem' }}>
            Forwarded to these four, less Razorpay&apos;s processing fee.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.2rem' }}>
            {PARTNERS.map((partner, index) => {
              const Icon = partner.icon;
              return (
                <motion.a
                  key={partner.name}
                  href={partner.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 + index * 0.08, duration: 0.45 }}
                  style={{
                    display: 'block',
                    paddingTop: '0.85rem',
                    borderTop: '1px solid var(--rule-strong)',
                    color: 'var(--eco-text)',
                  }}
                >
                  <Icon size={18} style={{ color: 'var(--eco-primary)', display: 'block', marginBottom: '0.7rem' }} />
                  <div className="eco-display" style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                    {partner.name}
                  </div>
                  <div className="eco-marker" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.62rem' }}>
                    {partner.focus}
                  </div>
                </motion.a>
              );
            })}
          </div>
        </div>
        </div>

        {/* ---------- closing band: what the money turns into ---------- */}
        <section className="eco-no-print" style={{ marginTop: 'clamp(3rem, 8vw, 5rem)' }}>
          <div style={{ height: 'clamp(220px, 30vh, 320px)', overflow: 'hidden' }}>
            <img
              src={photoUrl(PHOTOS.seedlings, 1400)}
              alt="Rows of young seedlings sprouting from dark soil in a propagation tray"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>

          <div className="container">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55 }}
              style={{
                maxWidth: 620,
                marginTop: '1.2rem',
                paddingTop: '0.9rem',
                borderTop: '1px solid var(--rule-strong)',
              }}
            >
              <h2 className="eco-display" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', margin: '0 0 0.8rem' }}>
                Every old tree started exactly like this
              </h2>
              <p className="eco-text-muted" style={{ fontSize: '0.98rem', lineHeight: 1.7, margin: 0 }}>
                Nothing about climate change is solved in one payment. But forests
                are still the cheapest carbon capture we have, and they only exist
                because somebody funded the first year of them. Today that was you.
              </p>
            </motion.div>
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // MAIN PAGE
  // =========================================================================
  return (
    <div style={{ paddingBottom: '4rem' }}>
      {/* ---------- hero: the plate, then what it is for ---------- */}
      {/* The photograph carried the whole hero on top of it under a wash that
          reached 92% black at the bottom edge - the same scrim removed from
          Home, Learn and Gallery. The plate stands on its own and the headline
          ranges left underneath it, off the calibration rail's spine. */}
      <section style={{ overflow: 'hidden', height: 'clamp(260px, 38vh, 420px)' }}>
        <img
          src={photoUrl(PHOTOS.forestWater, 1600)}
          alt="Aerial view of dense forest meeting bright turquoise water"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </section>

      <div className="container" style={{ marginTop: '1.6rem', marginBottom: 'clamp(2.5rem, 6vw, 3.5rem)' }}>
        <div style={{ maxWidth: 940 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              flexWrap: 'wrap',
              marginBottom: '1.8rem',
            }}
          >
            <HeartHandshake size={16} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
            <span className="eco-marker">EcoTrack keeps</span>
            <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
              ₹0
            </span>
            <span className="eco-marker" style={{ opacity: 0.6 }}>of what you give</span>
            <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
          </div>

          <h1
            className="eco-display"
            style={{ fontSize: 'clamp(2.4rem, 7vw, 4.6rem)', margin: '0 0 1.3rem' }}
          >
            It doesn&apos;t stay with us.{' '}
            <span className="eco-gradient-text">It goes to the forests.</span>
          </h1>

          <p
            className="eco-text-muted"
            style={{ fontSize: 'clamp(1rem, 2.2vw, 1.15rem)', lineHeight: 1.7, maxWidth: '54ch', margin: 0 }}
          >
            EcoTrack keeps nothing from what you give here. Every donation is
            forwarded to established climate organisations that plant trees,
            protect rainforest and cut greenhouse gases at scale.
          </p>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 1000 }}>
        {/* one quiet line - while test keys are in use, the page must not let
            anyone believe they have really donated. Disappears by itself once
            live keys are in (see IS_TEST_MODE). */}
        {IS_TEST_MODE && (
          <p
            className="eco-text-muted"
            style={{
              fontSize: '0.78rem',
              textAlign: 'center',
              margin: '0 0 1.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
            }}
          >
            <Lock size={12} style={{ flexShrink: 0 }} />
            Demonstration mode — Razorpay test keys, so nothing is actually charged.
            Pay via Netbanking (any bank → Success) or UPI id{' '}
            <code style={{ fontSize: '0.75rem' }}>success@razorpay</code>.
          </p>
        )}

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
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          {/* ---------- why: the picture and the plain facts ---------- */}
          <motion.aside
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            // The prose loses its card; the form beside it keeps one, because a
            // form is a control surface and this is an argument.
            style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
          >
            <div
              className="eco-photo-zoom"
              style={{
                overflow: 'hidden',
                borderRadius: 'var(--eco-radius-sm)',
                aspectRatio: '16 / 9',
                marginBottom: '1.2rem',
              }}
            >
              <Photo
                id={PHOTOS.planetB}
                alt="A crowd at a climate march holding a sign reading There Is No Planet B"
                width={720}
                className="eco-photo-cover"
                style={{ width: '100%', height: '100%', display: 'block' }}
              />
            </div>

            <h2 className="eco-display" style={{ fontSize: '1.35rem', margin: '0 0 0.6rem' }}>
              Measuring is not enough
            </h2>
            <p className="eco-text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.7, marginBottom: '1.6rem' }}>
              EcoTrack can show you your footprint, and shrinking it matters. But
              the atmosphere does not care about intentions — it responds to
              carbon that stops being emitted and carbon that gets pulled back
              down. That takes forests standing and money reaching the people
              doing the work.
            </p>

            {/* Was a tinted, bordered, rounded callout - a green box on a green
                tint. It is the single most important claim on the page, so it
                is set as a pull quote on a rule instead. */}
            <div style={{ paddingLeft: '0.9rem', borderLeft: '2px solid var(--eco-primary)' }}>
              <div className="eco-display" style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>
                Where your money actually goes
              </div>
              <p className="eco-text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.65, margin: 0 }}>
                Forwarded in full to the four organisations below. Razorpay&apos;s
                processing fee (roughly 2%) is the only deduction, and EcoTrack
                takes nothing for itself.
              </p>
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
            <h2 className="eco-display" style={{ fontSize: '1.3rem', margin: '0 0 1.2rem' }}>
              Choose an amount
            </h2>

            {/* preset amounts, each showing what it becomes */}
            <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1.2rem' }}>
              {PRESETS.map((preset) => {
                const active = amount.trim() === String(preset.rupees);
                return (
                  <button
                    key={preset.rupees}
                    type="button"
                    onClick={() => setAmount(String(preset.rupees))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem',
                      padding: '0.8rem 1rem',
                      borderRadius: 'var(--eco-radius-sm)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      border: active
                        ? '1px solid rgba(var(--eco-primary-rgb), 0.65)'
                        : '1px solid var(--rule)',
                      background: active ? 'rgba(var(--eco-primary-rgb), 0.1)' : 'transparent',
                      color: 'var(--eco-text)',
                      transition: 'background-color 0.18s ease, border-color 0.18s ease',
                    }}
                  >
                    {/* An amount is a quantity, so it is a mono amber readout -
                        it was bold Space Grotesk that turned green when
                        selected, which put the figure in the colour of the
                        thing it pays for. */}
                    <span
                      className="eco-readout"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.1rem',
                        fontWeight: 500,
                        fontSize: '1.1rem',
                      }}
                    >
                      <IndianRupee size={14} />
                      {preset.rupees}
                    </span>
                    <span className="eco-text-muted" style={{ fontSize: '0.8rem' }}>
                      {preset.impact}
                    </span>
                  </button>
                );
              })}
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
                <label htmlFor="donate-amount">Or enter your own amount (₹)</label>
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
                <label htmlFor="donate-email">Email (optional, shown on your receipt)</label>
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
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.85rem' }}
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
                  Give {errors.amount ? '' : `₹${rupees.toLocaleString('en-IN')}`}
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
                fontSize: '0.76rem',
                margin: '0.9rem 0 0',
                textAlign: 'center',
              }}
            >
              <Lock size={12} style={{ flexShrink: 0 }} />
              Card details go straight to Razorpay — EcoTrack never sees them.
            </p>
          </motion.form>
        </div>

        {/* ---------- the partners ---------- */}
        <div style={{ marginTop: 'clamp(3rem, 7vw, 4.5rem)' }}>
          <div style={{ maxWidth: 620, marginBottom: '2.2rem' }}>
            <div className="eco-marker" style={{ display: 'block', marginBottom: '1.1rem' }}>
              Four organisations
            </div>
            <h2
              className="eco-display"
              style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', margin: '0 0 0.9rem' }}
            >
              Who <span className="eco-gradient-text">receives</span> it
            </h2>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.65 }}>
              Four established organisations, each with a different lever on the
              same problem. You can also give to any of them directly — the links
              below go to their own donation pages.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: '1.3rem' }}>
            {PARTNERS.map((partner, index) => {
              const Icon = partner.icon;
              return (
                <motion.a
                  key={partner.name}
                  href={partner.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, delay: index * 0.07 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    paddingTop: '1.05rem',
                    borderTop: '1px solid var(--rule-strong)',
                    color: 'var(--eco-text)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      marginBottom: '0.9rem',
                    }}
                  >
                    <Icon size={19} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
                    <span className="eco-marker">{partner.focus}</span>
                  </div>
                  <h3 className="eco-display" style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.45rem' }}>
                    {partner.name}
                  </h3>
                  <p className="eco-text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.6, margin: '0 0 0.9rem' }}>
                    {partner.body}
                  </p>
                  <span
                    style={{
                      marginTop: 'auto',
                      fontSize: '0.8rem',
                      color: 'var(--eco-primary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    Their own page
                    <ArrowUpRight size={14} />
                  </span>
                </motion.a>
              );
            })}
          </div>

          <p
            className="eco-text-muted"
            style={{
              fontSize: '0.78rem',
              lineHeight: 1.6,
              maxWidth: 640,
              margin: '1.8rem 0 0',
              paddingTop: '0.9rem',
              borderTop: '1px solid var(--rule)',
            }}
          >
            Tree figures are indicative, based on One Tree Planted&apos;s published
            rate of one tree per US$1 and rounded down. A donation funds the work,
            not a guaranteed count of trees.
          </p>
        </div>

        {/* ---------- what it protects ---------- */}
        {/* Third scrimmed photograph on this page, and the last to go. It was a
            90%-black wash from the left so a white headline could sit over a
            misty lake; the plate and the words now sit side by side instead of
            one on top of the other. */}
        <div
          style={{
            marginTop: 'clamp(3rem, 7vw, 4.5rem)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'clamp(1.5rem, 4vw, 3rem)',
            alignItems: 'center',
          }}
        >
          <div
            className="eco-photo-zoom"
            style={{ overflow: 'hidden', borderRadius: 'var(--eco-radius-sm)', aspectRatio: '4 / 3' }}
          >
            <img
              src={photoUrl(PHOTOS.forestLake, 1400)}
              alt="Still lake surrounded by tall pine forest with mist over the mountains"
              className="eco-photo-cover"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>

          <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
            <h2 className="eco-display" style={{ fontSize: 'clamp(1.5rem, 3.6vw, 2.2rem)', margin: '0 0 0.8rem' }}>
              Forests are the cheapest carbon capture we have
            </h2>
            <p className="eco-text-muted" style={{ fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
              No machine removes carbon as cheaply as a tree that is already
              growing. Keeping existing forest standing, and putting new trees in
              the ground, remains one of the most effective things money can do
              about greenhouse gases right now.
            </p>
          </div>
        </div>

        {/* ---------- how the payment stays safe ---------- */}
        <div style={{ marginTop: 'clamp(3rem, 7vw, 4.5rem)' }}>
          <div className="eco-marker" style={{ display: 'block', marginBottom: '1.1rem' }}>
            Three steps, server-verified
          </div>
          <h2
            className="eco-display"
            style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', margin: '0 0 2rem' }}
          >
            How a donation stays <span className="eco-gradient-text">safe</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.3rem' }}>
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
                  // Numbered, and the order is the security argument: the order
                  // is opened server-side, the card is typed into Razorpay, the
                  // signature is checked. Each step only means anything after
                  // the one before it.
                  style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem',
                      marginBottom: '1.1rem',
                    }}
                  >
                    <span className="eco-readout" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      {card.step}
                    </span>
                    <Icon size={19} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
                  </div>
                  <h3 className="eco-display" style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {card.title}
                  </h3>
                  <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                    {card.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
