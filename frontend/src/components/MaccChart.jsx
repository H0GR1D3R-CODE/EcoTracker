// EcoTrack/frontend/src/components/MaccChart.jsx
// A marginal abatement cost curve for one person: every available swap,
// ordered by EFFORT (not saving), building a running total of kgCO2 that
// could be avoided. Standard shape in climate policy analysis, applied here
// to an individual's own logged behaviour instead of a national economy -
// see backend/insights_engine.py:macc_curve for how the ordering and the
// cumulative total are built.

import { useRef } from 'react';
import { motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';
import { useInView } from '../hooks/useInView';
import { CATEGORY_META } from '../utils/emissionHelpers';
import { formatEmission, formatSubType } from '../utils/formatters';

const CHART_HEIGHT = 220;
const CHART_WIDTH = 100; // viewBox units, scales with the container

export default function MaccChart({ curve }) {
  const { prefersReducedMotion } = useTheme();
  const containerRef = useRef(null);
  const inView = useInView(containerRef, { threshold: 0.3 });

  if (!curve || curve.length === 0) return null;

  const maxCumulative = curve[curve.length - 1].cumulativeSavingKg || 1;
  const maxEffort = 5;

  const xFor = (effort) => (effort / maxEffort) * CHART_WIDTH;
  const yFor = (value) => CHART_HEIGHT - (value / maxCumulative) * CHART_HEIGHT;

  // A step-after path: flat at the previous cumulative level until this
  // swap's effort, then a vertical jump up by its own saving.
  let pathData = `M 0,${CHART_HEIGHT}`;
  let previousY = CHART_HEIGHT;
  const points = [];

  curve.forEach((swap) => {
    const x = xFor(swap.effort);
    const y = yFor(swap.cumulativeSavingKg);
    pathData += ` L ${x},${previousY} L ${x},${y}`;
    points.push({ x, y, swap });
    previousY = y;
  });
  pathData += ` L ${CHART_WIDTH},${previousY}`;

  return (
    <div ref={containerRef}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: CHART_HEIGHT }}
      >
        {/* effort gridlines */}
        {[1, 2, 3, 4, 5].map((effort) => (
          <line
            key={effort}
            x1={xFor(effort)}
            y1={0}
            x2={xFor(effort)}
            y2={CHART_HEIGHT}
            stroke="var(--rule)"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <motion.path
          d={pathData}
          fill="none"
          stroke="var(--eco-primary)"
          strokeWidth={1.4}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={prefersReducedMotion ? false : { pathLength: 0 }}
          animate={inView || prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] }}
        />

        {points.map(({ x, y, swap }, index) => {
          const meta = CATEGORY_META[swap.category];
          return (
            <motion.circle
              key={swap.id}
              cx={x}
              cy={y}
              r={1.6}
              fill={meta ? meta.color : 'var(--eco-primary)'}
              stroke="var(--eco-bg)"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: inView || prefersReducedMotion ? 1 : 0 }}
              transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.15 * index + 0.6 }}
            >
              <title>
                {formatSubType(swap.fromSubType)} → {formatSubType(swap.toSubType)}: −{formatEmission(swap.savingKg)},
                effort {swap.effort}/5
              </title>
            </motion.circle>
          );
        })}
      </svg>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.7rem',
          color: 'var(--eco-text-muted)',
          marginTop: '0.4rem',
        }}
      >
        <span>Trivial effort</span>
        <span>Big commitment</span>
      </div>

      <p className="eco-text-muted" style={{ fontSize: '0.85rem', marginTop: '0.8rem' }}>
        Every swap adopted, ordered from easiest to hardest, adds up to{' '}
        <strong style={{ color: 'var(--eco-primary)' }}>{formatEmission(maxCumulative)}</strong> a month.
      </p>
    </div>
  );
}
