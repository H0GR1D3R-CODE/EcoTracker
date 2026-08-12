// EcoTrack/frontend/src/components/LiveCarbonCounter.jsx
//
// A live, ticking counter of how much CO₂ the world has released so far this
// year. It is HONEST about what it is: a model, not a sensor. Global emissions
// run at roughly 40 billion tonnes a year (Global Carbon Project — fossil fuels
// plus land use), which is about 1,270 tonnes every second. We take the seconds
// elapsed since 1 January and multiply. Recomputing from the real clock on every
// tick means the number is always accurate and only ever goes up.
//
// Restyled into the instrument system: this is the single largest, most
// central reading in the whole app - the world's own gauge - so it carries
// the readout treatment more emphatically than anywhere else. It lost the
// card, the glow orb behind the number and the gradient Space Grotesk figure;
// what replaced them is a channel under an amber rule with the number set in
// mono, the same grammar as every smaller readout in the product, just at the
// largest scale the type system allows.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useTheme } from '../context/ThemeContext';

// ~40 Gt CO₂ per year. A single, citable, round figure — the point is the scale.
const ANNUAL_TONNES = 40_000_000_000;
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const TONNES_PER_SECOND = ANNUAL_TONNES / SECONDS_PER_YEAR; // ≈ 1,268

function tonnesSoFarThisYear() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const secondsElapsed = (now.getTime() - yearStart.getTime()) / 1000;
  return secondsElapsed * TONNES_PER_SECOND;
}

export default function LiveCarbonCounter() {
  const { prefersReducedMotion } = useTheme();
  const [tonnes, setTonnes] = useState(tonnesSoFarThisYear);
  const timerRef = useRef(null);
  const sectionRef = useRef(null);

  // Only ticks while this section is actually on screen. It used to run at
  // 50ms - 20 React re-renders a second - unconditionally for as long as Home
  // stayed mounted, whether this section was in view, scrolled past, or the
  // tab was in the background. That is a real, measurable drag on every other
  // animation and interaction competing for the same main thread, not a
  // theoretical one: this was the single heaviest render loop on the busiest
  // page in the app, running regardless of whether anyone could see it.
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => setInView(entry.isIntersecting)),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return undefined;

    // 200ms still reads as "live" - the last three or four digits keep
    // moving - at a fifth of the render load 50ms carried. Once a second is
    // enough when the visitor has asked for reduced motion.
    const interval = prefersReducedMotion ? 1000 : 200;
    setTonnes(tonnesSoFarThisYear()); // catch up immediately on scrolling back into view
    timerRef.current = setInterval(() => setTonnes(tonnesSoFarThisYear()), interval);
    return () => clearInterval(timerRef.current);
  }, [prefersReducedMotion, inView]);

  const year = new Date().getFullYear();
  const display = Math.floor(tonnes).toLocaleString('en-US');

  return (
    <section ref={sectionRef} className="eco-section eco-line-grid">
      <div className="container">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            textAlign: 'center',
            maxWidth: 780,
            margin: '0 auto',
            paddingTop: '1.1rem',
            borderTop: '2px solid var(--readout)',
          }}
        >
          {/* LIVE indicator: instrument notation, not a pill. The pulsing dot
              stays - it is a real state, not decoration - but it now sits on
              the marker line the rest of the app uses for a status word,
              rather than in a bordered rounded chip. */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.55rem',
              marginBottom: '1.6rem',
            }}
          >
            <span
              className={prefersReducedMotion ? '' : 'eco-pulse'}
              style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--eco-danger)', flexShrink: 0 }}
            />
            <span className="eco-marker">Live</span>
            <Activity size={13} style={{ color: 'var(--eco-text-muted)' }} />
          </span>

          <p
            className="eco-text-muted"
            style={{ fontSize: '0.92rem', margin: '0 0 0.9rem' }}
          >
            CO₂ humanity has released into the atmosphere so far in {year}
          </p>

          {/* the ticking number - the largest reading in the app */}
          <div
            className="eco-readout"
            style={{
              fontSize: 'clamp(2.4rem, 8.5vw, 5rem)',
              fontWeight: 500,
              lineHeight: 1,
              // tabular figures keep every digit the same width, so the number
              // does not jitter left and right as it ticks
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {display}
          </div>
          <div className="eco-marker" style={{ marginTop: '0.5rem' }}>
            tonnes of CO₂
          </div>

          {/* rate + framing */}
          <p
            className="eco-text-muted"
            style={{
              fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
              lineHeight: 1.7,
              margin: '1.8rem auto 0',
              maxWidth: 560,
            }}
          >
            That is roughly{' '}
            <strong className="eco-readout" style={{ fontWeight: 600 }}>
              1,270 tonnes every second
            </strong>{' '}
            — and it does not stop. Your footprint is a part of this number. Measuring it is
            where bringing it down begins.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.8rem' }}>
            <Link to="/register" className="eco-btn eco-btn-primary" style={{ padding: '0.85rem 1.9rem' }}>
              Start tracking yours
              <ArrowRight size={17} />
            </Link>
          </div>

          <p
            className="eco-text-muted"
            style={{ fontSize: '0.74rem', marginTop: '1.8rem', marginBottom: 0 }}
          >
            Modelled from the Global Carbon Project's estimate of ~40 billion tonnes of CO₂ a
            year. A running figure, not a live sensor — the point is the scale, and that it never
            pauses.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
