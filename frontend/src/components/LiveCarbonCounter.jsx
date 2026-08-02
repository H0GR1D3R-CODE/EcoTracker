// EcoTrack/frontend/src/components/LiveCarbonCounter.jsx
//
// A live, ticking counter of how much CO₂ the world has released so far this
// year. It is HONEST about what it is: a model, not a sensor. Global emissions
// run at roughly 40 billion tonnes a year (Global Carbon Project — fossil fuels
// plus land use), which is about 1,270 tonnes every second. We take the seconds
// elapsed since 1 January and multiply. Recomputing from the real clock on every
// tick means the number is always accurate and only ever goes up.

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

  useEffect(() => {
    // 50 ms feels live (the last digits scramble); once a second is enough when
    // the visitor has asked for reduced motion.
    const interval = prefersReducedMotion ? 1000 : 50;
    timerRef.current = setInterval(() => setTonnes(tonnesSoFarThisYear()), interval);
    return () => clearInterval(timerRef.current);
  }, [prefersReducedMotion]);

  const year = new Date().getFullYear();
  const display = Math.floor(tonnes).toLocaleString('en-US');

  return (
    <section className="eco-section eco-line-grid">
      <div className="container">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="eco-card"
          style={{
            position: 'relative',
            overflow: 'hidden',
            textAlign: 'center',
            padding: 'clamp(2rem, 5vw, 3.4rem)',
            maxWidth: 820,
            margin: '0 auto',
          }}
        >
          {/* soft glow behind the number */}
          <div
            className="eco-glow-orb eco-glow-orb-green"
            style={{ width: 340, height: 340, top: '-45%', left: '50%', transform: 'translateX(-50%)' }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* LIVE badge with a pulsing dot */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.35rem 0.85rem',
                borderRadius: 999,
                border: '1px solid var(--eco-border)',
                background: 'var(--eco-bg)',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '1.4rem',
              }}
            >
              <span
                className={prefersReducedMotion ? '' : 'eco-pulse'}
                style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--eco-danger)' }}
              />
              <Activity size={13} style={{ color: 'var(--eco-primary)' }} />
              Live
            </span>

            <p
              className="eco-text-muted"
              style={{ fontSize: '0.9rem', margin: '0 0 0.6rem', letterSpacing: '0.02em' }}
            >
              CO₂ humanity has released into the atmosphere so far in {year}
            </p>

            {/* the ticking number */}
            <div
              className="eco-gradient-text"
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 700,
                fontSize: 'clamp(2.4rem, 8.5vw, 5rem)',
                lineHeight: 1.05,
                // tabular figures keep every digit the same width, so the number
                // does not jitter left and right as it ticks
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}
            >
              {display}
            </div>
            <div className="eco-text-muted" style={{ fontSize: '1rem', marginTop: '0.3rem' }}>
              tonnes of CO₂
            </div>

            {/* rate + framing */}
            <p
              style={{
                fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
                lineHeight: 1.6,
                margin: '1.8rem auto 0',
                maxWidth: 560,
              }}
            >
              That is roughly{' '}
              <strong style={{ color: 'var(--eco-primary)' }}>1,270 tonnes every second</strong> — and
              it does not stop. Your footprint is a part of this number. Measuring it is where
              bringing it down begins.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.8rem' }}>
              <Link to="/register" className="eco-btn eco-btn-primary" style={{ padding: '0.85rem 1.9rem' }}>
                Start tracking yours
                <ArrowRight size={17} />
              </Link>
            </div>

            <p
              className="eco-text-muted"
              style={{ fontSize: '0.74rem', marginTop: '1.6rem', marginBottom: 0 }}
            >
              Modelled from the Global Carbon Project's estimate of ~40 billion tonnes of CO₂ a
              year. A running figure, not a live sensor — the point is the scale, and that it never
              pauses.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
