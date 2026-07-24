// EcoTrack/frontend/src/hooks/useCounter.js
// Animated number counter: "0" counts up to "2,450.5" when the element
// scrolls into view.
//
// HOW IT WORKS
//   1. An IntersectionObserver watches the element and reports when it becomes
//      visible on screen.
//   2. requestAnimationFrame then runs a short loop, redrawing the number about
//      60 times a second until it reaches the target.
//   3. An easing curve makes it rush at the start and glide to a stop, which
//      looks far better than a flat, robotic count.
//
// Usage:
//   const [ref, value] = useCounter(2450.5, { decimals: 1 });
//   return <h2 ref={ref}>{value}</h2>;

import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../context/ThemeContext';

/**
 * easeOutQuart - fast at first, then slowing sharply towards the end.
 * Input and output both run from 0 to 1.
 */
function easeOutQuart(progress) {
  return 1 - Math.pow(1 - progress, 4);
}

export function useCounter(target, options = {}) {
  const {
    duration = 1600,      // milliseconds the count takes
    decimals = 1,         // decimal places in the displayed number
    startOnView = true,   // false counts immediately instead of waiting for scroll
    separator = true,     // add thousand separators
  } = options;

  const { prefersReducedMotion } = useTheme();

  const elementRef = useRef(null);
  const [displayValue, setDisplayValue] = useState(0);

  // Remembers whether this counter has already run, so scrolling up and back
  // down does not restart it
  const hasAnimatedRef = useRef(false);

  // Holds the requestAnimationFrame id so the loop can be cancelled on unmount
  const frameRef = useRef(null);

  useEffect(() => {
    const targetValue = Number(target) || 0;
    const element = elementRef.current;

    // Allow a fresh run whenever the target actually changes. This matters on
    // the dashboard: the card first renders with 0 while the request is in
    // flight, and the real figure arrives a moment later. Without this reset
    // the guard below would treat the count to 0 as "already done" and the
    // card would sit at zero forever.
    hasAnimatedRef.current = false;

    // Accessibility: someone who asked for reduced motion gets the final
    // number straight away, with no animation at all
    if (prefersReducedMotion) {
      setDisplayValue(targetValue);
      return undefined;
    }

    const runAnimation = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;

      const startTime = performance.now();

      const step = (now) => {
        // How far through the animation we are, from 0 to 1
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        setDisplayValue(targetValue * easeOutQuart(progress));

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(step);
        } else {
          // Land exactly on the target - easing can leave a tiny rounding gap
          setDisplayValue(targetValue);
        }
      };

      frameRef.current = requestAnimationFrame(step);
    };

    if (!startOnView || !element) {
      runAnimation();
      return () => cancelAnimationFrame(frameRef.current);
    }

    // Older browsers without IntersectionObserver just get the number instantly
    if (typeof IntersectionObserver === 'undefined') {
      setDisplayValue(targetValue);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runAnimation();
            // One run only - stop watching as soon as it has fired
            observer.unobserve(entry.target);
          }
        });
      },
      // 0.3 means "start when 30% of the element is visible", so the count is
      // not already finished by the time the user has actually looked at it
      { threshold: 0.3 }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, startOnView, prefersReducedMotion]);

  // Format for display, e.g. 2450.5 -> "2,450.5"
  const formatted = separator
    ? displayValue.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : displayValue.toFixed(decimals);

  return [elementRef, formatted, displayValue];
}

export default useCounter;
