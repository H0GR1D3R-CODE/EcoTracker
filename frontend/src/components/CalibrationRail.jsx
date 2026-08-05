// EcoTrack/frontend/src/components/CalibrationRail.jsx
//
// THE SIGNATURE ELEMENT
//
// A calibrated scale fixed down the left edge of the page: tick marks, a
// travelling cursor, and a live readout of how far through the document you
// are. The page is literally a measuring instrument you drag a needle down.
//
// WHY THIS AND NOT A PROGRESS BAR
// A progress bar is decoration - it tells you nothing you could not get from
// the scrollbar. This says something true about the product: EcoTrack's whole
// job is turning an invisible quantity into a reading you can act on, and the
// rail applies that idea to the page itself. It is the one element here that
// could not be lifted onto a different product without becoming nonsense,
// which is the test of whether a signature is real.
//
// Ticks are unevenly weighted on purpose - every fifth is long and labelled,
// the rest are short. Evenly spaced identical marks read as a pattern; a real
// scale reads as an instrument.
//
// Hidden below 1100px: on a narrow screen the rail would either crowd the
// content or shrink into a meaningless stripe. It is an enhancement, and it
// takes nothing with it when it goes.

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';

const TICK_COUNT = 41; // 40 intervals, so every fifth mark lands cleanly

export default function CalibrationRail({ label = 'SCROLL DEPTH' }) {
  const { prefersReducedMotion } = useTheme();
  const [wideEnough, setWideEnough] = useState(false);

  // CSS (.eco-rail) decides whether the rail is SEEN - a media query cannot be
  // wrong about the viewport. This flag only decides whether to run the
  // per-frame readout, so the worst case if it lags is a hidden number being
  // computed, not a rail appearing where it does not fit.
  //
  // Both events are listened for on purpose: 'change' alone did not fire in
  // every environment, which is exactly how the first version of this ended up
  // still on screen at 1024px after being measured as too narrow.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1100px)');
    const update = () => setWideEnough(query.matches);

    update();
    query.addEventListener('change', update);
    window.addEventListener('resize', update);

    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const { scrollYProgress } = useScroll();

  // The needle lags the scroll very slightly, the way a physical gauge does.
  // Without this it is welded to the scrollbar and reads as a progress bar.
  const needle = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 40,
    restDelta: 0.0005,
  });

  const needleTop = useTransform(needle, (value) => `${value * 100}%`);

  // The numeric readout has to come through React state, because text content
  // is the one thing a MotionValue cannot write directly to the DOM.
  const [percent, setPercent] = useState(0);
  const frame = useRef(null);

  useEffect(() => {
    if (!wideEnough) return undefined;

    return needle.on('change', (value) => {
      // Coalesce to one update per frame. Without this the spring fires far
      // more often than the screen refreshes and re-renders for nothing.
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setPercent(Math.round(value * 100));
      });
    });
  }, [needle, wideEnough]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      aria-hidden="true"
      className="eco-rail"
      style={{
        position: 'fixed',
        left: 'clamp(14px, 2.2vw, 34px)',
        top: 0,
        bottom: 0,
        width: 62,
        zIndex: 20,
        pointerEvents: 'none',
        // NO `display` here on purpose. An inline style beats a stylesheet
        // rule, so setting it would silently defeat .eco-rail's display:none
        // and put the rail back on narrow screens. The class supplies flex.
        alignItems: 'center',
      }}
    >
      <div style={{ position: 'relative', height: '58vh', width: '100%' }}>
        {/* the spine */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 1,
            background: 'var(--rule)',
          }}
        />

        {/* ticks: every fifth long and labelled */}
        {Array.from({ length: TICK_COUNT }, (_, index) => {
          const major = index % 5 === 0;
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: 0,
                top: `${(index / (TICK_COUNT - 1)) * 100}%`,
                width: major ? 13 : 6,
                height: 1,
                background: major ? 'var(--rule-strong)' : 'var(--rule)',
              }}
            />
          );
        })}

        {/* the needle */}
        <motion.div
          style={{
            position: 'absolute',
            left: 0,
            top: needleTop,
            width: 26,
            height: 1,
            background: 'var(--readout)',
            boxShadow: '0 0 10px rgba(var(--readout-rgb), 0.65)',
            willChange: prefersReducedMotion ? undefined : 'top',
          }}
        />

        {/* live readout, riding just under the needle */}
        <motion.div
          style={{
            position: 'absolute',
            left: 4,
            top: needleTop,
            marginTop: 7,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.66rem',
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: 'var(--readout)',
            fontVariantNumeric: 'tabular-nums',
            willChange: prefersReducedMotion ? undefined : 'top',
          }}
        >
          {String(percent).padStart(2, '0')}
        </motion.div>

        {/* the scale's own label, set vertically along the spine */}
        <span
          style={{
            position: 'absolute',
            left: 18,
            bottom: 0,
            writingMode: 'vertical-rl',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--eco-text-muted)',
            opacity: 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
