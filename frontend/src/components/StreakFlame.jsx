// EcoTrack/frontend/src/components/StreakFlame.jsx
// The current logging streak. Animates ONCE when it scrolls into view - not
// a continuous pulse. The redesign documented at index.css's "THE ALMANAC"
// header removed every piece of ambient, unprompted motion in this app
// (see the now-inert .eco-pulse-ring); a streak flame that throbbed forever
// would be exactly the kind of restlessness that rebuild exists to end.
// Motion here is a one-time response to appearing on screen, same as
// StatCard's count-up.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, ShieldCheck } from 'lucide-react';

import { engagementApi } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { useInView } from '../hooks/useInView';
import { useCounter } from '../hooks/useCounter';

export default function StreakFlame({ compact = false }) {
  const { prefersReducedMotion } = useTheme();
  const [streak, setStreak] = useState(null);
  const containerRef = useRef(null);
  const inView = useInView(containerRef, { threshold: 0.3 });

  useEffect(() => {
    let cancelled = false;
    engagementApi
      .getStreak()
      .then((data) => {
        if (!cancelled) setStreak(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [countRef, count] = useCounter(streak?.currentStreak || 0, {
    decimals: 0,
    duration: 1000,
    startOnView: true,
  });

  if (!streak) return null;

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
      <motion.div
        initial={prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={inView || prefersReducedMotion ? { scale: 1, opacity: 1 } : {}}
        transition={{ type: 'spring', stiffness: 300, damping: 16 }}
        style={{ color: streak.currentStreak > 0 ? 'var(--eco-orange)' : 'var(--eco-text-muted)' }}
      >
        <Flame size={compact ? 22 : 30} fill={streak.currentStreak > 0 ? 'currentColor' : 'none'} />
      </motion.div>

      <div ref={countRef}>
        <div className="eco-readout" style={{ fontSize: compact ? '1.2rem' : '1.6rem', fontWeight: 500 }}>
          {count} <span className="eco-marker" style={{ fontSize: '0.5em' }}>day{streak.currentStreak === 1 ? '' : 's'}</span>
        </div>
        {!compact && (
          <div className="eco-text-muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
            {streak.loggedToday
              ? `Longest: ${streak.longestStreak} days`
              : 'Log something today to keep it going'}
            {streak.freezesUsed > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.6rem' }}>
                <ShieldCheck size={12} /> {streak.freezesUsed} freeze used
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
