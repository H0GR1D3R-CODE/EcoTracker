// EcoTrack/frontend/src/components/AuroraBackground.jsx
//
// A soft "living wallpaper": a few large, blurred colour orbs that drift slowly
// behind a section. It sits absolutely inside a position:relative parent, never
// catches clicks, and holds perfectly still for anyone who has asked for reduced
// motion. Elegant and eye-catching without fighting the content on top of it.

import { motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';

// Emerald → teal → ocean, the same family as the primary button.
const ORBS = [
  { color: '#08a869', size: 520, top: '-14%', left: '-10%', drift: { x: [0, 40, -20, 0], y: [0, -30, 20, 0] }, duration: 24 },
  { color: '#0a97a0', size: 440, top: '24%', right: '-12%', drift: { x: [0, -35, 25, 0], y: [0, 30, -15, 0] }, duration: 30 },
  { color: '#0e79cf', size: 400, bottom: '-16%', left: '22%', drift: { x: [0, 30, -25, 0], y: [0, -20, 25, 0] }, duration: 28 },
];

export default function AuroraBackground({ opacity = 0.4 }) {
  const { prefersReducedMotion } = useTheme();

  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}
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
            background: `radial-gradient(circle at center, ${orb.color}, transparent 68%)`,
            filter: 'blur(64px)',
            opacity,
          }}
        />
      ))}
    </div>
  );
}
