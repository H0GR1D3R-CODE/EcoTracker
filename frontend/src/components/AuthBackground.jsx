// EcoTrack/frontend/src/components/AuthBackground.jsx
//
// The living backdrop behind Login and Register. Those two pages are a single
// small card on a very large empty area, so the background is most of what a
// visitor actually sees.
//
// PERFORMANCE, learned the hard way
// The first version of this made the Google sign-in popup stutter badly. Three
// causes, all fixed here:
//
//   1. `filter: blur(90px)` on large animated divs. A blur is re-rasterised on
//      EVERY frame the element moves, and these were 620px across. Replaced
//      with a radial-gradient, which is painted once and then merely moved -
//      visually near-identical, and it costs nothing per frame.
//   2. Sixteen framer-motion loops. Each one ticks on the main thread via
//      requestAnimationFrame, so they competed with React exactly when it was
//      busiest. They are now a CSS keyframe (.eco-mote), which the compositor
//      runs off-thread and keeps smooth while the main thread is blocked.
//   3. A grid layer drawn here on top of the .eco-dot-grid the pages already
//      apply - two grids painted for one visible result. This one is gone.
//
// Everything animates transform and opacity only, so no frame triggers layout
// or paint. The whole layer is fixed and pointer-events:none.

import { useMemo } from 'react';

// Spread far apart so they read as separate washes rather than one muddy blob.
// The gradient stops do the softening that `filter: blur()` used to.
const ORBS = [
  {
    size: 680,
    top: '-20%',
    left: '-14%',
    tint: 'rgba(var(--eco-primary-rgb), 0.34)',
    drift: { x1: '55px', y1: '-38px', x2: '-18px', y2: '26px' },
    duration: '28s',
  },
  {
    size: 560,
    bottom: '-22%',
    right: '-12%',
    tint: 'rgba(63, 176, 168, 0.30)',
    drift: { x1: '-46px', y1: '32px', x2: '22px', y2: '-22px' },
    duration: '34s',
  },
  {
    size: 420,
    top: '38%',
    right: '20%',
    tint: 'rgba(var(--eco-primary-rgb), 0.18)',
    drift: { x1: '32px', y1: '-26px', x2: '-26px', y2: '18px' },
    duration: '40s',
  },
];

// Ten reads as a drift; sixteen was not noticeably richer and cost more.
const MOTE_COUNT = 10;

export default function AuthBackground() {
  // Positions derive from the index rather than Math.random(), so they stay put
  // across re-renders. Random ones visibly reshuffle on every render - and with
  // live validation that is nearly every keystroke.
  const motes = useMemo(
    () =>
      Array.from({ length: MOTE_COUNT }, (_, index) => {
        const size = 3 + ((index * 7) % 4);
        return {
          id: index,
          // An irrational step keeps them from lining up in a visible pattern
          left: `${((index * 61.803) % 100).toFixed(2)}%`,
          size,
          delay: `${((index * 1.9) % 14).toFixed(2)}s`,
          duration: `${18 + ((index * 3) % 10)}s`,
          drift: `${((index % 5) - 2) * 16}px`,
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
      {/* ---- drifting orbs (CSS-driven, see .eco-orb in index.css) ---- */}
      {ORBS.map((orb, index) => (
        <div
          key={index}
          className="eco-orb"
          style={{
            width: orb.size,
            height: orb.size,
            top: orb.top,
            left: orb.left,
            right: orb.right,
            bottom: orb.bottom,
            // The soft edge comes from the gradient itself. This is the whole
            // point: no filter pass, so moving it is a pure composite.
            background: `radial-gradient(circle at 50% 50%, ${orb.tint} 0%, ${orb.tint} 18%, transparent 68%)`,
            animationDuration: orb.duration,
            '--eco-orb-x1': orb.drift.x1,
            '--eco-orb-y1': orb.drift.y1,
            '--eco-orb-x2': orb.drift.x2,
            '--eco-orb-y2': orb.drift.y2,
          }}
        />
      ))}

      {/* ---- rising motes ---- */}
      {/* CSS-driven (see .eco-mote in index.css) so they stay smooth while the
          main thread is busy opening the Google popup. */}
      {motes.map((mote) => (
        <span
          key={mote.id}
          className="eco-mote"
          style={{
            left: mote.left,
            width: mote.size,
            height: mote.size,
            animationDuration: mote.duration,
            animationDelay: mote.delay,
            '--eco-mote-drift': mote.drift,
          }}
        />
      ))}
    </div>
  );
}
