// EcoTrack/frontend/src/components/HeroReel.jsx
//
// The moving half of the hero. Every photograph on this site is a frozen
// moment; this is the one place the thing being measured is shown actually
// happening, and it sits beside the headline rather than several sections
// below it - "as soon as the page loads," not "if you scroll far enough."
//
// THIS REPLACES VideoBand.jsx, NOT ADDS TO IT
// The same clip used to live in its own full-width section further down the
// page, mounted lazily via IntersectionObserver because nobody scrolling
// straight past it should pay for a multi-megabyte download. Moving it into
// the hero meant that lazy-mount reasoning no longer applied - the hero is
// the first thing painted, so deferring it here would mean deferring the one
// thing this component exists to show promptly. Keeping both the hero
// placement AND the old section would have shown the identical clip twice on
// one page, so the old section is gone rather than duplicated.
//
// THE SOURCE
// Real drone footage (not AI-generated, not a stock animation), hotlinked
// directly from Pexels' CDN the same way utils/photos.js hotlinks Unsplash -
// no file is committed to the repo. Pexels' licence (pexels.com/license) is
// free for this use with no attribution required; the credit line beneath
// the clip is here anyway; the same reason every emission factor on this
// site names DEFRA or the IPCC.
//   Clip: "Drone Shot of a Forest" · Pexels · videographer "K" (@kelly)
//   https://www.pexels.com/video/drone-shot-of-a-forest-4318714/
//
// PERFORMANCE
//   * preload="metadata" fetches just enough to know the video's dimensions
//     and start decoding the first frame - not the whole file up front. The
//     poster image (a single compressed JPEG) is what actually paints first;
//     the video streams in and cross-fades over it once it can play.
//   * Once playing, it still pauses the instant it scrolls out of view via
//     IntersectionObserver - a background clip nobody can see is just a CPU
//     heater, hero or not.
//   * Two sources let the browser pick a file sized for its viewport: ~2 MB
//     square-ish SD under 768px, ~10 MB HD above it.
//   * prefersReducedMotion never autoplays. The poster frame shows instead,
//     with a play control so watching is a choice.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

const VIDEO_ID = '4318714';
const POSTER = `https://images.pexels.com/videos/${VIDEO_ID}/pexels-photo-${VIDEO_ID}.jpeg?auto=compress&cs=tinysrgb&w=1200`;
const SOURCE_HD = `https://videos.pexels.com/video-files/${VIDEO_ID}/${VIDEO_ID}-hd_1280_720_24fps.mp4`;
const SOURCE_SD = `https://videos.pexels.com/video-files/${VIDEO_ID}/${VIDEO_ID}-sd_640_360_24fps.mp4`;

export default function HeroReel() {
  const { prefersReducedMotion } = useTheme();

  const wrapRef = useRef(null);
  const videoRef = useRef(null);

  // The video frame has fully painted at least once - used to cross-fade the
  // poster out rather than snap-replace it, which would flash on a slow
  // connection.
  const [videoReady, setVideoReady] = useState(false);

  // Reduced motion starts paused; anyone can still press play by choice
  const [playing, setPlaying] = useState(!prefersReducedMotion);

  // Play only while actually on screen, pause the instant it is not.
  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && playing) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(wrap);
    return () => observer.disconnect();
  }, [playing]);

  const togglePlay = () => {
    setPlaying((current) => !current);
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  };

  return (
    <motion.div
      ref={wrapRef}
      // .eco-photo is the same house colour grade every photograph in the
      // product passes through - filter on this wrapper reaches both the
      // poster background AND the video composited inside it in one pass, so
      // real moving footage reads as part of the same commissioned shoot as
      // the stills rather than an unrelated raw clip that wandered in.
      // Putting it on the <video> as well, instead of only here, would stack
      // the same filter twice and over-grade it.
      className="eco-hero-reel eco-photo"
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      style={{
        // Sizing, border-radius and the viewport-edge bleed all live in
        // index.css's .eco-hero-reel now (and its 980px stacked-mobile
        // override) - a fixed inline aspect-ratio here would fight the grid
        // row's own height, which is the whole point of the panel treatment.
        position: 'relative',
        overflow: 'hidden',
        background: `var(--eco-bg-alt) center / cover no-repeat url(${POSTER})`,
      }}
    >
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        autoPlay={!prefersReducedMotion}
        poster={POSTER}
        preload="metadata"
        aria-hidden="true"
        onCanPlay={() => setVideoReady(true)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: videoReady ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      >
        <source src={SOURCE_SD} media="(max-width: 768px)" type="video/mp4" />
        <source src={SOURCE_HD} type="video/mp4" />
      </video>

      {/* Play/pause is always reachable, whether the clip started on its own
          or is waiting on reduced motion - it never disappears on hover-out
          the way a lot of video chrome does. */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause the footage' : 'Play the footage'}
        aria-pressed={playing}
        style={{
          position: 'absolute',
          left: '0.9rem',
          bottom: '0.9rem',
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(6, 10, 8, 0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          color: '#fff',
        }}
      >
        {playing ? (
          <span style={{ display: 'flex', gap: 4 }}>
            <span style={{ width: 4, height: 13, background: '#fff', borderRadius: 1 }} />
            <span style={{ width: 4, height: 13, background: '#fff', borderRadius: 1 }} />
          </span>
        ) : (
          <Play size={14} fill="#fff" style={{ marginLeft: 2 }} />
        )}
      </button>

      {/* Credit, bottom-right - present but quiet, the way a caption sits
          under a photograph elsewhere in the app rather than on top of it. */}
      <span
        style={{
          position: 'absolute',
          right: '0.7rem',
          bottom: '0.8rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          letterSpacing: '0.04em',
          color: 'rgba(255,255,255,0.75)',
          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
        }}
      >
        Pexels · K
      </span>
    </motion.div>
  );
}
