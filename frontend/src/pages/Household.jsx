// EcoTrack/frontend/src/pages/Household.jsx
// A small, invite-code-joined group (family, hostel room, college batch)
// with a combined monthly footprint and a points-ranked leaderboard.
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
import { Check, Copy, Crown, LogOut, Sprout, UserMinus, Users } from 'lucide-react';

import { householdApi, getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import PageBanner from '../components/PageBanner';
import SkeletonCard from '../components/SkeletonCard';
import { formatEmission, formatNumber } from '../utils/formatters';

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

function MemberRow({ member, rank, isOwner, isSelf, onRemove }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.8rem',
        paddingTop: '0.8rem',
        marginTop: rank === 0 ? 0 : '0.8rem',
        borderTop: rank === 0 ? 'none' : '1px solid var(--rule)',
      }}
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
        </div>
        <p className="eco-text-muted" style={{ fontSize: '0.76rem', margin: '0.15rem 0 0' }}>
          {formatEmission(member.emissionThisMonthKg)} this month · {member.stageLabel}
        </p>
      </div>

      <span className="eco-readout" style={{ fontSize: '0.95rem', fontWeight: 600, flexShrink: 0 }}>
        {formatNumber(member.rewardPoints, 0)} pts
      </span>

      {isOwner && !isSelf && (
        <button
          type="button"
          onClick={() => onRemove(member)}
          className="eco-btn eco-btn-ghost"
          style={{ padding: '0.3rem', flexShrink: 0 }}
          aria-label={`Remove ${member.name}`}
        >
          <UserMinus size={15} />
        </button>
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
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

          <div className="eco-card">
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
        </motion.div>
      )}
    </div>
  );
}
