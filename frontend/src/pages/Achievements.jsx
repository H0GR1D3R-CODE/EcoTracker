// EcoTrack/frontend/src/pages/Achievements.jsx
// The trophy wall - one page over data this app already tracks elsewhere
// (streaks, points, Learn progress, household membership, goals, donations),
// not a new reward system of its own. See backend/routes/achievements.py's
// module docstring for why every badge here has to trace back to a real,
// already-honest signal rather than new state a badge alone could unlock.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  Flag,
  Flame,
  GraduationCap,
  Heart,
  Lock,
  Target,
  TreePine,
  Trophy,
  Users,
} from 'lucide-react';

import { achievementsApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import PageBanner from '../components/PageBanner';
import SkeletonCard from '../components/SkeletonCard';

// icon per badge key - the backend sends label/description/unlocked, not an
// icon name, since a badge's icon is presentation, not data
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

export default function Achievements() {
  const { prefersReducedMotion } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    achievementsApi
      .getAll()
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, 'Could not load your achievements.')));
  }, []);

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      <PageBanner
        photo="summitDawn"
        alt="Misty mountain peaks catching the first light of dawn"
        color="var(--eco-primary)"
        icon={Trophy}
        eyebrow="Your progress"
        title="Achievements"
        subtitle={
          data
            ? `${data.unlockedCount} of ${data.totalCount} unlocked - every one earned by something you actually did, never bought or given away.`
            : 'Every badge here traces back to something you actually did.'
        }
      />

      {error && (
        <p className="eco-text-muted" style={{ fontSize: '0.9rem' }}>
          {error}
        </p>
      )}

      {!error && !data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.3rem',
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <SkeletonCard key={index} lines={2} height={120} />
          ))}
        </div>
      )}

      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.3rem',
          }}
        >
          {data.badges.map((badge, index) => {
            const Icon = BADGE_ICONS[badge.key] || Award;
            return (
              <motion.div
                key={badge.key}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="eco-card"
                style={{
                  display: 'flex',
                  gap: '0.9rem',
                  alignItems: 'flex-start',
                  opacity: badge.unlocked ? 1 : 0.62,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: badge.unlocked
                      ? 'rgba(var(--eco-primary-rgb), 0.14)'
                      : 'var(--eco-bg-alt)',
                    color: badge.unlocked ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
                  }}
                >
                  {badge.unlocked ? <Icon size={20} /> : <Lock size={18} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="eco-display"
                    style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: '0.2rem' }}
                  >
                    {badge.label}
                  </div>
                  <div className="eco-text-muted" style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                    {badge.description}
                  </div>
                  {badge.progressText && (
                    <div
                      className="eco-readout"
                      style={{ fontSize: '0.76rem', fontWeight: 500, marginTop: '0.5rem' }}
                    >
                      {badge.progressText}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
