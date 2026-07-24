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
  const { isDark, prefersReducedMotion } = useTheme();

  // Toast colours are set in JavaScript rather than CSS because react-hot-toast
  // applies them as inline styles, which would override a stylesheet
  const background = isDark ? 'rgba(18, 18, 26, 0.95)' : 'rgba(255, 255, 255, 0.97)';
  const textColor = isDark ? '#f0f0f0' : '#10121a';
  const border = isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(10,10,15,0.08)';
  const primary = isDark ? '#00ff87' : '#00b862';

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
          background,
          color: textColor,
          border,
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '0.9rem',
          fontFamily: 'Inter, sans-serif',
          backdropFilter: 'blur(14px)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.45)'
            : '0 8px 28px rgba(16,18,26,0.12)',
          maxWidth: '380px',
        },

        success: {
          duration: 3000,
          // iconTheme colours the tick mark drawn by the library
          iconTheme: { primary, secondary: isDark ? '#0a0a0f' : '#ffffff' },
        },

        error: {
          // Errors stay longer because they usually need reading properly
          duration: 5000,
          iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
        },

        loading: {
          iconTheme: { primary, secondary: isDark ? '#0a0a0f' : '#ffffff' },
        },

        // Respect the reduced-motion setting by removing the slide-in animation
        ...(prefersReducedMotion ? { className: 'eco-toast-no-motion' } : {}),
      }}
    />
  );
}
