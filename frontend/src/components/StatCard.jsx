// EcoTrack/frontend/src/components/StatCard.jsx
// One statistic on the dashboard: a label, a number that counts up when it
// scrolls into view, and an optional trend arrow comparing it to last month.
//
// A note on the trend colours, because it is the opposite of most dashboards:
// emissions going UP is bad news, so an increase is shown in red and a decrease
// in green. A sales dashboard would do the reverse.

import { motion } from 'framer-motion';
import { Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';

import { useCounter } from '../hooks/useCounter';
import { useTheme } from '../context/ThemeContext';

/**
 * @param {React.ElementType} icon      a lucide-react icon component
 * @param {string}  label               what the number means
 * @param {number}  value               the number itself
 * @param {string}  unit                shown after the number, e.g. "kg"
 * @param {string}  trend               'up' | 'down' | 'same' | 'new'
 * @param {number}  change              percentage change, or null
 * @param {string}  accent              CSS colour for the icon tile
 * @param {string}  hint                small print under the number
 * @param {number}  decimals            decimal places
 * @param {number}  delay               entrance delay in seconds
 */
export default function StatCard({
  icon: Icon,
  label,
  value = 0,
  unit = '',
  trend = null,
  change = null,
  accent = 'var(--eco-primary)',
  hint = '',
  decimals = 1,
  delay = 0,
}) {
  const { prefersReducedMotion } = useTheme();
  const [counterRef, formatted] = useCounter(value, { decimals, duration: 1400 });

  // Work out how to describe the trend. "up" means emissions increased.
  const trendConfig = {
    up: { Icon: TrendingUp, color: 'var(--eco-danger)', word: 'more than last month' },
    down: { Icon: TrendingDown, color: 'var(--eco-primary)', word: 'less than last month' },
    same: { Icon: Minus, color: 'var(--eco-text-muted)', word: 'same as last month' },
    new: { Icon: Sparkles, color: 'var(--eco-text-muted)', word: 'no data to compare yet' },
  }[trend];

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="eco-card eco-card-hover"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}
      >
        <span
          className="eco-text-muted"
          style={{
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          {label}
        </span>

        {Icon && (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              // Appending a hex alpha value tints the accent colour to ~10%
              background: `${accent}1A`,
              color: accent,
            }}
          >
            <Icon size={19} />
          </div>
        )}
      </div>

      {/* The number. The ref goes here so the count starts when this scrolls in. */}
      <div
        ref={counterRef}
        style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 'clamp(1.55rem, 3vw, 2.1rem)',
          fontWeight: 700,
          lineHeight: 1.15,
          marginTop: '0.9rem',
          whiteSpace: 'nowrap',
        }}
      >
        {formatted}
        {unit && (
          <span
            className="eco-text-muted"
            style={{ fontSize: '0.55em', fontWeight: 600, marginLeft: '0.25rem' }}
          >
            {unit}
          </span>
        )}
      </div>

      {/* Trend line, pushed to the bottom so every card in a row lines up */}
      <div style={{ marginTop: 'auto', paddingTop: '0.6rem' }}>
        {trendConfig ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              color: trendConfig.color,
            }}
          >
            <trendConfig.Icon size={14} />
            {/* Math.abs because the arrow already shows the direction */}
            {change !== null && change !== undefined && (
              <strong>{Math.abs(change).toFixed(1)}%</strong>
            )}
            <span className="eco-text-muted">{trendConfig.word}</span>
          </div>
        ) : (
          hint && (
            <div className="eco-text-muted" style={{ fontSize: '0.8rem' }}>
              {hint}
            </div>
          )
        )}
      </div>
    </motion.div>
  );
}
