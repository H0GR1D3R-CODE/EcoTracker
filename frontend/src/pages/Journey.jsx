// EcoTrack/frontend/src/pages/Journey.jsx
// A public, opt-in "my climate journey" page - one user's badges, streak
// and tree stage, at a stable URL anyone can open without signing in. See
// backend/routes/community.py's get_journey for what is and is not shown
// (never an email, never a raw record, never anything the account owner
// did not explicitly choose to make public).
//
// Mounted at /journey/:uid

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { toPng } from 'html-to-image';
import {
  Award,
  Download,
  Flag,
  Flame,
  GraduationCap,
  Heart,
  Loader2,
  Lock,
  Target,
  TreePine,
  Users,
} from 'lucide-react';

import { communityApi } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import GrowingTree from '../components/GrowingTree';
import { formatNumber } from '../utils/formatters';

// Same mapping Achievements.jsx uses - kept as its own copy rather than a
// shared import, since a public page pulling in a signed-in page's module
// would be an odd dependency direction for two files that otherwise share
// nothing else.
const BADGE_ICONS = {
  first_log: Flag,
  century_club: Award,
  week_warrior: Flame,
  month_master: Flame,
  first_tree: TreePine,
  climate_literate: GraduationCap,
  team_player: Users,
  goal_getter: Target,
  supporter: Heart,
};

function formatMemberSince(yearMonth) {
  if (!yearMonth) return null;
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Journey() {
  const { uid } = useParams();
  const { prefersReducedMotion } = useTheme();
  const [journey, setJourney] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    communityApi
      .getJourney(uid)
      .then(setJourney)
      .catch(() => setNotFound(true));
  }, [uid]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      // Same 15s race WrappedCard.jsx uses - toPng() has no timeout of its
      // own, and depends on fetching the tree illustration and fonts, so a
      // slow or dropped connection would otherwise leave this button
      // reading "Preparing..." forever with no way out.
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      );
      const dataUrl = await Promise.race([
        toPng(cardRef.current, { pixelRatio: 2, cacheBust: true }),
        timeout,
      ]);
      const link = document.createElement('a');
      link.download = `ecotrack-journey-${journey.displayName.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error('Could not create the image. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (notFound) {
    return (
      <div className="container" style={{ paddingTop: '5rem', paddingBottom: '5rem', textAlign: 'center' }}>
        <h1 className="eco-display" style={{ fontSize: '1.6rem', marginBottom: '0.8rem' }}>
          This journey isn't public
        </h1>
        <p className="eco-text-muted" style={{ fontSize: '0.95rem', maxWidth: 440, margin: '0 auto' }}>
          Either this page doesn't exist, or its owner hasn't chosen to share it. Public journeys are
          entirely opt-in - see Profile → Public journey page.
        </p>
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="container" style={{ paddingTop: '5rem', paddingBottom: '5rem' }}>
        <div className="eco-skeleton" style={{ height: 300, borderRadius: 'var(--eco-radius-sm)' }} />
      </div>
    );
  }

  return (
    <div className="eco-dot-grid" style={{ paddingTop: 'clamp(3rem, 8vw, 5rem)', paddingBottom: '4rem' }}>
      <div className="container" style={{ maxWidth: 640 }}>
        {/* Everything inside this ref is what handleDownload captures - a
            plain div, not the motion.div wrappers below, so toPng() sees a
            settled DOM rather than mid-animation opacity/transform values. */}
        <div ref={cardRef} style={{ background: 'var(--eco-bg)' }}>
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ textAlign: 'center', marginBottom: '2.5rem' }}
          >
            <span className="eco-marker">Climate journey</span>
            <h1 className="eco-display" style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.6rem)', margin: '0.6rem 0 0.5rem' }}>
              {journey.displayName}
            </h1>
            {journey.memberSince && (
              <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                Tracking with EcoTrack since {formatMemberSince(journey.memberSince)}
              </p>
            )}
          </motion.div>

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="eco-card"
            style={{ textAlign: 'center', marginBottom: '2rem' }}
          >
            <GrowingTree stageIndex={journey.stageIndex} size={140} />
            <div className="eco-display" style={{ fontWeight: 600, fontSize: '1.15rem', marginTop: '0.8rem' }}>
              {journey.stageLabel}
            </div>
            <div className="eco-text-muted" style={{ fontSize: '0.84rem', marginTop: '0.2rem' }}>
              {journey.currentTreePoints}/{journey.pointsPerTree} points toward the next stage
              {journey.treesGrown > 0 && ` · ${journey.treesGrown} full tree${journey.treesGrown === 1 ? '' : 's'} grown`}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                marginTop: '1.6rem',
                paddingTop: '1.2rem',
                borderTop: '1px solid var(--rule-strong)',
              }}
            >
              <div>
                <div className="eco-readout" style={{ fontSize: '1.3rem', fontWeight: 500 }}>
                  {formatNumber(journey.longestStreak, 0)}
                </div>
                <div className="eco-marker" style={{ marginTop: '0.2rem' }}>Best streak</div>
              </div>
              <div>
                <div className="eco-readout" style={{ fontSize: '1.3rem', fontWeight: 500 }}>
                  {formatNumber(journey.totalEntriesLogged, 0)}
                </div>
                <div className="eco-marker" style={{ marginTop: '0.2rem' }}>Entries logged</div>
              </div>
              <div>
                <div className="eco-readout" style={{ fontSize: '1.3rem', fontWeight: 500 }}>
                  {journey.unlockedCount}/{journey.totalCount}
                </div>
                <div className="eco-marker" style={{ marginTop: '0.2rem' }}>Badges</div>
              </div>
            </div>
          </motion.div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="eco-btn eco-btn-outline"
            style={{ fontSize: '0.85rem' }}
          >
            {downloading ? (
              <Loader2 size={15} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
            ) : (
              <Download size={15} />
            )}
            Download image
          </button>
        </div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.9rem',
          }}
        >
          {journey.badges.map((badge) => {
            const Icon = BADGE_ICONS[badge.key] || Award;
            return (
              <div
                key={badge.key}
                className="eco-card"
                style={{
                  display: 'flex',
                  gap: '0.7rem',
                  alignItems: 'center',
                  padding: '0.9rem 1rem',
                  opacity: badge.unlocked ? 1 : 0.5,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: badge.unlocked ? 'rgba(var(--eco-primary-rgb), 0.14)' : 'var(--eco-bg-alt)',
                    color: badge.unlocked ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
                  }}
                >
                  {badge.unlocked ? <Icon size={16} /> : <Lock size={14} />}
                </div>
                <span style={{ fontSize: '0.87rem', fontWeight: 500 }}>{badge.label}</span>
              </div>
            );
          })}
        </motion.div>

        <p className="eco-text-muted" style={{ fontSize: '0.78rem', textAlign: 'center', marginTop: '2.5rem' }}>
          A real EcoTrack account, shared by its own choice - never an email, a raw activity, or anything
          this person did not explicitly make public.
        </p>
      </div>
    </div>
  );
}
