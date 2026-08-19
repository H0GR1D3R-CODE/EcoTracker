// EcoTrack/frontend/src/components/SwapCard.jsx
// One counterfactual recommendation: "swap X for Y, save Z kg" - collapsed to
// the headline, expands to the full arithmetic and its citation. The
// citation is the whole explainability claim (see insights_engine.py's
// generate_swaps docstring), so it is never hidden more than one tap away.

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, X } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';
import { useIntervention } from '../hooks/useIntervention';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import { CATEGORY_META } from '../utils/emissionHelpers';
import { formatEmission, formatNumber, formatSubType } from '../utils/formatters';

const EFFORT_LABELS = { 1: 'Trivial', 2: 'Easy', 3: 'Moderate', 4: 'A real change', 5: 'Big commitment' };

export default function SwapCard({ swap, delay = 0 }) {
  const { prefersReducedMotion } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [decided, setDecided] = useState(null); // null | 'accepted' | 'dismissed'

  const { accept, dismiss } = useIntervention({
    type: 'swap_item',
    variant: swap.id,
    payloadSummary: { category: swap.category, from: swap.fromSubType, to: swap.toSubType },
    projectedSavingKg: swap.savingKg,
  });

  const meta = CATEGORY_META[swap.category];
  const Icon = CATEGORY_ICONS[swap.category];

  const handleDecision = (action) => {
    setDecided(action);
    if (action === 'accepted') accept(-swap.savingKg);
    else dismiss();
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="eco-card"
      style={{ opacity: decided === 'dismissed' ? 0.5 : 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
        {Icon && (
          <div style={{ color: meta.color, flexShrink: 0, marginTop: 2 }}>
            <Icon size={20} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.95rem' }}>
            <span>{formatSubType(swap.fromSubType)}</span>
            <ArrowRight size={14} style={{ color: 'var(--eco-text-muted)' }} />
            <strong>{formatSubType(swap.toSubType)}</strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span className="eco-readout" style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--eco-primary)' }}>
              −{formatEmission(swap.savingKg)}
            </span>
            <span className="eco-text-muted" style={{ fontSize: '0.78rem' }}>
              / month · {EFFORT_LABELS[swap.effort] || 'Moderate'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="eco-btn eco-btn-ghost"
            style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', marginTop: '0.4rem', marginLeft: '-0.5rem' }}
          >
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'inline-flex' }}
            >
              <ChevronDown size={14} />
            </motion.span>
            {expanded ? 'Hide the maths' : 'Show the maths'}
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
                style={{ overflow: 'hidden' }}
              >
                <div
                  style={{
                    marginTop: '0.6rem',
                    paddingTop: '0.8rem',
                    borderTop: '1px solid var(--rule)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    lineHeight: 1.9,
                    color: 'var(--eco-text-muted)',
                  }}
                >
                  <div>
                    Shifting {formatNumber(swap.feasibility * 100, 0)}% of {formatNumber(swap.monthlyQuantity, 0)}{' '}
                    {swap.unit}/mo from {formatSubType(swap.fromSubType)} to {formatSubType(swap.toSubType)}:
                  </div>
                  <div>
                    {formatNumber(swap.monthlyQuantity * swap.feasibility, 1)} {swap.unit} ×{' '}
                    ({swap.factorFrom} − {swap.factorTo}) kgCO₂/{swap.unit} = {formatNumber(swap.savingKg, 2)} kg
                  </div>
                  <div style={{ marginTop: '0.4rem' }}>
                    {formatSubType(swap.fromSubType)}: {swap.factorFrom} kgCO₂/{swap.unit} · {swap.factorFromSource}
                  </div>
                  <div>
                    {formatSubType(swap.toSubType)}: {swap.factorTo} kgCO₂/{swap.unit} · {swap.factorToSource}
                  </div>
                  <div style={{ marginTop: '0.4rem' }}>≈ {formatEmission(swap.annualSavingKg)} / year</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {decided === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
            <button
              type="button"
              className="eco-btn eco-btn-outline"
              style={{ padding: '0.4rem 0.6rem' }}
              onClick={() => handleDecision('accepted')}
              aria-label="Add to my plan"
            >
              <Check size={15} />
            </button>
            <button
              type="button"
              className="eco-btn eco-btn-ghost"
              style={{ padding: '0.4rem 0.6rem' }}
              onClick={() => handleDecision('dismissed')}
              aria-label="Not for me"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <span className="eco-marker" style={{ color: decided === 'accepted' ? 'var(--eco-primary)' : 'var(--eco-text-muted)' }}>
            {decided === 'accepted' ? 'In your plan' : 'Dismissed'}
          </span>
        )}
      </div>
    </motion.div>
  );
}
