// EcoTrack/frontend/src/components/PageBanner.jsx
//
// The image header at the top of the signed-in pages (Dashboard, Calculator,
// Goals, Reports). One component, four pages, so this is the single highest
// leverage piece of the app: whatever it does, the whole signed-in area opens
// with.
//
// WHAT CHANGED, AND WHY
// It used to be a photograph under a scrim reaching 92% black on the left, with
// the page title, subtitle and action button in white type on top of it. That
// is the exact device removed from Home, Learn, Gallery and Donate: the scrim
// exists only so white words survive over an unpredictable image, and it pays
// for that by darkening every photograph in the product.
//
// The plate is now left alone and the words sit underneath it, under a rule -
// the same arrangement as the photo strip on Home. The title can be set in the
// display face at real size instead of being limited to whatever stays legible
// over a picture, and the action button gets the page's own ground rather than
// floating over an image.
//
// The scroll parallax stays. It is motion tied to something the user is
// actively doing, not ambient decoration, and with no scrim over the image it
// is finally visible for what it is.

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

import Photo from './Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

export default function PageBanner({
  photo,
  alt,
  color = 'var(--cat-water)',
  icon: Icon,
  eyebrow,
  title,
  titleAccent,
  subtitle,
  action,
}) {
  const { prefersReducedMotion } = useTheme();
  const bannerRef = useRef(null);

  // Scroll-linked parallax: the photograph scales up and drifts as the banner
  // leaves the viewport, so the header has depth instead of sliding away flat.
  //
  // useScroll/useTransform produce MotionValues, which framer-motion writes
  // straight to the DOM without re-rendering React. A useState scroll handler
  // would re-render this component on every scroll frame - and every child with
  // it - which is exactly how a scroll effect turns into jank.
  const { scrollYProgress } = useScroll({
    target: bannerRef,
    offset: ['start start', 'end start'],
  });

  const photoScale = useTransform(scrollYProgress, [0, 1], [1, 1.25]);
  const photoY = useTransform(scrollYProgress, [0, 1], ['0%', '16%']);

  // The title used to lift and fade out with the image. It sits on the page
  // now rather than on the photograph, and a heading that fades as you scroll
  // past it reads as a rendering fault rather than as depth.

  return (
    <motion.div
      // eco-no-print: this is decorative chrome, not report content. Reports
      // is the one page with a real print button, and without this the
      // banner (now up to 320px tall) ate a third of the first printed page
      // ahead of the actual figures - directly against that page's own
      // "printed artefact, not a stack of dashboard sections" framing.
      className="eco-no-print"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{ marginBottom: '2.5rem' }}
    >
      {/* the plate — sized like a real hero now, not a strip. This is the one
          component behind every signed-in page (Dashboard/Calculator/Goals/
          Reports), so making it properly cinematic here is what makes all
          four tabs read as one considered product instead of four thin
          headers stacked over a wall of numbers.

          The clamp floor is 200px, not the 240px an earlier pass used - a
          code review caught that a 240px floor binds (i.e. stops scaling
          down) on anything shorter than ~630px tall, which pins the banner
          near its max size on a landscape phone or a short browser window
          and pushes the title/action button below the fold on every page
          that renders this. 200px still reads as a real hero, not a strip,
          without that failure mode. */}
      <div
        ref={bannerRef}
        className="eco-photo-zoom"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--eco-radius-sm)',
          height: 'clamp(200px, 28vh, 320px)',
        }}
      >
        {/* The photo sits in its own transformed layer. Scaling slightly beyond
            the frame (110%) means the parallax drift never exposes a bare edge. */}
        <motion.div
          style={{
            position: 'absolute',
            inset: '-5%',
            scale: prefersReducedMotion ? 1 : photoScale,
            y: prefersReducedMotion ? 0 : photoY,
            willChange: prefersReducedMotion ? undefined : 'transform',
          }}
        >
          <Photo
            id={PHOTOS[photo]}
            alt={alt}
            width={1500}
            color={color}
            className="eco-photo-cover"
            style={{ width: '100%', height: '100%' }}
          />
        </motion.div>
      </div>

      {/* the caption: what page this is, and what you can do on it */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginTop: '1.6rem',
          paddingTop: '1.1rem',
          borderTop: '1px solid var(--rule-strong)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow && (
            <span
              className="eco-marker"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                marginBottom: '0.85rem',
              }}
            >
              {Icon && <Icon size={13} style={{ color: 'var(--eco-primary)' }} />}
              {eyebrow}
            </span>
          )}

          <h1
            className="eco-display"
            style={{ fontSize: 'clamp(2rem, 4.6vw, 3.1rem)', margin: '0 0 0.5rem' }}
          >
            {title}
            {titleAccent && (
              <>
                {' '}
                <span className="eco-gradient-text">{titleAccent}</span>
              </>
            )}
          </h1>

          {subtitle && (
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '1rem', maxWidth: '54ch' }}>
              {subtitle}
            </p>
          )}
        </div>

        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </motion.div>
  );
}
