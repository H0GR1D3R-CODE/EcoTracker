// EcoTrack/frontend/src/components/ForecastGauge.jsx
// The month-end emissions forecast: a self-drawing burn-down line against
// the climate-safe budget, with a widening uncertainty cone for the days
// still to come. See backend/insights_engine.py:forecast_month for the maths.
//
// Two sizes: the full version on /insights (the burn-down chart + ring +
// every figure), and a `compact` version for the Dashboard that shows just
// the ring and the headline numbers - the chart earns its space on the page
// built around it, not as a fourth stat card.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { AlertTriangle, CalendarClock } from 'lucide-react';

import { insightsApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { useIntervention } from '../hooks/useIntervention';
import GoalRing from './GoalRing';
import { SkeletonLine } from './SkeletonCard';
import { formatEmission, formatNumber } from '../utils/formatters';

const CONFETTI_COLORS = ['#2e6a4a', '#2c6577', '#8a5116', '#6a5480'];

function celebrateOnBudget() {
  confetti({
    particleCount: 60,
    spread: 65,
    startVelocity: 38,
    ticks: 200,
    colors: CONFETTI_COLORS,
    disableForReducedMotion: true,
    origin: { x: 0.5, y: 0.55 },
  });
}

/**
 * The burn-down chart: an actual-so-far line that draws itself, a dashed
 * projection to month-end, a widening cone for the prediction interval, and
 * a dashed budget line.
 */
function BurnDownChart({ forecast, prefersReducedMotion }) {
  const { dailySeries, projected, lower, upper, budget, daysElapsed, daysRemaining } = forecast;
  const daysInMonth = daysElapsed + daysRemaining;

  const maxY = Math.max(budget, upper || projected, ...dailySeries.map((d) => d.cumulative)) * 1.12 || 1;

  const xFor = (day) => (day / daysInMonth) * 100;
  const yFor = (value) => 100 - (value / maxY) * 100;

  const actualPoints = dailySeries.map((point) => `${xFor(point.day)},${yFor(point.cumulative)}`).join(' ');

  const lastActual = dailySeries[dailySeries.length - 1] || { day: daysElapsed, cumulative: 0 };
  const projectionLine = `${xFor(lastActual.day)},${yFor(lastActual.cumulative)} ${xFor(daysInMonth)},${yFor(projected)}`;

  const conePath =
    lower !== null && upper !== null
      ? `M ${xFor(lastActual.day)},${yFor(lastActual.cumulative)} L ${xFor(daysInMonth)},${yFor(upper)} L ${xFor(daysInMonth)},${yFor(lower)} Z`
      : null;

  const budgetY = yFor(budget);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 220 }} aria-hidden="true">
      {/* budget line */}
      <line
        x1={0}
        y1={budgetY}
        x2={100}
        y2={budgetY}
        stroke="var(--rule-strong)"
        strokeWidth={0.6}
        strokeDasharray="2,2"
        vectorEffect="non-scaling-stroke"
      />

      {/* uncertainty cone */}
      {conePath && (
        <motion.path
          d={conePath}
          fill="var(--eco-primary)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.9 }}
        />
      )}

      {/* projection (dashed) */}
      <motion.polyline
        points={projectionLine}
        fill="none"
        stroke="var(--eco-text-muted)"
        strokeWidth={0.9}
        strokeDasharray="2.4,2"
        vectorEffect="non-scaling-stroke"
        initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.7, delay: prefersReducedMotion ? 0 : 0.75 }}
      />

      {/* the real burn-down line, drawing itself */}
      {dailySeries.length > 1 && (
        <motion.polyline
          points={actualPoints}
          fill="none"
          stroke="var(--readout)"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={prefersReducedMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </svg>
  );
}

export default function ForecastGauge({ compact = false }) {
  const { prefersReducedMotion } = useTheme();
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);
  const celebratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    insightsApi
      .getForecast()
      .then((data) => {
        if (!cancelled) setForecast(data);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, 'Could not load your forecast.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { dismiss } = useIntervention({ existingId: forecast?.interventionId });

  const percentUsed =
    forecast && forecast.projected !== null ? Math.min(100, (forecast.actualToDate / forecast.budget) * 100) : 0;
  const percentProjected =
    forecast && forecast.projected !== null ? (forecast.projected / forecast.budget) * 100 : 0;

  useEffect(() => {
    if (!forecast || forecast.status !== 'ok' || celebratedRef.current) return;
    if (forecast.projected <= forecast.budget) {
      celebratedRef.current = true;
      celebrateOnBudget();
    }
  }, [forecast]);

  if (error) {
    return <p className="eco-text-muted" style={{ fontSize: '0.85rem' }}>{error}</p>;
  }

  if (!forecast) {
    return (
      <div>
        <SkeletonLine width="40%" height={16} style={{ marginBottom: '1rem' }} />
        <SkeletonLine width="100%" height={compact ? 100 : 200} />
      </div>
    );
  }

  if (forecast.status === 'no_data') {
    return (
      <p className="eco-text-muted" style={{ fontSize: '0.9rem' }}>
        Log a few entries in the Calculator and your month-end forecast will appear here.
      </p>
    );
  }

  const overBudget = forecast.projected !== null && forecast.projected > forecast.budget;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? '1.2rem' : '2rem',
          flexWrap: 'wrap',
        }}
      >
        <GoalRing
          percent={forecast.status === 'insufficient_history' ? percentUsed : percentProjected}
          size={compact ? 96 : 140}
          strokeWidth={compact ? 8 : 11}
          invert
          label={`${Math.round(forecast.status === 'insufficient_history' ? percentUsed : percentProjected)}%`}
          sublabel="of budget"
        />

        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="eco-marker" style={{ marginBottom: '0.4rem' }}>
            Logged so far
          </div>
          <div className="eco-readout" style={{ fontSize: compact ? '1.4rem' : '1.9rem', fontWeight: 500 }}>
            {formatEmission(forecast.actualToDate)}
          </div>

          {forecast.status === 'ok' && (
            <p className="eco-text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Projected {formatEmission(forecast.projected)} by month end
              {forecast.lower !== null && (
                <> ({formatNumber(forecast.lower, 0)}–{formatNumber(forecast.upper, 0)} kg, 80% likely)</>
              )}
              .
            </p>
          )}

          {forecast.status === 'insufficient_history' && (
            <p className="eco-text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Keep logging — a confident forecast needs about a month of history
              ({forecast.historyDays} day{forecast.historyDays === 1 ? '' : 's'} so far).
            </p>
          )}
        </div>
      </div>

      {!compact && forecast.status === 'ok' && (
        <div style={{ marginTop: '1.6rem' }}>
          {/* One plain-English sentence before the chart, not just prose
              underneath it - a first look at four different line/area
              styles with no on-chart key was confirmed confusing on its
              own; this plus the legend below are the fix, not a redesign
              of the chart itself. */}
          <p className="eco-text-muted" style={{ fontSize: '0.83rem', marginBottom: '0.9rem', maxWidth: '52ch' }}>
            The solid line is what you've actually logged this month. The
            rest projects where it's headed if you keep going at the same pace.
          </p>

          <BurnDownChart forecast={forecast} prefersReducedMotion={prefersReducedMotion} />

          {/* The legend the chart itself never had - four lines/areas is a
              lot to decode from body copy alone, so each one gets its exact
              swatch here, in the same order they appear top-to-bottom in
              the SVG. */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              marginTop: '0.8rem',
              fontSize: '0.74rem',
              color: 'var(--eco-text-muted)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: 14, height: 2, background: 'var(--readout)', display: 'inline-block' }} />
              Logged so far
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <svg width="14" height="2" style={{ flexShrink: 0 }}>
                <line x1="0" y1="1" x2="14" y2="1" stroke="var(--eco-text-muted)" strokeWidth="2" strokeDasharray="3,2" />
              </svg>
              Projected
            </span>
            {forecast.lower !== null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 14, height: 9, background: 'var(--eco-primary)', opacity: 0.25, display: 'inline-block' }} />
                Likely range (80%)
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <svg width="14" height="2" style={{ flexShrink: 0 }}>
                <line x1="0" y1="1" x2="14" y2="1" stroke="var(--rule-strong)" strokeWidth="2" strokeDasharray="2,2" />
              </svg>
              Your budget
            </span>
          </div>
        </div>
      )}

      {!compact && forecast.status === 'ok' && overBudget && forecast.daysUntilBudgetExhausted !== null && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.7rem',
            marginTop: '1.4rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--rule-strong)',
          }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--eco-danger)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '0.85rem', flex: 1 }}>
            At this pace, you'll cross your budget in{' '}
            <strong>{forecast.daysUntilBudgetExhausted} day{forecast.daysUntilBudgetExhausted === 1 ? '' : 's'}</strong>.
            The swap ideas below could help.
          </p>
          <button type="button" className="eco-btn eco-btn-ghost" style={{ fontSize: '0.8rem' }} onClick={dismiss}>
            Got it
          </button>
        </motion.div>
      )}

      {!compact && forecast.status === 'ok' && !overBudget && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginTop: '1.4rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--rule-strong)',
            color: 'var(--eco-primary)',
            fontSize: '0.85rem',
          }}
        >
          <CalendarClock size={16} />
          On track to stay under budget this month.
        </div>
      )}
    </div>
  );
}
