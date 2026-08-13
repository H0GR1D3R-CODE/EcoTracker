// EcoTrack/frontend/src/components/RecaptchaNotice.jsx
//
// The attribution Google's terms require on any page that uses reCAPTCHA
// with its visible badge hidden (see the .grecaptcha-badge rule in
// index.css, and the comment there on why it's hidden on this app). Shown
// on the three forms that call executeRecaptcha(): Feedback, Register,
// Donate.
//
// Renders nothing when the feature is not configured (no VITE_RECAPTCHA_SITE_KEY)
// - crediting a check that is not actually running would be misleading, not
// just unnecessary, exactly like the rest of this app's optional features
// stay invisible until their own key is set.

export default function RecaptchaNotice() {
  if (!import.meta.env.VITE_RECAPTCHA_SITE_KEY) return null;

  return (
    <p
      className="eco-text-muted"
      style={{ fontSize: '0.72rem', textAlign: 'center', margin: '0.8rem 0 0', lineHeight: 1.5 }}
    >
      This site is protected by reCAPTCHA and the Google{' '}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
        Privacy Policy
      </a>{' '}
      and{' '}
      <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
        Terms of Service
      </a>{' '}
      apply.
    </p>
  );
}
