// EcoTrack/frontend/src/utils/razorpay.js
//
// Loads Razorpay Checkout's script, and only when it is actually needed.
//
// WHY NOT JUST PUT THE <script> IN index.html?
// Razorpay's checkout.js is a third-party script on every single page load -
// it costs every visitor a network request, and it lets Razorpay see everyone
// who opens the site, not just the handful of people who choose to donate.
// Loading it here means it is fetched the first time someone opens the donate
// page, and never for anyone else.
//
// The promise is cached in `loader`, so two quick clicks share ONE download
// instead of injecting the script twice. A failed load resets the cache, so the
// next attempt genuinely retries rather than replaying the old rejection.

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// The in-flight (or finished) load. null means "nothing has been tried yet".
let loader = null;

/**
 * Resolve with the global Razorpay constructor, loading the script if needed.
 * Rejects with a human-readable Error when the script cannot be fetched -
 * usually an offline browser or an ad blocker.
 */
export function loadRazorpay() {
  // Already on the page (a second donation in the same visit)
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;

    const fail = (message) => {
      // Let a later attempt start clean rather than reusing this rejection
      loader = null;
      script.remove();
      reject(new Error(message));
    };

    script.onload = () => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
      } else {
        // The file arrived but did not define the global - treat as a failure
        // rather than handing back an undefined constructor to `new`.
        fail('The payment window did not load correctly. Please refresh and try again.');
      }
    };

    script.onerror = () => {
      fail('Could not load the payment window. Check your connection or any ad blocker.');
    };

    document.body.appendChild(script);
  });

  return loader;
}
