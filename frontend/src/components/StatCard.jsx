// EcoTrack/frontend/src/components/StatCard.jsx
// One reading on the instrument panel: a label, a number that counts up when it
// scrolls into view, and an optional trend comparing it to last month.
//
// A note on the trend colours, because it is the opposite of most dashboards:
// emissions going UP is bad news, so an increase is shown in red and a decrease
// in green. A sales dashboard would do the reverse.
//
// WHAT CHANGED
// This was a lifted card with a tinted rounded tile behind its icon and the
// figure set in bold Space Grotesk. It is a channel now - a reading hanging off
// its own hairline, exactly like the four constants on Home and the estimate on
// the Estimate page - and the figure is mono amber, because every measured
// value in this product is.
//
// The name is kept for the sake of its callers; what it renders is no longer a
// card. Renaming it would touch two pages for no gain.

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
 * @param {string}  accent              CSS colour for the icon
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
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: '0.95rem',
        borderTop: '1px solid var(--rule-strong)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '0.9rem',
        }}
      >
        <span className="eco-marker" style={{ letterSpacing: '0.1em' }}>
          {label}
        </span>

        {/* The 38px tinted tile is gone. It was chrome around a 19px glyph, and
            on a channel the icon can simply be the icon. */}
        {Icon && <Icon size={18} style={{ color: accent, flexShrink: 0 }} />}
      </div>

      {/* The number. The ref goes here so the count starts when this scrolls in. */}
      <div
        ref={counterRef}
        className="eco-readout"
        style={{
          fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {formatted}
        {unit && (
          <span
            className="eco-marker"
            style={{ fontSize: '0.42em', marginLeft: '0.35rem', letterSpacing: '0.08em' }}
          >
            {unit}
          </span>
        )}
      </div>

      {/* Trend line, pushed to the bottom so every reading in a row lines up */}
      <div style={{ marginTop: 'auto', paddingTop: '0.7rem' }}>
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
            <trendConfig.Icon size={14} style={{ flexShrink: 0 }} />
            {/* Math.abs because the arrow already shows the direction */}
            {change !== null && change !== undefined && (
              <strong>{Math.abs(change).toFixed(1)}%</strong>
            )}
            <span className="eco-text-muted">{trendConfig.word}</span>
          </div>
        ) : (
          hint && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                lineHeight: 1.5,
                color: 'var(--eco-text-muted)',
                opacity: 0.75,
              }}
            >
              {hint}
            </div>
          )
        )}
      </div>
    </motion.div>
  );
}
