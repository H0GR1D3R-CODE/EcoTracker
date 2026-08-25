// EcoTrack/frontend/src/components/ThemeToggle.jsx
// The sun/moon button that switches between dark and light mode.
//
// The icon rotates in on a plain ternary, not AnimatePresence - see the
// comment further down for why that combination was dropped.

import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

// 44, not 38: Apple's Human Interface Guidelines set 44x44 as the minimum
// comfortable tap target, and this button has no text label to widen its
// effective hit area the way a labelled nav link does.
export default function ThemeToggle({ size = 44 }) {
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
      {/* A plain ternary, not AnimatePresence mode="wait" - genuinely
          broken here (same class of bug fixed across Register.jsx,
          Login.jsx, Calculator.jsx and Reports.jsx): the SECOND toggle in
          a session would leave the wrong icon on screen, or none at all,
          since the exit rotation this depended on never reports complete.
          The theme itself still switches correctly either way (a separate
          CSS-variable mechanism, not this icon) - but a toggle showing the
          wrong icon for its own current state is exactly the kind of
          "small but everywhere" bug worth not shipping on a control every
          page carries in the navbar. */}
      {isDark ? (
          <motion.span
            key="sun"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
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
            transition={iconTransition}
            style={{ display: 'flex' }}
          >
            <Moon size={size * 0.48} />
          </motion.span>
      )}
    </motion.button>
  );
}
