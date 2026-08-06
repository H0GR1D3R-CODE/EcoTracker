// EcoTrack/frontend/src/components/LoadingSpinner.jsx
// The full-page loader, shown while the app works out whether someone is
// logged in, and any time a whole page is waiting on data.
//
// For loading INSIDE a page that already has a layout, prefer SkeletonCard -
// it keeps the shape of the content and feels much faster to the user.

import { Leaf } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

/**
 * @param {string}  message   text under the spinner
 * @param {boolean} fullPage  true fills the viewport, false fills its container
 * @param {string}  size      'sm' | 'md' | 'lg'
 */
export default function LoadingSpinner({
  message = 'Loading…',
  fullPage = true,
  size = 'md',
}) {
  const { prefersReducedMotion } = useTheme();

  const sizes = {
    sm: { ring: 32, icon: 14, font: '0.8rem' },
    md: { ring: 64, icon: 26, font: '0.95rem' },
    lg: { ring: 96, icon: 40, font: '1.05rem' },
  };
  const dimensions = sizes[size] || sizes.md;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.1rem',
        // 100dvh handles mobile browsers whose address bar hides on scroll,
        // which makes the older 100vh slightly too tall
        minHeight: fullPage ? '100dvh' : '220px',
        width: '100%',
      }}
      // Tells screen readers that content is loading here
      role="status"
      aria-live="polite"
    >
      <div style={{ position: 'relative', width: dimensions.ring, height: dimensions.ring }}>
        {/* The faint full circle sitting underneath */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px solid var(--eco-border)',
          }}
        />

        {/* The spinning arc. Only the top border is coloured, so rotating it
            draws a quarter-circle chasing its own tail. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px solid transparent',
            borderTopColor: 'var(--eco-primary)',
            borderRightColor: 'var(--eco-purple)',
            animation: prefersReducedMotion ? 'none' : 'eco-spin 0.9s linear infinite',
          }}
        />

        {/* A leaf resting in the middle */}
        <Leaf
          size={dimensions.icon}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--eco-primary)',
          }}
        />
      </div>

      {message && (
        <p
          style={{
            color: 'var(--eco-text-muted)',
            fontSize: dimensions.font,
            margin: 0,
            fontFamily: 'var(--font-display)',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
