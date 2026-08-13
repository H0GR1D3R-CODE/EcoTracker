// EcoTrack/frontend/src/hooks/useBodyScrollLock.js
//
// Stops the page behind a full-screen overlay (a modal, the mobile nav menu)
// from scrolling while it is open. Without this, iOS in particular lets a
// drag on the dimmed backdrop scroll the page underneath a fixed-position
// modal - the modal stays put but the content behind it visibly slides.
//
// Extracted from a pattern Navbar.jsx already had inline for its mobile
// menu, so the two modals that were missing it (Home.jsx's category detail,
// AdminDashboard's user drill-down) get the same fix instead of a second,
// slightly different copy of the same three lines.

import { useEffect } from 'react';

export function useBodyScrollLock(locked) {
  useEffect(() => {
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [locked]);
}

export default useBodyScrollLock;
