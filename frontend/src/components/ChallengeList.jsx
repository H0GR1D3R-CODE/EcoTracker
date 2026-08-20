// EcoTrack/frontend/src/components/ChallengeList.jsx
// This week's two auto-generated challenges - see
// backend/routes/engagement.py's _ensure_week_challenges for how they're
// picked: a fixed "log 5 of 7 days" target, and a category-reduction target
// set from the user's OWN trailing 4-week average (self-relative, so it
// stays achievable rather than an arbitrary number).
//
// Claiming is a deliberate extra tap rather than an automatic celebration
// the instant progress crosses the line - see claim_challenge's own
// docstring. That is also why the confetti fires from here, on the click
// handler, rather than from a useEffect watching isComplete.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Check, Sparkles, Target } from 'lucide-react';
import toast from 'react-hot-toast';

import { engagementApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { formatCategory, formatEmission } from '../utils/formatters';

function celebrate() {
  const settings = {
    particleCount: 60,
    spread: 65,
    startVelocity: 38,
    ticks: 200,
    colors: ['#2e6a4a', '#2c6577', '#8a5116', '#6a5480'],
    disableForReducedMotion: true,
  };
  confetti({ ...settings, origin: { x: 0.3, y: 0.6 } });
  setTimeout(() => confetti({ ...settings, origin: { x: 0.7, y: 0.6 } }), 160);
}

function challengeLabel(challenge) {
  if (challenge.type === 'log_frequency') {
    return `Log something on ${challenge.target} of 7 days this week`;
  }
  if (challenge.type === 'category_reduction') {
    return `Keep ${formatCategory(challenge.category)} under ${formatEmission(challenge.target)} this week`;
  }
  return 'Weekly challenge';
}

function ChallengeCard({ challenge, onClaim, claiming, delay }) {
  const { prefersReducedMotion } = useTheme();
  const claimed = challenge.status === 'claimed';

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.85rem 0',
        borderTop: '1px solid var(--rule)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
        <Target size={16} style={{ color: 'var(--eco-text-muted)', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.88rem' }}>{challengeLabel(challenge)}</div>
          <div className="eco-text-muted" style={{ fontSize: '0.76rem', marginTop: '0.15rem' }}>
            {challenge.progressPercent}% there
          </div>
        </div>
      </div>

      {claimed ? (
        <span
          className="eco-text-muted"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', flexShrink: 0 }}
        >
          <Check size={14} style={{ color: 'var(--eco-primary)' }} /> Claimed
        </span>
      ) : challenge.isComplete ? (
        <button
          type="button"
          className="eco-btn eco-btn-primary"
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', flexShrink: 0 }}
          disabled={claiming}
          onClick={() => onClaim(challenge.id)}
        >
          <Sparkles size={14} />
          {claiming ? 'Claiming…' : 'Claim'}
        </button>
      ) : (
        <span className="eco-marker" style={{ fontSize: '0.72rem', flexShrink: 0 }}>
          In progress
        </span>
      )}
    </motion.div>
  );
}

export default function ChallengeList() {
  const [challenges, setChallenges] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    engagementApi
      .getChallenges()
      .then((data) => {
        if (!cancelled) setChallenges(data.challenges);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClaim = async (challengeId) => {
    setClaimingId(challengeId);
    try {
      const updated = await engagementApi.claimChallenge(challengeId);
      setChallenges((current) => current.map((c) => (c.id === challengeId ? updated : c)));
      celebrate();
      toast.success('Challenge claimed.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not claim this challenge.'));
    } finally {
      setClaimingId(null);
    }
  };

  if (!challenges || challenges.length === 0) return null;

  return (
    <div>
      {challenges.map((challenge, index) => (
        <ChallengeCard
          key={challenge.id}
          challenge={challenge}
          onClaim={handleClaim}
          claiming={claimingId === challenge.id}
          delay={index * 0.08}
        />
      ))}
    </div>
  );
}
