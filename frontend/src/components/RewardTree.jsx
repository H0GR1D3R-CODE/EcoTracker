// EcoTrack/frontend/src/components/RewardTree.jsx
// The Dashboard-facing wrapper around GrowingTree: fetches the user's
// points/stage from GET /api/engagement/rewards and renders the tree plus
// its progress bar and labels. GrowingTree itself stays presentational
// (just draws whichever stage it's told to) so it can also be reused for a
// one-off celebration moment without a second data fetch.
//
// `bump` is how a claim elsewhere on the page (ChallengeList) tells this
// component to refetch - pass any value that changes (e.g. a counter) and
// the effect below re-runs. Same self-contained-but-externally-nudgeable
// shape as the rest of this app's small data widgets (StreakFlame fetches
// itself; this just adds one hook for "something changed the answer").

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';

import { engagementApi } from '../utils/api';
import GrowingTree from './GrowingTree';

export default function RewardTree({ bump = 0, compact = false }) {
  const [rewards, setRewards] = useState(null);

  useEffect(() => {
    let cancelled = false;
    engagementApi
      .getRewards()
      .then((data) => {
        if (!cancelled) setRewards(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bump]);

  if (!rewards) return null;

  const progressPercent = rewards.pointsPerTree
    ? Math.round((rewards.currentTreePoints / rewards.pointsPerTree) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.9rem' : '1.3rem' }}>
      <GrowingTree stageIndex={rewards.stageIndex} size={compact ? 72 : 108} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.3rem' }}>
          <span className="eco-readout" style={{ fontSize: compact ? '0.95rem' : '1.1rem', fontWeight: 600 }}>
            {rewards.stageLabel}
          </span>
          {!rewards.isFullyGrown && (
            <span className="eco-text-muted" style={{ fontSize: '0.74rem', flexShrink: 0 }}>
              {rewards.pointsToNextStage} pts to {rewards.nextStageLabel}
            </span>
          )}
        </div>

        <div style={{ height: 6, background: 'var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${rewards.isFullyGrown ? 100 : progressPercent}%`,
              background: 'var(--eco-primary)',
              transition: 'width 0.5s ease',
            }}
          />
        </div>

        <p className="eco-text-muted" style={{ fontSize: '0.76rem', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
          {rewards.isFullyGrown ? (
            <>Fully grown! Claim your next challenge to start growing another.</>
          ) : (
            <>Claim a challenge to earn points and grow this tree.</>
          )}
          {rewards.treesGrown > 0 && !compact && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem' }}>
              <Sprout size={12} /> {rewards.treesGrown} grown so far
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
