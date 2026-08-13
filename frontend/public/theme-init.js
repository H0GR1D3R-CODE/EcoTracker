// EcoTrack/frontend/public/theme-init.js
//
// Runs BEFORE React and before anything is painted, applying the saved theme
// so a user who chose light mode never sees a flash of dark background while
// React starts up.
//
// Was inline in index.html's <head>. Moved to its own file so the page's
// Content-Security-Policy can drop 'unsafe-inline' from script-src - an
// inline <script> block is exactly what that CSP directive exists to block,
// and a security-headers pass would be self-defeating if it had to carve out
// an exception for the app's own markup on day one.
(function applySavedTheme() {
  try {
    var saved = localStorage.getItem('ecotrack-theme');
    // Light is the default now, so an unset preference must be written out
    // explicitly - <html> ships with data-theme="light" for the very first
    // paint, and anyone who previously chose dark keeps it.
    document.documentElement.setAttribute(
      'data-theme',
      saved === 'dark' ? 'dark' : 'light'
    );
  } catch (error) {
    // localStorage throws in some private browsing modes - the attribute
    // already on <html> stands, so light is what renders
  }
})();
