// EcoTrack/frontend/src/pages/Institution.jsx
// A tier above a classroom group (see Household.jsx) - a campus green cell
// or eco-club lead running several classrooms as one institution.
//
// AGGREGATE-ONLY, ON PURPOSE - see backend/routes/institution.py's own
// module docstring for the full reasoning: a coordinator here sits outside
// every classroom they can see, so this page never renders a single
// student's name or record - only per-classroom totals the backend has
// already reduced individual members down to before this component ever
// receives them. If you are looking for the member-by-member leaderboard,
// that is Household.jsx; this page is one tier up from it.
//
// Mounted at /institution

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Copy, GraduationCap, Trash2, Users } from 'lucide-react';

import { institutionApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import PageBanner from '../components/PageBanner';
import SkeletonCard from '../components/SkeletonCard';
import { formatEmission, formatNumber } from '../utils/formatters';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function CreatePanel({ onChanged }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await institutionApi.create(name.trim());
      toast.success('Institution created.');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create that institution.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="eco-card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <p className="eco-text-muted" style={{ fontSize: '0.86rem', margin: '0 0 1.2rem' }}>
        {t('institution.createExplainer')}
      </p>
      <form onSubmit={handleCreate} noValidate>
        <div className="form-floating" style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            id="institution-name"
            className="form-control"
            placeholder="Christ University - BCA Green Cell"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
          <label htmlFor="institution-name">{t('institution.nameLabel')}</label>
        </div>
        <button type="submit" className="eco-btn eco-btn-primary" disabled={submitting || !name.trim()} style={{ width: '100%' }}>
          {t('institution.createButton')}
        </button>
      </form>
    </div>
  );
}

function ClassroomRow({ classroom, rank, onRemove, removing }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.9rem',
        paddingTop: '0.8rem',
        marginTop: rank === 0 ? 0 : '0.8rem',
        borderTop: rank === 0 ? 'none' : '1px solid var(--rule)',
      }}
    >
      <span style={{ width: 28, textAlign: 'center', fontSize: '1rem', flexShrink: 0 }}>
        {RANK_MEDALS[rank] || `#${rank + 1}`}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: '0.92rem', display: 'block' }}>{classroom.name}</span>
        <p className="eco-text-muted" style={{ fontSize: '0.76rem', margin: '0.15rem 0 0' }}>
          {classroom.memberCount} {classroom.memberCount === 1 ? 'member' : 'members'} ·{' '}
          {formatEmission(classroom.combinedEmissionThisMonthKg)} this month
        </p>
      </div>

      <span
        className="eco-readout"
        style={{
          fontSize: '0.95rem',
          fontWeight: 700,
          padding: '0.3rem 0.8rem',
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--eco-primary) 14%, transparent)',
          border: '1px solid color-mix(in srgb, var(--eco-primary) 30%, transparent)',
          color: 'var(--eco-primary)',
          flexShrink: 0,
        }}
      >
        {formatNumber(classroom.avgRewardPoints, 1)}
        <span style={{ fontSize: '0.62rem', fontWeight: 600, opacity: 0.85, marginLeft: 3 }}>avg pts</span>
      </span>

      <button
        type="button"
        onClick={() => onRemove(classroom)}
        disabled={removing === classroom.id}
        aria-label={`${t('institution.unlinkAction')}: ${classroom.name}`}
        title={t('institution.unlinkAction')}
        className="eco-btn eco-btn-ghost"
        style={{ padding: '0.35rem', flexShrink: 0 }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function Institution() {
  const { t } = useTranslation();
  const { prefersReducedMotion } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const load = () => {
    institutionApi
      .get()
      .then(setData)
      .catch(() => setData({ hasInstitution: false }))
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

  const handleRemoveClassroom = async (classroom) => {
    setRemovingId(classroom.id);
    try {
      await institutionApi.removeClassroom(classroom.id);
      toast.success(`Unlinked ${classroom.name}.`);
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not unlink that classroom.'));
    } finally {
      setRemovingId(null);
    }
  };

  const handleDisband = async () => {
    try {
      await institutionApi.remove();
      toast.success('Institution disbanded.');
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not disband that institution.'));
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
        photo="institutionClassroom"
        alt="An empty classroom lit by late-afternoon sun"
        color="var(--cat-diet)"
        icon={GraduationCap}
        eyebrow={t('institution.eyebrow')}
        title="Your"
        titleAccent={t('institution.titleAccent')}
        subtitle={
          data.hasInstitution
            ? t('institution.subtitleHasInstitution')
            : t('institution.subtitleNoInstitution')
        }
        action={
          data.hasInstitution ? (
            <button
              type="button"
              onClick={handleDisband}
              className="eco-btn eco-btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Trash2 size={16} /> {t('institution.disband')}
            </button>
          ) : null
        }
      />

      {!data.hasInstitution ? (
        <CreatePanel onChanged={load} />
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
              border: '1px solid color-mix(in srgb, var(--cat-diet) 24%, var(--eco-border))',
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
                    combined this month · {data.classroomCount}
                    {data.maxClassrooms ? `/${data.maxClassrooms}` : ''}{' '}
                    {data.classroomCount === 1 ? 'classroom' : 'classrooms'} · {data.totalMembers}{' '}
                    {data.totalMembers === 1 ? 'student' : 'students'} in total
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span className="eco-marker" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.68rem' }}>
                  {t('institution.inviteCodeLabel')}
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
                <p className="eco-text-muted" style={{ fontSize: '0.72rem', margin: '0.4rem 0 0', maxWidth: 200 }}>
                  {t('institution.inviteCodeHint')}
                </p>
              </div>
            </div>
          </div>

          <div className="eco-card">
            <span className="eco-marker" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.1rem' }}>
              <Users size={14} /> {t('institution.classroomsHeading')}
            </span>
            {data.classrooms.length === 0 ? (
              <p className="eco-text-muted" style={{ fontSize: '0.88rem', margin: 0 }}>
                {t('institution.emptyClassrooms')}
              </p>
            ) : (
              data.classrooms.map((classroom, index) => (
                <ClassroomRow
                  key={classroom.id}
                  classroom={classroom}
                  rank={index}
                  onRemove={handleRemoveClassroom}
                  removing={removingId}
                />
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
