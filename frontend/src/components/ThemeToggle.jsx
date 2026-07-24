// EcoTrack/frontend/src/components/ThemeToggle.jsx
// The sun/moon button that switches between dark and light mode.
//
// The icon swap uses AnimatePresence so the old icon rotates away as the new
// one rotates in, rather than one snapping into place.

import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ size = 38 }) {
  const { isDark, toggleTheme, prefersReducedMotion } = useTheme();

  // With reduced motion on, the icon changes instantly instead of spinning
  const iconTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.3, ease: 'easeInOut' };

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      // aria-label is what a screen reader announces, since the button has no text
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      whileHover={prefersReducedMotion ? {} : { scale: 1.1 }}
      whileTap={prefersReducedMotion ? {} : { scale: 0.92 }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid var(--eco-border)',
        background: 'var(--eco-glass-bg)',
        backdropFilter: 'blur(10px)',
        color: isDark ? 'var(--eco-orange)' : 'var(--eco-purple)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        // relative + overflow hidden keeps the two icons stacked while they swap
        position: 'relative',
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            // Changing the key is what tells AnimatePresence one icon has left
            // and another has arrived
            key="sun"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={iconTransition}
            style={{ display: 'flex' }}
          >
            <Sun size={size * 0.48} />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={iconTransition}
            style={{ display: 'flex' }}
          >
            <Moon size={size * 0.48} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
