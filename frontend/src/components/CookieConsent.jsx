// EcoTrack/frontend/src/components/CookieConsent.jsx
// A one-time notice for a first-time visitor that this site uses cookies.
//
// WHAT THIS APP ACTUALLY USES COOKIES/LOCAL STORAGE FOR
// Firebase Auth's own session (staying signed in between visits), the theme
// preference, and Google reCAPTCHA's verification cookie where that is
// configured - all functional, none of it advertising or cross-site
// tracking. The banner says so plainly rather than the vaguer "we use
// cookies to improve your experience" a lot of sites default to.
//
// One button, not "accept/reject": there is nothing optional to opt out of
// here - see above - so offering a choice with no actual second path behind
// it would be decorative rather than honest.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Cookie } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

const CONSENT_KEY = 'eco_cookie_consent';

export default function CookieConsent() {
  const { prefersReducedMotion } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <motion.div
      role="region"
      aria-label="Cookie notice"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="eco-cookie-banner"
    >
      <div className="eco-cookie-banner-inner">
        <Cookie size={18} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
        <p>
          EcoTrack uses cookies and local storage to keep you signed in and remember your
          theme — nothing for advertising, nothing sold to anyone.
        </p>
        <button type="button" className="eco-btn eco-btn-primary" onClick={accept}>
          Got it
        </button>
      </div>
    </motion.div>
  );
}
