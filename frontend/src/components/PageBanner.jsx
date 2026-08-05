// EcoTrack/frontend/src/components/PageBanner.jsx
//
// The image header used at the top of the signed-in pages (Calculator, Goals,
// Reports). A real photograph fills the banner, a dark scrim keeps the white
// title readable over any image, and an optional action (e.g. a "New goal"
// button) sits on the right. Matches the Dashboard's earth banner so every app
// page opens the same premium way.

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

import Photo from './Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

export default function PageBanner({
  photo,
  alt,
  color = '#0ea5e9',
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

  const photoScale = useTransform(scrollYProgress, [0, 1], [1, 1.22]);
  const photoY = useTransform(scrollYProgress, [0, 1], ['0%', '16%']);
  // The text lifts and fades a little faster than the image behind it
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '-28%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <motion.div
      ref={bannerRef}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="eco-card eco-photo-zoom"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: 0,
        marginBottom: '1.8rem',
        minHeight: 172,
        display: 'flex',
        alignItems: 'flex-end',
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(110deg, rgba(4,20,12,0.92) 0%, rgba(4,20,12,0.7) 45%, rgba(4,20,12,0.32) 100%)',
        }}
      />

      <motion.div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: 'clamp(1.3rem, 3vw, 1.9rem)',
          y: prefersReducedMotion ? 0 : contentY,
          opacity: prefersReducedMotion ? 1 : contentOpacity,
        }}
      >
        <div>
          {eyebrow && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.75)',
                marginBottom: '0.6rem',
              }}
            >
              {Icon && <Icon size={13} />}
              {eyebrow}
            </span>
          )}

          <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.3rem', color: '#fff' }}>
            {title}
            {titleAccent && (
              <>
                {' '}
                <span
                  style={{
                    background: 'linear-gradient(90deg, var(--eco-primary), #7dd3fc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {titleAccent}
                </span>
              </>
            )}
          </h1>

          {subtitle && (
            <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255,255,255,0.82)', maxWidth: 560 }}>
              {subtitle}
            </p>
          )}
        </div>

        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </motion.div>
    </motion.div>
  );
}
