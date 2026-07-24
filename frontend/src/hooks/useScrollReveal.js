// EcoTrack/frontend/src/hooks/useScrollReveal.js
// GSAP ScrollTrigger animations: elements fade and slide up as they scroll
// into view, instead of just appearing.
//
// Two hooks are exported:
//   useScrollReveal()      - reveals one element
//   useStaggerReveal()     - reveals a group of children one after another
//
// Usage:
//   const sectionRef = useScrollReveal();
//   return <section ref={sectionRef}>...</section>;

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { useTheme } from '../context/ThemeContext';

// GSAP plugins have to be registered once before they can be used
gsap.registerPlugin(ScrollTrigger);

/**
 * Reveal a single element when it scrolls into view.
 *
 * @param {object} options
 * @param {number} options.y         how far below its final position it starts
 * @param {number} options.duration  seconds
 * @param {number} options.delay     seconds to wait before starting
 * @param {string} options.start     ScrollTrigger position, e.g. 'top 85%'
 */
export function useScrollReveal(options = {}) {
  const { y = 40, duration = 0.8, delay = 0, start = 'top 85%' } = options;

  const { prefersReducedMotion } = useTheme();
  const elementRef = useRef(null);

  // useLayoutEffect (rather than useEffect) runs before the browser paints,
  // so the element is never visible in its "before" position for a frame
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    // Accessibility: show the element immediately, with no movement
    if (prefersReducedMotion) {
      gsap.set(element, { opacity: 1, y: 0 });
      return undefined;
    }

    // gsap.context collects every animation created inside it, so a single
    // revert() call cleans them all up when the component unmounts
    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start,            // "when the top of the element hits 85% down the screen"
            toggleActions: 'play none none none', // play once, never reverse
          },
        }
      );
    }, element);

    return () => context.revert();
  }, [y, duration, delay, start, prefersReducedMotion]);

  return elementRef;
}

/**
 * Reveal a group of children one after another.
 *
 * Put the ref on the container and pass a CSS selector for the children:
 *   const gridRef = useStaggerReveal('.feature-card');
 *   <div ref={gridRef}><div className="feature-card" />...</div>
 *
 * @param {string} childSelector  which children to animate
 * @param {object} options        stagger is the gap in seconds between each one
 */
export function useStaggerReveal(childSelector, options = {}) {
  const { y = 36, duration = 0.7, stagger = 0.12, start = 'top 85%' } = options;

  const { prefersReducedMotion } = useTheme();
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const children = container.querySelectorAll(childSelector);
    if (children.length === 0) return undefined;

    if (prefersReducedMotion) {
      gsap.set(children, { opacity: 1, y: 0 });
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        children,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
          stagger, // this is the only difference from useScrollReveal
          ease: 'power3.out',
          scrollTrigger: {
            trigger: container,
            start,
            toggleActions: 'play none none none',
          },
        }
      );
    }, container);

    return () => context.revert();
  }, [childSelector, y, duration, stagger, start, prefersReducedMotion]);

  return containerRef;
}

/**
 * Slow parallax drift for hero backgrounds - the element moves more slowly
 * than the page scrolls, which creates a sense of depth.
 *
 * @param {number} speed  0.1 is subtle, 0.5 is dramatic
 */
export function useParallax(speed = 0.3) {
  const { prefersReducedMotion } = useTheme();
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || prefersReducedMotion) return undefined;

    const context = gsap.context(() => {
      gsap.to(element, {
        // Moves down as you scroll, at a fraction of the scroll distance
        yPercent: speed * 100,
        ease: 'none',
        scrollTrigger: {
          trigger: element,
          start: 'top top',
          end: 'bottom top',
          scrub: true, // ties the animation directly to the scrollbar position
        },
      });
    }, element);

    return () => context.revert();
  }, [speed, prefersReducedMotion]);

  return elementRef;
}

export default useScrollReveal;
