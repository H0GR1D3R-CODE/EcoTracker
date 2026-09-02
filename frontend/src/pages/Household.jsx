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
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Check,
  ChevronDown,
  Copy,
  GraduationCap,
  Heart,
  Link2Off,
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
import SelectField from '../components/SelectField';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';
import { formatCategory, formatEmission, formatNumber, formatDate } from '../utils/formatters';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

// Copy-only mirror of routes/household.py's MAX_CLASSROOM_MEMBERS/
// MAX_WORKPLACE_MEMBERS - the backend is the real enforcement, this just
// lets the create form tell people the cap before they hit it.
const MAX_CLASSROOM_MEMBERS = 60;
const MAX_WORKPLACE_MEMBERS = 300;

// One lookup for every piece of copy that varies by groupType, instead of
// a household/classroom ternary repeated at each call site - see
// backend/routes/household.py's own module docstring: "a classroom/team is
// the same document and the same mechanics... just at a different scale",
// which is exactly as true of a workplace group. Falls back to
// GROUP_TYPE_META.household for any unrecognised or missing value.
const GROUP_TYPE_META = {
  household: {
    label: 'Household',
    challengeLabel: 'Household',
    nounSingular: 'household',
    possessive: "household's",
    organizerTitle: 'owner',
    createdToast: 'Household created.',
    createCta: 'Create household',
    nameLabel: 'Household name',
    nameHint: "You'll get an invite code to share with whoever should join.",
    titleAccent: 'Household',
  },
  classroom: {
    label: 'Classroom / Team',
    challengeLabel: 'Team',
    nounSingular: 'team',
    possessive: "team's",
    organizerTitle: 'organizer',
    createdToast: 'Team created.',
    createCta: 'Create team',
    nameLabel: 'Class or team name',
    nameHint: `You'll get an invite code to share with your class or team (up to ${MAX_CLASSROOM_MEMBERS} people), and can assign which category each week's shared challenge targets.`,
    titleAccent: 'Team',
  },
  workplace: {
    label: 'Workplace',
    challengeLabel: 'Workplace',
    nounSingular: 'workplace group',
    possessive: "workplace's",
    organizerTitle: 'organizer',
    createdToast: 'Workplace group created.',
    createCta: 'Create workplace group',
    nameLabel: 'Workplace or team name',
    nameHint: `You'll get an invite code to share with colleagues (up to ${MAX_WORKPLACE_MEMBERS} people) - a lightweight way to track commute and workplace footprint together, and assign which category each week's shared challenge targets.`,
    titleAccent: 'Workplace',
  },
};

function groupTypeMeta(groupType) {
  return GROUP_TYPE_META[groupType] || GROUP_TYPE_META.household;
}

function CreateOrJoinPanel({ onChanged }) {
  const [mode, setMode] = useState('create');
  const [name, setName] = useState('');
  const [groupType, setGroupType] = useState('household');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await householdApi.create(name.trim(), groupType);
      toast.success(groupTypeMeta(groupType).createdToast);
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create that group.'));
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
      toast.success('Joined.');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not join with that code.'));
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
          <div role="radiogroup" aria-label="Group type" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {Object.entries(GROUP_TYPE_META).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={groupType === key}
                onClick={() => setGroupType(key)}
                className={`eco-btn ${groupType === key ? 'eco-btn-primary' : 'eco-btn-outline'}`}
                style={{ flex: '1 1 auto', fontSize: '0.84rem' }}
              >
                {meta.label}
              </button>
            ))}
          </div>

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
            <label htmlFor="household-name">
              {groupTypeMeta(groupType).nameLabel}
            </label>
          </div>
          <p className="eco-text-muted" style={{ fontSize: '0.82rem', margin: '0 0 1rem' }}>
            {groupTypeMeta(groupType).nameHint}
          </p>
          <button type="submit" className="eco-btn eco-btn-primary" disabled={submitting || !name.trim()} style={{ width: '100%' }}>
            {groupTypeMeta(groupType).createCta}
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
            Ask whoever created the group for their 6-character code.
          </p>
          <button type="submit" className="eco-btn eco-btn-primary" disabled={submitting || !inviteCode.trim()} style={{ width: '100%' }}>
            Join group
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

function ChallengeFocusPicker({ preferredChallengeCategory, onSaved }) {
  const [category, setCategory] = useState(preferredChallengeCategory || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCategory(preferredChallengeCategory || '');
  }, [preferredChallengeCategory]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await householdApi.setChallengeFocus(category || null);
      toast.success(category ? "Focus set for next week's challenge." : 'Back to an automatic focus.');
      onSaved?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not set that focus.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--rule)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '0.7rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ width: 220, flexShrink: 0 }}>
        <SelectField
          id="household-challenge-focus"
          label="Organizer: next week's focus"
          value={category}
          onChange={setCategory}
          placeholder="Auto (top category)"
          options={[
            { value: '', label: 'Auto (top category)' },
            ...CATEGORY_ORDER.map((key) => ({
              value: key,
              label: CATEGORY_META[key]?.label || formatCategory(key),
            })),
          ]}
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || category === (preferredChallengeCategory || '')}
        className="eco-btn eco-btn-outline"
        style={{ fontSize: '0.78rem', padding: '0.55rem 0.9rem' }}
      >
        Save
      </button>
    </div>
  );
}

function HouseholdChallengeCard({ groupType, isOwner, preferredChallengeCategory, onClaimed, onFocusSaved }) {
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
      toast.success(`${groupTypeMeta(groupType).challengeLabel} challenge claimed - everyone earned points!`);
      load();
      onClaimed?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not claim that challenge.'));
    } finally {
      setClaiming(false);
    }
  };

  if (!challenge) return null;

  const meta = groupTypeMeta(groupType);
  const groupLabel = meta.possessive;

  return (
    <div className="eco-card" style={{ marginBottom: '1.8rem' }}>
      <span className="eco-marker" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
        <Target size={14} /> This week's {meta.nounSingular} challenge
      </span>

      {!challenge.available ? (
        <p className="eco-text-muted" style={{ fontSize: '0.86rem', margin: 0 }}>
          Log a few entries as a group this week, and a shared target will appear here.
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.9rem', margin: '0 0 0.8rem' }}>
            Keep the {groupLabel} combined{' '}
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

      {/* Organizer-only, and only for classroom/workplace groups - a plain
          household never had this control, and keeps its exact original
          behaviour (always the auto top-emitting category). */}
      {groupType !== 'household' && isOwner && (
        <ChallengeFocusPicker preferredChallengeCategory={preferredChallengeCategory} onSaved={onFocusSaved} />
      )}
    </div>
  );
}

/** Classroom-organizer-only: link this classroom into a campus institution's
    aggregate view, or unlink it - see backend/routes/household.py's own
    set_institution_link and the Institution.jsx page this connects to. Never
    shown for a household or workplace group - see that route's own docstring
    for why an institution only ever aggregates classrooms. */
function InstitutionLinkCard({ institutionId, institutionName, onChanged }) {
  const { t } = useTranslation();
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLink = async (event) => {
    event.preventDefault();
    if (!inviteCode.trim() || submitting) return;
    setSubmitting(true);
    try {
      await householdApi.setInstitutionLink(inviteCode.trim());
      toast.success('Linked to the institution.');
      setInviteCode('');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not link with that code.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlink = async () => {
    setSubmitting(true);
    try {
      await householdApi.setInstitutionLink(null);
      toast.success('Unlinked from the institution.');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not unlink.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="eco-card" style={{ marginBottom: '1.8rem' }}>
      <span className="eco-marker" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
        <GraduationCap size={14} /> {t('institution.householdCard.heading')}
      </span>

      {institutionId ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.9rem', margin: 0 }}>
            {t('institution.householdCard.linkedToPrefix')}{' '}
            <strong>{institutionName || 'an institution'}</strong>{' '}
            {t('institution.householdCard.linkedToSuffix')}
          </p>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={submitting}
            className="eco-btn eco-btn-ghost"
            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Link2Off size={14} /> {t('institution.householdCard.unlink')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleLink} noValidate style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-floating" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <input
              type="text"
              id="institution-invite-code"
              className="form-control"
              placeholder="AB3XZQ"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              maxLength={6}
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
            />
            <label htmlFor="institution-invite-code">{t('institution.householdCard.inviteCodeLabel')}</label>
          </div>
          <button
            type="submit"
            className="eco-btn eco-btn-outline"
            disabled={submitting || !inviteCode.trim()}
            style={{ flexShrink: 0 }}
          >
            {t('institution.householdCard.linkButton')}
          </button>
        </form>
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
  const { t } = useTranslation();
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
    const meta = groupTypeMeta(data?.groupType);
    try {
      await householdApi.leave();
      toast.success(`Left the ${meta.nounSingular}.`);
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not leave that group.'));
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
        titleAccent={data.inHousehold ? groupTypeMeta(data.groupType).titleAccent : 'Household'}
        subtitle={
          data.inHousehold
            ? data.groupType === 'classroom'
              ? "A shared footprint and a leaderboard for your class or team."
              : data.groupType === 'workplace'
              ? 'A shared footprint and a leaderboard for your workplace or work team.'
              : 'A shared footprint and a leaderboard for the people you actually live with.'
            : 'A shared footprint and a leaderboard for your household — or your class, workplace, club, or team.'
        }
        action={
          data.inHousehold ? (
            <button type="button" onClick={handleLeave} className="eco-btn eco-btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <LogOut size={16} /> Leave
            </button>
          ) : null
        }
      />

      {!data.inHousehold ? (
        <>
          <CreateOrJoinPanel onChanged={load} />
          <p style={{ textAlign: 'center', margin: '1.4rem 0 0' }}>
            <Link
              to="/institution"
              className="eco-text-muted"
              style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <GraduationCap size={14} /> {t('institution.householdCard.discoveryLink')}
            </Link>
          </p>
        </>
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
                    combined this month · {data.memberCount}
                    {data.maxMembers ? `/${data.maxMembers}` : ''} {data.memberCount === 1 ? 'member' : 'members'}
                    {data.isOwner && (
                      <> · <span style={{ color: 'var(--eco-primary)' }}>you're the {groupTypeMeta(data.groupType).organizerTitle}</span></>
                    )}
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

          <HouseholdChallengeCard
            groupType={data.groupType}
            isOwner={data.isOwner}
            preferredChallengeCategory={data.preferredChallengeCategory}
            onFocusSaved={load}
          />

          {data.groupType === 'classroom' && data.isOwner && (
            <InstitutionLinkCard
              institutionId={data.institutionId}
              institutionName={data.institutionName}
              onChanged={load}
            />
          )}

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
