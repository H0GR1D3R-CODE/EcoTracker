// EcoTrack/frontend/src/components/AuroraBackground.jsx
//
// A soft "living wallpaper": a couple of large, blurred colour orbs that drift
// slowly behind a section. It sits absolutely inside a position:relative parent,
// never catches clicks, and holds still for anyone who has asked for reduced
// motion.
//
// The whole layer is faded out toward its edges with a radial mask, so it never
// ends in a hard rectangular line — it dissolves into the page instead of
// looking like a boxed panel sitting on top of it.

import { motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';

// Emerald → teal → ocean, the same family as the primary button. Spread apart
// so they read as separate soft washes rather than one muddy overlap.
const ORBS = [
  { color: '#0aa869', size: 460, top: '-18%', left: '-12%', drift: { x: [0, 34, -18, 0], y: [0, -26, 18, 0] }, duration: 26 },
  { color: '#0e79cf', size: 420, top: '-8%', right: '-14%', drift: { x: [0, -30, 22, 0], y: [0, 24, -14, 0] }, duration: 32 },
];

// Softly fade the layer toward all edges so there is never a visible boundary.
const FADE = 'radial-gradient(120% 120% at 50% 22%, #000 30%, rgba(0,0,0,0.35) 62%, transparent 100%)';

export default function AuroraBackground({ opacity = 0.32 }) {
  const { prefersReducedMotion } = useTheme();

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        opacity,
        maskImage: FADE,
        WebkitMaskImage: FADE,
      }}
    >
      {ORBS.map((orb, index) => (
        <motion.div
          key={index}
          animate={prefersReducedMotion ? undefined : orb.drift}
          transition={{ duration: orb.duration, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: orb.size,
            height: orb.size,
            top: orb.top,
            left: orb.left,
            right: orb.right,
            bottom: orb.bottom,
            borderRadius: '50%',
            background: `radial-gradient(circle at center, ${orb.color}, transparent 70%)`,
            filter: 'blur(72px)',
          }}
        />
      ))}
    </div>
  );
}
