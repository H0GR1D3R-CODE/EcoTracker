// EcoTrack/frontend/src/hooks/useInView.js
//
// Whether the element a ref points to currently intersects the viewport.
// Extracted from HeroReel.jsx and LiveCarbonCounter.jsx, which had each
// hand-rolled the identical "IntersectionObserver -> boolean state" pattern
// independently - a fix to one (unobserve timing, the missing-API fallback)
// was not reaching the other. This is the one place that logic lives now.

import { useEffect, useState } from 'react';

/**
 * @param {React.RefObject} ref          the element to watch
 * @param {number}          threshold    how much of the element must be
 *                                       visible before it counts as "in view"
 * @param {string}          rootMargin   grows/shrinks the viewport used for
 *                                       the intersection check, same syntax
 *                                       as CSS margin
 * @param {boolean}         defaultValue what to return in an environment
 *                                       with no IntersectionObserver - the
 *                                       two original call sites disagreed on
 *                                       this (one degraded to "always on,"
 *                                       the other to "never on"), so it is a
 *                                       parameter rather than a single
 *                                       hardcoded choice.
 */
export function useInView(ref, { threshold = 0, rootMargin, defaultValue = false } = {}) {
  const [inView, setInView] = useState(
    typeof IntersectionObserver === 'undefined' ? defaultValue : false
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => setInView(entry.isIntersecting)),
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, threshold, rootMargin]);

  return inView;
}
