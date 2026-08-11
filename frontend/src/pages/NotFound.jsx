// EcoTrack/frontend/src/pages/NotFound.jsx
// Shown for any URL that doesn't match a real route - a typo, an old
// bookmark, a link that's since moved. This used to just silently redirect
// home, which is worse than it sounds: someone who mistyped a URL would
// land on the homepage with no idea their original link was wrong at all.
//
// Same visual language as the auth pages (Login/Register): the dot-grid
// background, no photo - a "you took a wrong turn" moment doesn't need one,
// and a stray decorative image here would be exactly the kind of "clever but
// confusing" flourish the calibration rail turned out to be.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Compass, Home as HomeIcon } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function NotFound() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useTheme();

  return (
    <div
      className="eco-dot-grid"
      style={{
        minHeight: 'calc(100dvh - 68px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        textAlign: 'center',
      }}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 420 }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(var(--eco-primary-rgb), 0.1)',
            color: 'var(--eco-primary)',
            marginBottom: '1.5rem',
          }}
        >
          <Compass size={28} />
        </div>

        <div className="eco-readout" style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.6rem' }}>
          404 &middot; PAGE NOT FOUND
        </div>
        <h1 className="eco-display" style={{ fontSize: 'clamp(1.7rem, 4.5vw, 2.3rem)', marginBottom: '0.8rem' }}>
          This page took a wrong turn
        </h1>
        <p className="eco-text-muted" style={{ marginBottom: '2rem', lineHeight: 1.6 }}>
          Whatever link brought you here points somewhere that doesn't exist —
          it may have moved, or the address was mistyped.
        </p>

        <Link to={user ? '/dashboard' : '/'} className="eco-btn eco-btn-primary">
          <HomeIcon size={17} />
          {user ? 'Back to your dashboard' : 'Back to EcoTrack'}
        </Link>
      </motion.div>
    </div>
  );
}
