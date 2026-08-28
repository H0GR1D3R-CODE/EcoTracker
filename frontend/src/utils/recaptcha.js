// EcoTrack/frontend/src/utils/recaptcha.js
//
// Loads Google reCAPTCHA v3's script, and only when a form that needs it is
// actually open - the same reasoning as utils/razorpay.js: a third-party
// script on every page load costs every visitor a request and lets Google
// see everyone who opens the site, not just the people filling in one of
// the three forms this protects.
//
// GRACEFUL DEGRADATION: if VITE_RECAPTCHA_SITE_KEY is not set, executeRecaptcha()
// resolves to null immediately rather than trying to load anything. The
// matching backend check (verify_recaptcha in backend/routes/__init__.py)
// treats a missing token as "not configured yet" and lets the request
// through - so a form works identically whether or not this feature has
// been turned on, exactly like the AI assistant degrades when GROQ_API_KEY
// is absent.

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
const SCRIPT_SRC = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;

let loader = null;

function loadScript() {
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;

    script.onload = () => {
      // grecaptcha.ready() waits for the library's own internal init, not
      // just the script tag finishing download
      window.grecaptcha.ready(() => resolve(window.grecaptcha));
    };
    script.onerror = () => {
      loader = null; // let a later attempt genuinely retry
      script.remove();
      reject(new Error('Could not load reCAPTCHA.'));
    };

    document.body.appendChild(script);
  });

  return loader;
}

/**
 * Get a reCAPTCHA v3 token for one specific action (e.g. "register"), or
 * null when the feature is not configured. Never rejects - a visitor who
 * has an ad blocker eating Google's script, or is on a build with no site
 * key set, should still be able to submit the form; the token is simply
 * absent and the backend's own graceful-degradation handles the rest.
 *
 * @param {string} action - must match the string backend/routes/__init__.py's
 *   verify_recaptcha() checks for this same form
 */
export async function executeRecaptcha(action) {
  if (!SITE_KEY) return null;

  try {
    const grecaptcha = await loadScript();
    return await grecaptcha.execute(SITE_KEY, { action });
  } catch {
    // Network hiccup, ad blocker, or Google's own service being down - the
    // form should still work, just without this one extra signal.
    return null;
  }
}
