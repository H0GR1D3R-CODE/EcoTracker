// EcoTrack/frontend/src/hooks/useSlowLoadHint.js
//
// Whether a `loading` flag has been true for longer than `delayMs`. Used to
// upgrade a generic "Loading…" into an honest explanation once a wait has
// gone on long enough to start looking broken rather than merely slow - the
// backend is a single bundled Vercel serverless function (see
// backend/vercel.json) with a measured, real cold-start cost of 2-16 seconds,
// not a rare edge case, so several pages need this same delayed hint rather
// than each timing it themselves.

import { useEffect, useState } from 'react';

export function useSlowLoadHint(loading, delayMs = 3000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [loading, delayMs]);

  return slow;
}
