// EcoTrack/frontend/src/components/Reveal.jsx
//
// A small wrapper that fades and lifts its children into view as they scroll on
// screen. Used across the public pages and the dashboard so scrolling feels
// alive rather than static.
//
// By default it re-plays every time the element scrolls back into view (once:
// false), which is the "animates as you scroll up and down" effect. Pass
// once so a section only reveals a single time. Respects reduced motion: when
// that is set, children are simply shown with no animation at all.

import { motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';

export default function Reveal({
  children,
  y = 26,
  delay = 0,
  duration = 0.55,
  once = false,
  amount = 0.2,
  className,
  style,
}) {
  const { prefersReducedMotion } = useTheme();

  // No motion for people who asked for none — render a plain container.
  if (prefersReducedMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
