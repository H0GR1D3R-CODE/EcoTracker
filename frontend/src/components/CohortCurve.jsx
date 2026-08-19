// EcoTrack/frontend/src/components/CohortCurve.jsx
// Where this user's month sits among others in their region - a distribution
// curve built from the 9 decile thresholds GET /api/insights/cohort returns
// (never anything finer, and never shown at all below the k-anonymity floor
// of 10 people - see backend/insights_engine.py:cohort_deciles). Because the
// only real data points are those 9 percentile thresholds, this draws the
// honest thing they describe - a cumulative distribution curve - rather than
// faking a smooth bell-shaped density the data does not actually support.
//
// BOOMERANG-EFFECT AWARE FRAMING: someone already below the cohort mean gets
// an approving caption, not a bare "you're below average" comparison -
// see routes/insights.py's `variant` field and its docstring for why.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { insightsApi } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { useInView } from '../hooks/useInView';
import { formatEmission } from '../utils/formatters';

const CHART_WIDTH = 100;
const CHART_HEIGHT = 100;

/** A smoothed path through evenly-spaced (value, percentile) points. */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    d += ` Q ${current.x},${current.y} ${midX},${(current.y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x},${last.y}`;
  return d;
}

export default function CohortCurve() {
  const { prefersReducedMotion } = useTheme();
  const [cohort, setCohort] = useState(null);
  const containerRef = useRef(null);
  const inView = useInView(containerRef, { threshold: 0.3 });

  useEffect(() => {
    let cancelled = false;
    insightsApi
      .getCohort()
      .then((data) => {
        if (!cancelled) setCohort(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cohort) return null;

  if (cohort.status === 'insufficient_cohort') {
    return (
      <p className="eco-text-muted" style={{ fontSize: '0.85rem' }}>
        Not enough people in your region are tracking yet to show a fair comparison
        (needs at least 10, currently {cohort.n ?? 0}).
      </p>
    );
  }

  const values = cohort.deciles;
  const minValue = values[0] * 0.85;
  const maxValue = values[values.length - 1] * 1.05 || 1;
  const xFor = (value) => ((value - minValue) / (maxValue - minValue || 1)) * CHART_WIDTH;
  const yFor = (percentile) => CHART_HEIGHT - (percentile / 100) * CHART_HEIGHT;

  const points = values.map((value, index) => ({ x: xFor(value), y: yFor((index + 1) * 10) }));
  const path = smoothPath(points);

  const markerX = Math.max(0, Math.min(CHART_WIDTH, xFor(cohort.myTotal)));
  const markerY = yFor(cohort.percentile);

  const caption = cohort.belowMean
    ? `You're already emitting less than most people in ${cohort.region} this month — keep it up.`
    : `You're emitting more than ${cohort.percentile}% of people in ${cohort.region} this month.`;

  return (
    <div ref={containerRef}>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" style={{ width: '100%', height: 160 }}>
        <motion.path
          d={path}
          fill="none"
          stroke="var(--eco-text-muted)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          initial={prefersReducedMotion ? false : { pathLength: 0 }}
          animate={inView || prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
        />

        <line x1={markerX} y1={0} x2={markerX} y2={CHART_HEIGHT} stroke="var(--rule)" strokeWidth={0.6} strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />

        <motion.circle
          cx={markerX}
          cy={markerY}
          r={2.2}
          fill={cohort.belowMean ? 'var(--eco-primary)' : 'var(--readout)'}
          stroke="var(--eco-bg)"
          strokeWidth={0.8}
          vectorEffect="non-scaling-stroke"
          initial={prefersReducedMotion ? false : { scale: 0, x: -50 }}
          animate={inView || prefersReducedMotion ? { scale: 1, x: markerX - 50 } : {}}
          style={{ transformOrigin: 'center' }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.9, delay: prefersReducedMotion ? 0 : 0.5, type: 'spring', stiffness: 120 }}
        />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--eco-text-muted)', marginBottom: '0.8rem' }}>
        <span>Lower emitters</span>
        <span>Higher emitters</span>
      </div>

      <p style={{ fontSize: '0.9rem', margin: 0 }}>
        {caption} You're at <strong>{formatEmission(cohort.myTotal)}</strong>, based on {cohort.n} people.
      </p>
    </div>
  );
}
