// EcoTrack/frontend/src/pages/About.jsx
// Public "about" page - the project's mission: what the instrument measures,
// why it exists, and the three rules it is built to. Static content, no login,
// no backend.
//
// Restyled into the instrument system alongside Home and Estimate. What went:
// the aurora wash behind a centred hero, the badge pill, four gradient figures
// in a centred row, a gradient disc behind each principle icon, and the three
// lifted cards. What arrived: rules, channels, mono readouts, and one
// photograph left alone.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, LineChart, ShieldCheck, Target } from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// The instrument's specification. Every line is checkable against a published
// source, and each one now carries that source underneath it - a reading
// without a provenance is just an assertion, which is the rule the whole
// design rests on.
const STATS = [
  { value: '7', label: 'Categories measured', note: 'transport → water' },
  { value: '1.5 °C', label: 'The limit we aim under', note: 'Paris Agreement' },
  { value: '~2 t', label: 'A fair yearly footprint', note: 'per person, per year' },
  { value: '100%', label: 'Figures with a source', note: 'DEFRA · IPCC · CEA · OWID' },
];

const PRINCIPLES = [
  {
    icon: LineChart,
    title: 'Measure honestly',
    body: 'Every figure comes from a published emission factor — DEFRA, the IPCC, the CEA India, Our World in Data. Nothing invented; everything traceable.',
  },
  {
    icon: Target,
    title: 'Act specifically',
    body: 'One overall "reduce emissions" target tells you nothing. EcoTrack splits your footprint into categories so you always know what to actually change.',
  },
  {
    icon: ShieldCheck,
    title: 'Respect privacy',
    body: 'Your data is yours. Sign-in runs through Firebase Authentication, and the server verifies your identity before any data is ever read.',
  },
];

export default function About() {
  const { prefersReducedMotion } = useTheme();

  return (
    <div>
      {/* ---------- hero ---------- */}
      <section style={{ padding: 'clamp(3rem, 9vw, 6rem) 0 clamp(2rem, 5vw, 3rem)' }}>
        <div className="container">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ maxWidth: 940 }}
          >
            {/* The SDG badge was a pill; it is a citation, so it is set as one.
                Goal 13 is the frame for the entire project, not a decoration
                floating above the headline. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                flexWrap: 'wrap',
                marginBottom: '2rem',
              }}
            >
              <span className="eco-marker">United Nations</span>
              <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                SDG 13
              </span>
              <span className="eco-marker" style={{ opacity: 0.6 }}>Climate Action</span>
              <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
            </div>

            <h1
              className="eco-display"
              style={{ fontSize: 'clamp(2.6rem, 8.5vw, 5.2rem)', margin: '0 0 1.4rem' }}
            >
              About <span className="eco-gradient-text">EcoTrack</span>
            </h1>
            <p
              className="eco-text-muted"
              style={{ fontSize: 'clamp(1rem, 2.4vw, 1.2rem)', maxWidth: '54ch', margin: 0 }}
            >
              You cannot reduce what you never measure. EcoTrack turns the vague worry
              of a carbon footprint into a real number you can see — and bring down.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ---------- the specification ---------- */}
      <section className="eco-section" style={{ paddingTop: '1rem' }}>
        <div className="container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '1.8rem',
            }}
          >
            {STATS.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                style={{ paddingTop: '0.95rem', borderTop: '1px solid var(--rule-strong)' }}
              >
                <div
                  className="eco-readout"
                  style={{
                    fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)',
                    fontWeight: 500,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.value}
                </div>
                <div
                  className="eco-marker"
                  style={{ marginTop: '0.6rem', display: 'block', letterSpacing: '0.1em' }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    marginTop: '0.25rem',
                    color: 'var(--eco-text-muted)',
                    opacity: 0.7,
                  }}
                >
                  {stat.note}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- why it exists ---------- */}
      <section className="eco-section" style={{ paddingTop: 0 }}>
        <div className="container">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: 'clamp(1.8rem, 4vw, 3.5rem)',
              alignItems: 'center',
            }}
          >
            <div>
              <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'block' }}>
                The reason
              </div>
              <h2
                className="eco-display"
                style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', margin: '0 0 1.2rem' }}
              >
                Why it <span className="eco-gradient-text">exists</span>
              </h2>
              <p className="eco-text-muted" style={{ fontSize: '1.02rem', lineHeight: 1.8, margin: 0 }}>
                Climate change can feel too big for one person to affect. But the average
                footprint is the sum of ordinary decisions — how you travel, what you eat,
                the power you use. EcoTrack makes those choices visible, so small,
                deliberate changes add up to something real.
              </p>
            </div>

            {/* The plate, captioned rather than framed. It had a full radius and
                the layered card shadow, which made a photograph look like a UI
                element floating above the page instead of an image printed on
                it. */}
            <div>
              <div
                className="eco-photo-zoom"
                style={{
                  borderRadius: 'var(--eco-radius-sm)',
                  overflow: 'hidden',
                  aspectRatio: '4 / 3',
                }}
              >
                <Photo
                  id={PHOTOS.seedling}
                  alt="Hands cupping a small green seedling growing from soil"
                  width={860}
                  className="eco-photo-cover"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  marginTop: '0.85rem',
                  paddingTop: '0.7rem',
                  borderTop: '1px solid var(--rule)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    flexShrink: 0,
                    borderRadius: 2,
                    background: 'var(--eco-primary)',
                  }}
                />
                <span className="eco-marker">What the numbers are for</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- principles ---------- */}
      <section
        className="eco-section"
        style={{
          background: 'var(--eco-bg-alt)',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="container">
          <div style={{ maxWidth: 660, marginBottom: '3rem' }}>
            <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'block' }}>
              Three rules
            </div>
            <h2
              className="eco-display"
              style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', margin: '0 0 1.1rem' }}
            >
              What EcoTrack <span className="eco-gradient-text">stands for</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0 }}>
              Not values on a wall — three decisions that are visible in how the
              product actually behaves.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1.3rem',
            }}
          >
            {PRINCIPLES.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  // Deliberately NOT numbered. These three are parallel - no
                  // one of them comes before another - which is the opposite of
                  // the three steps on Home, where the order carries meaning.
                  style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
                >
                  {/* The icon lost a 48px disc filled with a gradient mixed from
                      rgba(8,168,105) and rgba(14,121,207) - neon blended for a
                      black page, and a shape that said nothing. */}
                  <Icon
                    size={20}
                    style={{ color: 'var(--eco-primary)', display: 'block', marginBottom: '1.1rem' }}
                  />
                  <h3
                    className="eco-display"
                    style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.55rem' }}
                  >
                    {item.title}
                  </h3>
                  <p className="eco-text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.65, margin: 0 }}>
                    {item.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="eco-section">
        <div className="container">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '2rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ maxWidth: 620 }}>
              <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'block' }}>
                Free · no card
              </div>
              <h2
                className="eco-display"
                style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', margin: '0 0 1.1rem' }}
              >
                Ready to see <span className="eco-gradient-text">your number?</span>
              </h2>
              <p className="eco-text-muted" style={{ margin: 0 }}>
                One activity is enough to start — a car trip, an electricity bill, a meal.
              </p>
            </div>

            <Link
              to="/register"
              className="eco-btn eco-btn-primary eco-btn-pulse"
              style={{ padding: '0.9rem 2rem', flexShrink: 0 }}
            >
              Start tracking free
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
