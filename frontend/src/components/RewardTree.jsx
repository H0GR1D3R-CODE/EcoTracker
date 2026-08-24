// EcoTrack/frontend/src/components/RewardTree.jsx
// The Dashboard-facing wrapper around GrowingTree: fetches the user's
// points/stage from GET /api/engagement/rewards and renders the tree plus
// its progress bar, stage label, and lifetime points/donation-equivalent
// total. GrowingTree itself stays presentational (just draws whichever
// stage it's told to) so it can also be reused for a one-off celebration
// moment without a second data fetch.
//
// donationValueInr IS A NUMBER, NOT A TRANSACTION
// See backend/routes/engagement.py's award_points docstring for the full
// reasoning: this shows what a user has earned, honestly, but nothing in
// this codebase automatically turns it into a real transfer - that stays a
// deliberate decision made outside the app, the same way the Donate page's
// own buttons already work.
//
// `bump` is how a claim elsewhere on the page (ChallengeList, or a goal
// marked achieved on /goals) tells this component to refetch - pass any
// value that changes (e.g. a counter) and the effect below re-runs.

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';

import { engagementApi } from '../utils/api';
import { formatNumber } from '../utils/formatters';
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
    <div>
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
              <>Fully grown! Claim a challenge or reach a goal to start growing another.</>
            ) : (
              <>Claim a challenge or reach a goal to earn points and grow this tree.</>
            )}
            {rewards.treesGrown > 0 && !compact && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem' }}>
                <Sprout size={12} /> {rewards.treesGrown} grown so far
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Lifetime total, always visible - not just "progress toward the
          next stage" but the running answer to "how much have I earned in
          total", stated plainly as both points and what that would be
          worth donated. See this component's own header comment for why
          that second figure is only ever shown, never sent anywhere by
          this app on its own. */}
      {!compact && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.8rem',
            flexWrap: 'wrap',
            marginTop: '1.1rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--rule)',
          }}
        >
          <span className="eco-marker" style={{ fontSize: '0.7rem' }}>
            Lifetime points
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span className="eco-readout" style={{ fontSize: '1.15rem', fontWeight: 600 }}>
              {formatNumber(rewards.totalPoints, 0)}
            </span>
            <span className="eco-text-muted" style={{ fontSize: '0.78rem' }}>
              ≈ ₹{formatNumber(rewards.donationValueInr, 2)} toward reforestation
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
