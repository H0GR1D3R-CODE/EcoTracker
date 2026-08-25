// EcoTrack/frontend/src/pages/Household.jsx
// A small, invite-code-joined group (family, hostel room, college batch)
// with a combined monthly footprint, a points-ranked leaderboard, a shared
// weekly challenge, and an activity feed of real logged entries members
// can cheer on.
//
// WHY RANKED BY POINTS, NOT RAW EMISSIONS - see backend/routes/household.py's
// module docstring for the full reasoning: ranking by who emitted the least
// turns a longer commute into a visible loser every time the page opens.
// Points (the same lifetime figure the Dashboard's reward tree already
// celebrates) keep this about visible effort, not whose life happens to
// have a smaller footprint. Each member's own monthly emission is shown as
// context only, never as the sort key - the backend has already sorted the
// members list by points before this component ever sees it.
//
// Mounted at /household

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Check,
  ChevronDown,
  Copy,
  Heart,
  LogOut,
  Sprout,
  Target,
  UserMinus,
  Users,
} from 'lucide-react';

import { householdApi, getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import PageBanner from '../components/PageBanner';
import SkeletonCard from '../components/SkeletonCard';
import { CATEGORY_META } from '../utils/emissionHelpers';
import { formatCategory, formatEmission, formatNumber, formatDate } from '../utils/formatters';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function CreateOrJoinPanel({ onChanged }) {
  const [mode, setMode] = useState('create');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await householdApi.create(name.trim());
      toast.success('Household created.');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create that household.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    if (!inviteCode.trim() || submitting) return;
    setSubmitting(true);
    try {
      await householdApi.join(inviteCode.trim());
      toast.success('Joined household.');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not join that household.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="eco-card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div role="radiogroup" aria-label="Create or join" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.4rem' }}>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'create'}
          onClick={() => setMode('create')}
          className={`eco-btn ${mode === 'create' ? 'eco-btn-primary' : 'eco-btn-outline'}`}
          style={{ flex: 1 }}
        >
          Create
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'join'}
          onClick={() => setMode('join')}
          className={`eco-btn ${mode === 'join' ? 'eco-btn-primary' : 'eco-btn-outline'}`}
          style={{ flex: 1 }}
        >
          Join
        </button>
      </div>

      {mode === 'create' ? (
        <form onSubmit={handleCreate} noValidate>
          <div className="form-floating" style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              id="household-name"
              className="form-control"
              placeholder="The Green Team"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
            />
            <label htmlFor="household-name">Household name</label>
          </div>
          <p className="eco-text-muted" style={{ fontSize: '0.82rem', margin: '0 0 1rem' }}>
            You'll get an invite code to share with whoever should join.
          </p>
          <button type="submit" className="eco-btn eco-btn-primary" disabled={submitting || !name.trim()} style={{ width: '100%' }}>
            Create household
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoin} noValidate>
          <div className="form-floating" style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              id="household-invite-code"
              className="form-control"
              placeholder="AB3XZQ"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              maxLength={6}
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
            />
            <label htmlFor="household-invite-code">Invite code</label>
          </div>
          <p className="eco-text-muted" style={{ fontSize: '0.82rem', margin: '0 0 1rem' }}>
            Ask whoever created the household for their 6-character code.
          </p>
          <button type="submit" className="eco-btn eco-btn-primary" disabled={submitting || !inviteCode.trim()} style={{ width: '100%' }}>
            Join household
          </button>
        </form>
      )}
    </div>
  );
}

/** A visibly separate pill, not just bold text - the thing this page most
    needs to not be missed at a glance. */
function PointsBadge({ points }) {
  return (
    <span
      className="eco-readout"
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0.25rem',
        fontSize: '1rem',
        fontWeight: 700,
        padding: '0.35rem 0.9rem',
        borderRadius: 999,
        background: 'color-mix(in srgb, var(--eco-primary) 14%, transparent)',
        border: '1px solid color-mix(in srgb, var(--eco-primary) 30%, transparent)',
        color: 'var(--eco-primary)',
        flexShrink: 0,
      }}
    >
      {formatNumber(points, 0)}
      <span style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.85 }}>pts</span>
    </span>
  );
}

function MemberRow({ member, rank, isOwner, isSelf, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const breakdown = Object.entries(member.categoryBreakdown || {})
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div
      style={{
        paddingTop: '0.8rem',
        marginTop: rank === 0 ? 0 : '0.8rem',
        borderTop: rank === 0 ? 'none' : '1px solid var(--rule)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
        }}
        aria-expanded={expanded}
      >
        <span style={{ width: 28, textAlign: 'center', fontSize: '1rem', flexShrink: 0 }}>
          {RANK_MEDALS[rank] || `#${rank + 1}`}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
              {member.name}
              {isSelf && <span className="eco-text-muted"> (you)</span>}
            </span>
            <ChevronDown
              size={13}
              style={{
                color: 'var(--eco-text-muted)',
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
                flexShrink: 0,
              }}
            />
          </div>
          <p className="eco-text-muted" style={{ fontSize: '0.76rem', margin: '0.15rem 0 0' }}>
            {formatEmission(member.emissionThisMonthKg)} this month · {member.stageLabel}
          </p>
        </div>

        <PointsBadge points={member.rewardPoints} />
      </button>

      {isOwner && !isSelf && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => onRemove(member)}
            className="eco-btn eco-btn-ghost"
            style={{ padding: '0.25rem 0.7rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <UserMinus size={13} /> Remove
          </button>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '0.7rem', marginLeft: 36, paddingBottom: '0.2rem' }}>
          {breakdown.length === 0 ? (
            <p className="eco-text-muted" style={{ fontSize: '0.78rem', margin: 0 }}>
              Nothing logged this month yet.
            </p>
          ) : (
            breakdown.map(([category, kg]) => {
              const meta = CATEGORY_META[category];
              const percent = Math.round((kg / member.emissionThisMonthKg) * 100) || 0;
              return (
                <div key={category} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '0.2rem' }}>
                    <span style={{ color: meta?.color }}>{meta?.label || formatCategory(category)}</span>
                    <span className="eco-text-muted">{formatEmission(kg)} · {percent}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--rule)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: meta?.color || 'var(--eco-primary)' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function HouseholdChallengeCard({ onClaimed }) {
  const [challenge, setChallenge] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const load = () => {
    householdApi
      .getChallenge()
      .then(setChallenge)
      .catch(() => setChallenge(null));
  };

  useEffect(load, []);

  const handleClaim = async () => {
    if (!challenge?.id) return;
    setClaiming(true);
    try {
      await householdApi.claimChallenge(challenge.id);
      toast.success('Household challenge claimed - everyone earned points!');
      load();
      onClaimed?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not claim that challenge.'));
    } finally {
      setClaiming(false);
    }
  };

  if (!challenge) return null;

  return (
    <div className="eco-card" style={{ marginBottom: '1.8rem' }}>
      <span className="eco-marker" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
        <Target size={14} /> This week's household challenge
      </span>

      {!challenge.available ? (
        <p className="eco-text-muted" style={{ fontSize: '0.86rem', margin: 0 }}>
          Log a few entries as a household this week, and a shared target will appear here.
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.9rem', margin: '0 0 0.8rem' }}>
            Keep the household's combined{' '}
            <strong style={{ color: CATEGORY_META[challenge.category]?.color }}>
              {CATEGORY_META[challenge.category]?.label || formatCategory(challenge.category)}
            </strong>{' '}
            under <strong>{formatEmission(challenge.target)}</strong> this week.
          </p>
          <div style={{ height: 8, background: 'var(--rule)', borderRadius: 999, overflow: 'hidden', marginBottom: '0.6rem' }}>
            <div
              style={{
                height: '100%',
                width: `${challenge.progressPercent}%`,
                background: challenge.status === 'claimed' ? 'var(--eco-primary)' : 'var(--readout)',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
            <span className="eco-text-muted" style={{ fontSize: '0.78rem' }}>
              {formatEmission(challenge.progress)} logged so far this week
            </span>
            {challenge.status === 'claimed' ? (
              <span className="eco-marker" style={{ color: 'var(--eco-primary)', fontSize: '0.72rem' }}>
                Claimed
              </span>
            ) : challenge.isComplete ? (
              <button
                type="button"
                onClick={handleClaim}
                disabled={claiming}
                className="eco-btn eco-btn-primary"
                style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Check size={14} /> Claim for everyone
              </button>
            ) : (
              <span className="eco-badge">In progress</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ActivityFeed() {
  const [activity, setActivity] = useState(null);

  const load = () => {
    householdApi
      .getActivity()
      .then((data) => setActivity(data.activity || []))
      .catch(() => setActivity([]));
  };

  useEffect(load, []);

  const handleCheer = async (item) => {
    // Optimistic - a cheer should feel instant, not wait on a round trip
    setActivity((current) =>
      current.map((entry) =>
        entry.recordId === item.recordId
          ? {
              ...entry,
              cheeredByMe: !entry.cheeredByMe,
              cheerCount: entry.cheerCount + (entry.cheeredByMe ? -1 : 1),
            }
          : entry
      )
    );
    try {
      await householdApi.toggleCheer(item.recordId);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not cheer that.'));
      load();
    }
  };

  if (activity === null) return null;

  return (
    <div className="eco-card">
      <span className="eco-marker" style={{ display: 'block', marginBottom: '1.1rem' }}>
        Recent activity
      </span>

      {activity.length === 0 ? (
        <p className="eco-text-muted" style={{ fontSize: '0.86rem', margin: 0 }}>
          Nothing logged by the household in the last week yet.
        </p>
      ) : (
        activity.map((item, index) => {
          const meta = CATEGORY_META[item.category];
          return (
            <div
              key={item.recordId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.7rem',
                paddingTop: '0.7rem',
                marginTop: index === 0 ? 0 : '0.7rem',
                borderTop: index === 0 ? 'none' : '1px solid var(--rule)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta?.color || 'var(--eco-primary)', flexShrink: 0 }} />
              <p style={{ flex: 1, minWidth: 0, fontSize: '0.86rem', margin: 0 }}>
                <strong>{item.name}</strong> logged {meta?.label?.toLowerCase() || formatCategory(item.category)}
                <span className="eco-text-muted"> · {formatDate(item.recordedDate)} · {formatEmission(item.emissionKgco2)}</span>
              </p>
              <button
                type="button"
                onClick={() => handleCheer(item)}
                className="eco-btn eco-btn-ghost"
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  color: item.cheeredByMe ? 'var(--eco-danger)' : 'var(--eco-text-muted)',
                  flexShrink: 0,
                }}
                aria-label={item.cheeredByMe ? 'Remove cheer' : 'Cheer this'}
              >
                <Heart size={14} fill={item.cheeredByMe ? 'currentColor' : 'none'} />
                {item.cheerCount > 0 && item.cheerCount}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Household() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = () => {
    householdApi
      .get()
      .then(setData)
      .catch(() => setData({ inHousehold: false }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(data.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy - select and copy the code manually.');
    }
  };

  const handleLeave = async () => {
    try {
      await householdApi.leave();
      toast.success('Left the household.');
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not leave that household.'));
    }
  };

  const handleRemove = async (member) => {
    try {
      await householdApi.removeMember(member.uid);
      toast.success(`Removed ${member.name}.`);
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not remove that member.'));
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
        <div className="eco-skeleton" style={{ width: 220, height: 34, borderRadius: 8, marginBottom: '2rem' }} />
        <SkeletonCard lines={4} height={280} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      <PageBanner
        photo="householdHome"
        alt="A family at home"
        color="var(--eco-purple)"
        icon={Users}
        eyebrow="Group mode"
        title="Your"
        titleAccent="Household"
        subtitle="A shared footprint and a leaderboard for the people you actually live or work with."
        action={
          data.inHousehold ? (
            <button type="button" onClick={handleLeave} className="eco-btn eco-btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <LogOut size={16} /> Leave
            </button>
          ) : null
        }
      />

      {!data.inHousehold ? (
        <CreateOrJoinPanel onChanged={load} />
      ) : (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div
            className="eco-card"
            style={{
              marginBottom: '1.8rem',
              border: '1px solid color-mix(in srgb, var(--eco-primary) 24%, var(--eco-border))',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="eco-marker" style={{ display: 'block', marginBottom: '0.4rem' }}>
                  {data.name}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span className="eco-readout" style={{ fontSize: '1.8rem', fontWeight: 600 }}>
                    {formatEmission(data.combinedEmissionThisMonthKg)}
                  </span>
                  <span className="eco-text-muted" style={{ fontSize: '0.82rem' }}>
                    combined this month · {data.memberCount} {data.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span className="eco-marker" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.68rem' }}>
                  Invite code
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="eco-btn eco-btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}
                >
                  {data.inviteCode}
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          <HouseholdChallengeCard />

          <div className="eco-card" style={{ marginBottom: '1.8rem' }}>
            <span className="eco-marker" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.1rem' }}>
              <Sprout size={14} /> Leaderboard, by lifetime points
            </span>
            {data.members.map((member, index) => (
              <MemberRow
                key={member.uid}
                member={member}
                rank={index}
                isOwner={data.isOwner}
                isSelf={member.uid === user?.uid}
                onRemove={handleRemove}
              />
            ))}
          </div>

          <ActivityFeed />
        </motion.div>
      )}
    </div>
  );
}
