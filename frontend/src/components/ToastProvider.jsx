// EcoTrack/frontend/src/components/ToastProvider.jsx
// Sets up react-hot-toast once for the whole app, styled to match the theme.
//
// This component renders nothing visible by itself - it just places the
// container that toasts appear in. Any file can then show a message with:
//
//   import toast from 'react-hot-toast';
//   toast.success('Emission logged successfully');
//   toast.error('Could not save your entry');

import { Toaster } from 'react-hot-toast';

import { useTheme } from '../context/ThemeContext';

export default function ToastProvider() {
  const { prefersReducedMotion } = useTheme();

  // Toast colours used to be hand-picked per theme in JS (including a stale
  // '#00ff87' left over from before the instrument system, which had already
  // drifted from the current dark-theme primary #4fbe80). CSS custom
  // properties work perfectly well inside an inline style object - the
  // browser resolves var() the same way regardless of whether it came from a
  // stylesheet rule or a style attribute - so this now just points at the
  // theme's own variables and never needs to be kept in sync by hand again.

  return (
    <Toaster
      // Below the navbar on desktop, out of the way of the bottom nav on mobile
      position="top-right"
      // Toasts stack rather than replacing each other
      reverseOrder={false}
      gutter={10}
      containerStyle={{ top: 80, right: 16 }}
      toastOptions={{
        duration: 3500,
        style: {
          background: 'var(--eco-glass-bg)',
          color: 'var(--eco-text)',
          border: '1px solid var(--eco-glass-border)',
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '0.9rem',
          fontFamily: 'Inter, sans-serif',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: 'var(--eco-shadow)',
          maxWidth: '380px',
        },

        success: {
          duration: 3000,
          // iconTheme colours the tick mark drawn by the library
          iconTheme: { primary: 'var(--eco-primary)', secondary: 'var(--eco-card)' },
        },

        error: {
          // Errors stay longer because they usually need reading properly
          duration: 5000,
          iconTheme: { primary: 'var(--eco-danger)', secondary: '#ffffff' },
        },

        loading: {
          iconTheme: { primary: 'var(--readout)', secondary: 'var(--eco-card)' },
        },

        // Respect the reduced-motion setting by removing the slide-in animation
        ...(prefersReducedMotion ? { className: 'eco-toast-no-motion' } : {}),
      }}
    />
  );
}
