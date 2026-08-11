// EcoTrack/frontend/src/pages/Feedback.jsx
// Public feedback page. Anyone can send feedback without an account; it posts to
// POST /api/feedback, which validates and stores it in Firestore.
//
// The page is built as two columns: an info panel that explains what happens to
// a message, and the form itself. Signed-in visitors get their name and email
// pre-filled, but the form works fully for a logged-out visitor too.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  Heart,
  Lightbulb,
  Loader2,
  MessageSquare,
  Send,
  Star,
  UserCheck,
  Wrench,
} from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { feedbackApi, getErrorMessage } from '../utils/api';
import { EMAIL_ERROR, EMAIL_PATTERN } from '../utils/validation';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const MAX_MESSAGE = 2000;

// What the feedback is about. Selecting one tags the message so the admin can
// triage at a glance; it is optional and defaults to a general note.
const TOPICS = [
  { label: 'General', icon: MessageSquare },
  { label: 'Bug report', icon: Bug },
  { label: 'Feature idea', icon: Lightbulb },
  { label: 'Compliment', icon: Heart },
];

// Word shown under the stars for the current rating (index = number of stars).
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

// The reassurance points in the left-hand panel.
const POINTS = [
  {
    icon: UserCheck,
    title: 'No account needed',
    body: "Sign-in isn't required — leave a name and email only if you'd like a reply.",
  },
  {
    icon: Wrench,
    title: 'Bugs get fixed',
    body: 'A clear bug report is the single fastest way to make EcoTrack better for everyone.',
  },
  {
    icon: Lightbulb,
    title: 'Ideas shape what is next',
    body: 'The features people ask for most are the ones that get built first.',
  },
];

export default function Feedback() {
  const { profile } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [topic, setTopic] = useState('General');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [touched, setTouched] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Pre-fill from the profile if the visitor is already signed in
  useEffect(() => {
    if (profile) {
      setForm((current) => ({
        ...current,
        name: current.name || profile.name || '',
        email: current.email || profile.email || '',
      }));
    }
  }, [profile]);

  const errors = {
    message: !form.message.trim()
      ? 'Please write your feedback.'
      : form.message.trim().length < 3
        ? 'A little more detail, please.'
        : form.message.trim().length > MAX_MESSAGE
          ? `Please keep it under ${MAX_MESSAGE} characters.`
          : null,
    // Email is optional, but if given it must be valid
    email: form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())
      ? EMAIL_ERROR
      : null,
  };

  const isValid = !errors.message && !errors.email;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched({ message: true, email: true });
    if (!isValid || sending) return;

    setSending(true);
    try {
      // Tag the message with the chosen topic so it can be triaged, unless it is
      // just a general note.
      const prefix = topic && topic !== 'General' ? `[${topic}] ` : '';

      await feedbackApi.submit({
        name: form.name.trim(),
        email: form.email.trim(),
        message: prefix + form.message.trim(),
        rating: rating || undefined,
      });
      setSent(true);
      toast.success('Thank you for your feedback!');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not send your feedback. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  // ---------- thank-you state ----------
  if (sent) {
    return (
      <div
        className="container"
        style={{ paddingTop: '5rem', paddingBottom: '5rem', maxWidth: 620 }}
      >
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          // A channel under an amber rule, like the readout panel on Estimate:
          // this is the instrument confirming it registered something.
          style={{ paddingTop: '1.1rem', borderTop: '2px solid var(--readout)' }}
        >
          <motion.div
            initial={prefersReducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
            style={{ display: 'inline-flex', marginBottom: '1.2rem' }}
          >
            <CheckCircle2 size={34} style={{ color: 'var(--eco-primary)' }} />
          </motion.div>
          <span className="eco-marker" style={{ display: 'block', marginBottom: '0.7rem' }}>
            Received
          </span>
          <h1 className="eco-display" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: '0 0 0.9rem' }}>
            Thank you
          </h1>
          <p className="eco-text-muted" style={{ marginBottom: '1.8rem', maxWidth: '48ch' }}>
            Your feedback has been received. It genuinely helps make EcoTrack better.
          </p>
          <button
            type="button"
            className="eco-btn eco-btn-ghost"
            onClick={() => {
              // Let them send another without a page reload
              setSent(false);
              setForm((c) => ({ ...c, message: '' }));
              setRating(0);
              setTopic('General');
              setTouched({});
            }}
          >
            Send more feedback
          </button>
        </motion.div>
      </div>
    );
  }

  const shownRating = hoverRating || rating;

  // ---------- form ----------
  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: 960 }}>
      {/* hero. The aurora wash, the badge pill and the centred column are gone
          - the same three dark-page devices removed from every other public
          page. Ranged left off the calibration rail's spine. */}
      <div style={{ marginBottom: 'clamp(2.5rem, 6vw, 3.5rem)', maxWidth: 940 }}>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            flexWrap: 'wrap',
            marginBottom: '2rem',
          }}
        >
          <span className="eco-marker">Feedback</span>
          <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
            NO ACCOUNT NEEDED
          </span>
          <span className="eco-marker" style={{ opacity: 0.6 }}>read by a person</span>
          <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
        </motion.div>

        <h1
          className="eco-display"
          style={{ fontSize: 'clamp(2.4rem, 7.5vw, 4.6rem)', margin: '0 0 1.3rem' }}
        >
          Tell us what you <span className="eco-gradient-text">think</span>
        </h1>
        <p
          className="eco-text-muted"
          style={{ fontSize: 'clamp(1rem, 2.2vw, 1.15rem)', maxWidth: '54ch', margin: 0 }}
        >
          Found a bug, want a feature, or just have a thought? We read everything.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* ---------- info panel ---------- */}
        <motion.aside
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          // The panel loses its card. The form beside it keeps one, because a
          // form is a control surface and needs an edge; this is prose, and
          // prose sits on the page.
          style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
        >
          {/* the plate, captioned by the heading under it */}
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
              id={PHOTOS.community}
              alt="Hands cupping a young seedling growing in soil"
              width={720}
              className="eco-photo-cover"
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>

          <h2 className="eco-display" style={{ fontSize: '1.3rem', margin: '0 0 0.5rem' }}>
            Your feedback shapes EcoTrack
          </h2>
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.65, margin: '0 0 1.6rem' }}>
            This is a student project that gets better every time someone takes a
            minute to say what worked and what did not.
          </p>

          <div style={{ display: 'grid', gap: '1.2rem' }}>
            {POINTS.map((point) => {
              const Icon = point.icon;
              return (
                // The 34px tinted rounded square behind each icon is gone. It
                // was chrome around a 17px glyph, and the tint it used - 14% of
                // the brand green - put a green shape behind a green icon.
                <div
                  key={point.title}
                  style={{ paddingTop: '0.85rem', borderTop: '1px solid var(--rule)' }}
                >
                  <Icon
                    size={17}
                    style={{ color: 'var(--eco-primary)', display: 'block', marginBottom: '0.65rem' }}
                  />
                  <div className="eco-display" style={{ fontWeight: 600, fontSize: '0.98rem' }}>
                    {point.title}
                  </div>
                  <div className="eco-text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.55, marginTop: '0.2rem' }}>
                    {point.body}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.aside>

        {/* ---------- form ---------- */}
        <motion.form
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="eco-card eco-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* topic chips */}
          <div style={{ marginBottom: '1.3rem' }}>
            <label className="eco-text-muted" style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.55rem' }}>
              What is this about?
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {TOPICS.map((item) => {
                const Icon = item.icon;
                const active = topic === item.label;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setTopic(item.label)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.8rem',
                      borderRadius: 999,
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: active
                        ? '1px solid rgba(var(--eco-primary-rgb), 0.6)'
                        : '1px solid var(--eco-border)',
                      background: active ? 'rgba(var(--eco-primary-rgb), 0.12)' : 'transparent',
                      color: active ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    <Icon size={14} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* star rating */}
          <div style={{ marginBottom: '1.3rem' }}>
            <label className="eco-text-muted" style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.5rem' }}>
              How would you rate EcoTrack? (optional)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = star <= shownRating;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star === rating ? 0 : star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`${star} star${star > 1 ? 's' : ''}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        // Amber, not --eco-orange. A rating is a value being
                        // reported, so it takes the instrument's colour - and
                        // on paper the old orange measured under the 4.5:1
                        // floor while the readout amber clears it.
                        color: filled ? 'var(--readout)' : 'var(--eco-text-muted)',
                        transition: 'color 0.15s ease, transform 0.15s ease',
                        transform: filled && !prefersReducedMotion ? 'scale(1.12)' : 'none',
                      }}
                    >
                      <Star size={26} fill={filled ? 'currentColor' : 'none'} />
                    </button>
                  );
                })}
              </div>
              {shownRating > 0 && (
                <span className="eco-marker" style={{ color: 'var(--readout)' }}>
                  {RATING_LABELS[shownRating]}
                </span>
              )}
            </div>
          </div>

          {/* name (optional) */}
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="text"
                id="fb-name"
                name="name"
                className="form-control"
                placeholder="Your name"
                value={form.name}
                onChange={handleChange}
              />
              <label htmlFor="fb-name">Name (optional)</label>
            </div>
          </div>

          {/* email (optional) */}
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="email"
                id="fb-email"
                name="email"
                className={`form-control ${touched.email && errors.email ? 'is-invalid' : ''}`}
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              />
              <label htmlFor="fb-email">Email (optional, if you want a reply)</label>
            </div>
            {touched.email && errors.email && (
              <div className="eco-field-error">
                <AlertCircle size={13} />
                {errors.email}
              </div>
            )}
          </div>

          {/* message (required) */}
          <div className="mb-2">
            <div className="form-floating">
              <textarea
                id="fb-message"
                name="message"
                className={`form-control ${touched.message && errors.message ? 'is-invalid' : ''}`}
                placeholder="Your feedback"
                value={form.message}
                onChange={handleChange}
                onBlur={() => setTouched((p) => ({ ...p, message: true }))}
                style={{ minHeight: 120, resize: 'vertical' }}
              />
              <label htmlFor="fb-message">Your feedback</label>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '0.35rem',
              }}
            >
              {touched.message && errors.message ? (
                <span className="eco-field-error" style={{ margin: 0 }}>
                  <AlertCircle size={13} />
                  {errors.message}
                </span>
              ) : (
                <span />
              )}
              <span className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                {form.message.length}/{MAX_MESSAGE}
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="eco-btn eco-btn-primary"
            style={{ width: '100%', marginTop: '0.8rem' }}
            disabled={sending || !isValid}
          >
            {sending ? (
              <>
                <Loader2 size={17} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                Sending…
              </>
            ) : (
              <>
                <Send size={17} />
                Send feedback
              </>
            )}
          </button>
        </motion.form>
      </div>

      {/* ---------- what happens next ---------- */}
      <div style={{ marginTop: 'clamp(3rem, 7vw, 4.5rem)' }}>
        <div className="eco-marker" style={{ display: 'block', marginBottom: '1.1rem' }}>
          After you send it
        </div>
        <h2
          className="eco-display"
          style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', margin: '0 0 2rem' }}
        >
          What happens <span className="eco-gradient-text">next</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.3rem' }}>
          {[
            { icon: Send, step: '01', title: 'You send it', body: 'A bug, an idea, or a compliment — it takes about a minute.' },
            { icon: MessageSquare, step: '02', title: 'We read it', body: 'Every message lands in the dashboard and is read by a real person.' },
            { icon: Wrench, step: '03', title: 'It ships', body: 'The most-wanted fixes and features shape what gets built next.' },
          ].map((s, index) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.step}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                // Numbered, and here the order is real: you send it, then it is
                // read, then it ships. The step index leads the channel as a
                // mono readout instead of a 1.6rem green glyph at 35% opacity
                // sitting beside a gradient disc.
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
                    {s.step}
                  </span>
                  <Icon size={19} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
                </div>
                <h3
                  className="eco-display"
                  style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}
                >
                  {s.title}
                </h3>
                <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                  {s.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
