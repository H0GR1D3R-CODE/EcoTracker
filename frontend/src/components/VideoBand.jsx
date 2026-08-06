// EcoTrack/frontend/src/components/VideoBand.jsx
//
// A real, moving piece of footage on the Home page - one continuous scene
// instead of another still. Every photograph on this site is a frozen moment;
// this is the one section where the thing being measured is shown actually
// happening.
//
// THE SOURCE
// Real drone footage (not AI-generated, not a stock animation), hotlinked
// directly from Pexels' CDN the same way utils/photos.js hotlinks Unsplash -
// no file is committed to the repo, and the browser fetches it straight from
// the source. Pexels' licence (pexels.com/license) is free for this use with
// no attribution required; the credit line beneath the clip is here anyway,
// for the same reason every emission factor on this site names DEFRA or the
// IPCC - a real source that can be checked is worth more than an unlabeled
// asset, even when the labelling isn't legally required.
//   Clip: "Drone Shot of a Forest" · Pexels · videographer "K" (@kelly)
//   https://www.pexels.com/video/drone-shot-of-a-forest-4318714/
//
// PERFORMANCE AND MOTION
//   * The <video> element is not created until the band is near the
//     viewport - IntersectionObserver, the same mechanism useCounter uses to
//     defer its count-up. A 28-second clip is a multi-megabyte download that
//     nobody scrolling straight past the section should pay for.
//   * Once mounted it plays only while actually on screen, and pauses the
//     moment it scrolls away - there is no reason to keep decoding frames for
//     a video nobody is looking at.
//   * Two sources let the browser pick a file sized for its viewport rather
//     than always fetching the largest one: ~2 MB square-ish SD under 768px,
//     ~10 MB HD above it.
//   * prefersReducedMotion never autoplays. The poster frame shows instead,
//     with a play control so watching is a choice rather than something that
//     happens to you the moment the section scrolls into view.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

const VIDEO_ID = '4318714';
const POSTER = `https://images.pexels.com/videos/${VIDEO_ID}/pexels-photo-${VIDEO_ID}.jpeg?auto=compress&cs=tinysrgb&w=1600`;
const SOURCE_HD = `https://videos.pexels.com/video-files/${VIDEO_ID}/${VIDEO_ID}-hd_1280_720_24fps.mp4`;
const SOURCE_SD = `https://videos.pexels.com/video-files/${VIDEO_ID}/${VIDEO_ID}-sd_640_360_24fps.mp4`;

export default function VideoBand() {
  const { prefersReducedMotion } = useTheme();

  const wrapRef = useRef(null);
  const videoRef = useRef(null);

  // Whether the band has ever entered the viewport - once true, the <video>
  // tag mounts and stays mounted. There is no reason to tear it down again;
  // the point is only to avoid loading it for a visitor who never scrolls
  // this far.
  const [nearViewport, setNearViewport] = useState(false);

  // Reduced motion starts paused; anyone can still press play by choice
  const [playing, setPlaying] = useState(!prefersReducedMotion);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return undefined;
    }

    // rootMargin loads the clip a little before it is actually visible, so
    // there is no blank beat once it scrolls into place
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setNearViewport(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '400px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Once mounted, play only while on screen and pause the instant it is not -
  // a background video nobody can see is just a CPU heater.
  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!nearViewport || !wrap || !video || typeof IntersectionObserver === 'undefined') {
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
      { threshold: 0.2 }
    );

    observer.observe(wrap);
    return () => observer.disconnect();
  }, [nearViewport, playing]);

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
    <section className="eco-section">
      <div className="container">
        <div style={{ maxWidth: 640, marginBottom: '2.4rem' }}>
          <div
            className="eco-marker"
            style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}
          >
            Real footage, not a rendering
          </div>
          <h2 className="eco-display" style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}>
            Not a data point. <span className="eco-gradient-text">A living system.</span>
          </h2>
          <p className="eco-text-muted" style={{ margin: 0 }}>
            Every figure on this page traces back to a forest, a grid, a road like this
            one — moving, breathing, still there while you read the number.
          </p>
        </div>

        <motion.div
          ref={wrapRef}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 'var(--eco-radius-sm)',
            aspectRatio: '16 / 9',
            background: `var(--eco-bg-alt) center / cover no-repeat url(${POSTER})`,
          }}
        >
          {nearViewport && (
            <video
              ref={videoRef}
              muted
              loop
              playsInline
              autoPlay={!prefersReducedMotion}
              poster={POSTER}
              preload="none"
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            >
              <source src={SOURCE_SD} media="(max-width: 768px)" type="video/mp4" />
              <source src={SOURCE_HD} type="video/mp4" />
            </video>
          )}

          {/* Play/pause is always reachable, whether the clip started playing
              on its own or is waiting on reduced motion. It never disappears
              on hover-out the way a lot of video-chrome does - a control that
              vanishes is not a control. */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause the footage' : 'Play the footage'}
            aria-pressed={playing}
            style={{
              position: 'absolute',
              left: '1.1rem',
              bottom: '1.1rem',
              width: 42,
              height: 42,
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
              // Two bars, drawn by hand - pulling in one more icon for a
              // single glyph was not worth the extra import
              <span style={{ display: 'flex', gap: 4 }}>
                <span style={{ width: 4, height: 14, background: '#fff', borderRadius: 1 }} />
                <span style={{ width: 4, height: 14, background: '#fff', borderRadius: 1 }} />
              </span>
            ) : (
              <Play size={16} fill="#fff" style={{ marginLeft: 2 }} />
            )}
          </button>
        </motion.div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            marginTop: '0.85rem',
            paddingTop: '0.7rem',
            borderTop: '1px solid var(--rule)',
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 2, background: 'var(--org-onetree)' }}
          />
          <span className="eco-marker">
            &ldquo;Drone Shot of a Forest&rdquo; · Pexels · videographer K
          </span>
        </div>
      </div>
    </section>
  );
}
