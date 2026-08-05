// EcoTrack/frontend/src/components/AuthBackground.jsx
//
// The living backdrop behind Login and Register. Those two pages are a single
// small card on a very large empty area, so the background is most of what a
// visitor actually sees - it was two static circles, which read as flat.
//
// Three layers, cheapest first:
//   1. drifting colour orbs   - slow, blurred, the ambient light in the room
//   2. a faint grid           - gives the empty space structure and depth
//   3. rising motes           - the only fast-ish motion, and it is tiny
//
// Everything is fixed-position and pointer-events:none, so it never intercepts
// a click on the form and never scrolls out from under it. Under
// prefers-reduced-motion the whole thing renders as a still image.

import { useMemo } from 'react';
import { motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';

// Spread far apart so they read as separate washes rather than one muddy blob.
const ORBS = [
  {
    size: 620,
    top: '-18%',
    left: '-12%',
    colour: 'rgba(var(--eco-primary-rgb), 0.30)',
    drift: { x: [0, 60, -20, 0], y: [0, -40, 30, 0] },
    duration: 26,
  },
  {
    size: 520,
    bottom: '-20%',
    right: '-10%',
    colour: 'rgba(63, 176, 168, 0.26)',
    drift: { x: [0, -50, 25, 0], y: [0, 35, -25, 0] },
    duration: 32,
  },
  {
    size: 380,
    top: '40%',
    right: '22%',
    colour: 'rgba(var(--eco-primary-rgb), 0.16)',
    drift: { x: [0, 35, -30, 0], y: [0, -30, 20, 0] },
    duration: 38,
  },
];

const MOTE_COUNT = 16;

export default function AuthBackground() {
  const { prefersReducedMotion } = useTheme();

  // Positions are derived from the index rather than Math.random(), so they
  // stay put across re-renders. A random layout would visibly reshuffle every
  // time the form re-rendered - which, on a page with live validation, is on
  // more or less every keystroke.
  const motes = useMemo(
    () =>
      Array.from({ length: MOTE_COUNT }, (_, index) => {
        // Two different irrationals keep x and y from falling into a pattern
        const left = ((index * 61.803) % 100).toFixed(2);
        const size = 3 + ((index * 7) % 5);
        return {
          id: index,
          left: `${left}%`,
          size,
          delay: (index * 1.37) % 12,
          duration: 16 + ((index * 3) % 11),
          drift: ((index % 5) - 2) * 18,
        };
      }),
    []
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* ---- 1. drifting orbs ---- */}
      {ORBS.map((orb, index) => (
        <motion.div
          key={index}
          animate={prefersReducedMotion ? undefined : orb.drift}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            position: 'absolute',
            width: orb.size,
            height: orb.size,
            top: orb.top,
            left: orb.left,
            right: orb.right,
            bottom: orb.bottom,
            borderRadius: '50%',
            background: orb.colour,
            // The blur is what turns a hard circle into light. Without it these
            // are the flat discs this component exists to replace.
            filter: 'blur(90px)',
          }}
        />
      ))}

      {/* ---- 2. faint grid ---- */}
      {/* Masked to fade out at the edges, so it never ends in a visible line */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(var(--eco-primary-rgb), 0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(var(--eco-primary-rgb), 0.055) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 78%)',
        }}
      />

      {/* ---- 3. rising motes ---- */}
      {/* Skipped entirely rather than frozen: sixteen motionless dots scattered
          over the page would look like dirt on the screen. */}
      {!prefersReducedMotion &&
        motes.map((mote) => (
          <motion.span
            key={mote.id}
            initial={{ y: '105vh', opacity: 0 }}
            animate={{
              y: '-10vh',
              x: [0, mote.drift, 0],
              opacity: [0, 0.7, 0.7, 0],
            }}
            transition={{
              duration: mote.duration,
              repeat: Infinity,
              delay: mote.delay,
              ease: 'linear',
              opacity: { duration: mote.duration, repeat: Infinity, times: [0, 0.15, 0.8, 1] },
              x: { duration: mote.duration / 2, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute',
              left: mote.left,
              bottom: 0,
              width: mote.size,
              height: mote.size,
              borderRadius: '50%',
              background: 'rgba(var(--eco-primary-rgb), 0.55)',
              boxShadow: '0 0 8px rgba(var(--eco-primary-rgb), 0.5)',
            }}
          />
        ))}
    </div>
  );
}
