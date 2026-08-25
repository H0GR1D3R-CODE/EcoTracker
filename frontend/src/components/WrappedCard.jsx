// EcoTrack/frontend/src/components/WrappedCard.jsx
// The "Carbon Wrapped" recap - a shareable period summary opened from
// Dashboard.jsx. Every stat here comes straight from GET /api/wrapped
// (routes/wrapped.py); this component does no calculation of its own,
// same rule the rest of the app follows for anything emissions-related.
//
// Two nested surfaces on purpose: `cardRef` wraps ONLY the shareable card
// itself (stats + branding footer) so the downloaded PNG never includes the
// Download/Close chrome around it.
//
// A position:fixed, inset:0 overlay - the exact pattern already fixed in
// Home.jsx's category-detail modal for the AnimatePresence exit-animation
// bug documented across this codebase (App.jsx, Home.jsx, SelectField.jsx
// and others): a plain conditional with enter-only motion, never
// AnimatePresence + exit=, or a stuck exit here would block the whole page.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import toast from 'react-hot-toast';
import { Download, Sprout, TrendingDown, TrendingUp, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { wrappedApi, getErrorMessage } from '../utils/api';
import { CATEGORY_META } from '../utils/emissionHelpers';
import { formatCategory, formatEmission, formatNumber } from '../utils/formatters';
import { PHOTOS } from '../utils/photos';
import Photo from './Photo';

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

function StatRow({ label, children }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '0.8rem',
        paddingTop: '0.7rem',
        marginTop: '0.7rem',
        borderTop: '1px solid var(--rule)',
      }}
    >
      <span className="eco-marker" style={{ fontSize: '0.7rem' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  );
}

export default function WrappedCard({ onClose }) {
  const { profile } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const cardRef = useRef(null);

  const today = new Date();
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    wrappedApi
      .get(period, today.getFullYear(), today.getMonth() + 1)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your recap.'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      // toPng() has no built-in timeout of its own - it depends on fetching
      // the card's photo and fonts, and a slow or dropped connection there
      // would otherwise leave this button reading "Preparing image..."
      // forever with no way out.
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      );
      const dataUrl = await Promise.race([
        toPng(cardRef.current, { pixelRatio: 2, cacheBust: true }),
        timeout,
      ]);
      const link = document.createElement('a');
      link.download = `ecotrack-wrapped-${(data?.label || period).replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast.error('Could not create the image. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  const firstName = profile?.name?.split(' ')[0] || 'You';

  return (
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1060,
        background: 'rgba(0,0,0,0.66)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.2rem',
        overflowY: 'auto',
      }}
    >
      <motion.div
        onClick={(event) => event.stopPropagation()}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 440 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
          <div role="radiogroup" aria-label="Recap period" style={{ display: 'flex', gap: '0.5rem' }}>
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={period === option.value}
                onClick={() => setPeriod(option.value)}
                className={`eco-btn ${period === option.value ? 'eco-btn-primary' : 'eco-btn-outline'}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="eco-btn eco-btn-ghost"
            style={{ padding: '0.4rem' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ===== the shareable card itself - only this ref gets exported ===== */}
        <div
          ref={cardRef}
          className="eco-card"
          style={{ padding: 0, overflow: 'hidden', background: 'var(--eco-card)' }}
        >
          <div className="eco-photo-zoom" style={{ height: 120, overflow: 'hidden' }}>
            <Photo
              id={PHOTOS.goldenHourField}
              alt="A sunlit open field at golden hour"
              width={900}
              color="var(--readout)"
              className="eco-photo-cover"
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>

          <div style={{ padding: 'var(--space-6)' }}>
            {error && (
              <p className="eco-text-muted" style={{ fontSize: '0.85rem' }}>{error}</p>
            )}

            {!error && !data && (
              <p className="eco-text-muted" style={{ fontSize: '0.85rem' }}>Loading your recap…</p>
            )}

            {data && (
              <>
                <span className="eco-marker" style={{ display: 'block', marginBottom: '0.3rem' }}>
                  {firstName}'s recap
                </span>
                <div className="eco-readout" style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                  {data.label}
                </div>

                <div style={{ marginTop: '1.1rem', display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                  <span className="eco-readout" style={{ fontSize: '2rem', fontWeight: 600 }}>
                    {formatEmission(data.totalEmissionKg)}
                  </span>
                  {data.changePercent !== null && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.8rem',
                        color: data.changePercent <= 0 ? 'var(--eco-primary)' : 'var(--eco-danger)',
                      }}
                    >
                      {data.changePercent <= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                      {formatNumber(Math.abs(data.changePercent), 1)}% vs last {data.period}
                    </span>
                  )}
                </div>
                <p className="eco-text-muted" style={{ fontSize: '0.78rem', margin: '0.3rem 0 0' }}>
                  {data.entryCount} {data.entryCount === 1 ? 'entry' : 'entries'} logged
                </p>

                {data.topCategory && (
                  <StatRow label="Biggest category">
                    <span style={{ color: CATEGORY_META[data.topCategory.category]?.color }}>
                      {CATEGORY_META[data.topCategory.category]?.label || formatCategory(data.topCategory.category)}
                    </span>
                    {' · '}
                    {formatEmission(data.topCategory.totalKg)}
                  </StatRow>
                )}

                {data.mostImprovedCategory && (
                  <StatRow label="Most improved">
                    <span style={{ color: 'var(--eco-primary)' }}>
                      {CATEGORY_META[data.mostImprovedCategory.category]?.label
                        || formatCategory(data.mostImprovedCategory.category)}
                    </span>
                    {' · down '}
                    {formatNumber(data.mostImprovedCategory.dropPercent, 0)}%
                  </StatRow>
                )}

                <StatRow label="Longest streak">
                  {data.longestStreakInPeriod} {data.longestStreakInPeriod === 1 ? 'day' : 'days'}
                </StatRow>

                {data.bestDay && (
                  <StatRow label="Lightest day">
                    {formatEmission(data.bestDay.totalKg)}
                  </StatRow>
                )}

                {data.swapsAccepted > 0 && (
                  <StatRow label="Recommendations acted on">
                    {data.swapsAccepted}
                  </StatRow>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.6rem',
                    marginTop: '1.2rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--rule-strong)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }} className="eco-text-muted">
                    <Sprout size={14} /> {formatNumber(data.totalPoints, 0)} lifetime points · {data.stageLabel}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '1rem',
                    paddingTop: '0.8rem',
                    borderTop: '1px solid var(--rule)',
                  }}
                >
                  <span className="eco-marker" style={{ fontSize: '0.68rem', color: 'var(--eco-primary)' }}>
                    EcoTrack
                  </span>
                  <span className="eco-text-muted" style={{ fontSize: '0.68rem' }}>
                    {firstName} · {data.label}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {data && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="eco-btn eco-btn-primary"
            style={{ width: '100%', marginTop: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Download size={16} />
            {downloading ? 'Preparing image…' : 'Download image'}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
