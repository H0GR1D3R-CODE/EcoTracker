// EcoTrack/frontend/src/components/DataConsentModal.jsx
// A one-time, post-sign-in question: is this account comfortable being
// included in EcoTrack's own anonymised research data - the interventions
// log (routes/engagement.py's own module docstring) an admin or a granted
// researcher can pull from the admin console's Research tab.
//
// Same visual language as CookieConsent.jsx (a bottom banner, not a
// blocking modal, despite the filename this app's own convention keeps
// this near - "modal" describes the QUESTION being asked here, not
// literally how it renders) - reuses its exact .eco-cookie-banner CSS
// rather than a second, near-identical rule set.
//
// WHAT A "NO" ACTUALLY CHANGES, STATED PLAINLY (the honest thing this
// banner promises, and the only thing worth promising)
// Every account's own carbonRecords, goals and reports keep working
// exactly the same either way - this has nothing to do with the app
// functioning. What changes is narrower and real: backend/routes/admin.py's
// research_export/research_stats (_opted_out_uids) skip this account's
// logged interventions entirely once the answer is No. Nothing here claims
// anything broader than that.
//
// Shown once per account, right after sign-in, only for a normal signed-in
// user (not the admin console, not a two-step-verification interstitial) -
// never shown again once profile.dataSharingConsent is anything but
// null/undefined (see backend/routes/auth.py's _serialize_user for what
// each state means).

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, FlaskConical, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getErrorMessage } from '../utils/api';

// Same key CookieConsent.jsx writes to, and the exact same fixed,
// bottom-of-screen .eco-cookie-banner position both this component and
// that one use - see CookieConsent.jsx's own accept() for why only one of
// the two banners is ever allowed on screen at a time.
const COOKIE_CONSENT_KEY = 'eco_cookie_consent';

export default function DataConsentModal() {
  const { user, profile, isAdmin, twoFactorPending, updateProfile } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [cookieConsentGiven, setCookieConsentGiven] = useState(
    () => typeof window !== 'undefined' && Boolean(localStorage.getItem(COOKIE_CONSENT_KEY))
  );

  useEffect(() => {
    const handleCookieAccepted = () => setCookieConsentGiven(true);
    window.addEventListener('eco:cookie-consent-accepted', handleCookieAccepted);
    return () => window.removeEventListener('eco:cookie-consent-accepted', handleCookieAccepted);
  }, []);

  const shouldShow =
    cookieConsentGiven &&
    Boolean(user) &&
    Boolean(profile) &&
    !isAdmin &&
    !twoFactorPending &&
    (profile.dataSharingConsent === null || profile.dataSharingConsent === undefined);

  if (!shouldShow) return null;

  const answer = async (consent) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await updateProfile({ dataSharingConsent: consent });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save that choice. You can answer again next time.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      role="region"
      aria-label="Research data consent"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="eco-cookie-banner"
    >
      <div className="eco-cookie-banner-inner">
        <FlaskConical size={18} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
        <p>
          EcoTrack studies which recommendations actually help people cut their footprint -
          which swap ideas get accepted, which nudges get dismissed. Comfortable being
          included, fully anonymised (never your name or email)? You can change your mind
          any time from Profile &rsaquo; Privacy.
        </p>
        <button
          type="button"
          className="eco-btn eco-btn-ghost"
          onClick={() => answer(false)}
          disabled={submitting}
        >
          <X size={15} />
          No thanks
        </button>
        <button
          type="button"
          className="eco-btn eco-btn-primary"
          onClick={() => answer(true)}
          disabled={submitting}
        >
          <Check size={15} />
          Yes, I&rsquo;m comfortable
        </button>
      </div>
    </motion.div>
  );
}
