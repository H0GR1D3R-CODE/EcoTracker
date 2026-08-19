// EcoTrack/frontend/src/components/ScenarioSandbox.jsx
// Drag a slider per swap, watch the projected month total recompute
// INSTANTLY - entirely client-side, through scenarioMath.js's mirror of the
// server's own formula (see that file's header comment). No request fires
// while dragging; POST /api/insights/simulate is only called, debounced,
// to confirm the client's arithmetic actually matches the server - the
// authoritative source once anything is saved, never the sandbox itself.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { insightsApi } from '../utils/api';
import { applySlidersToBaseline } from '../utils/scenarioMath';
import { useTheme } from '../context/ThemeContext';
import { useCounter } from '../hooks/useCounter';
import { formatEmission, formatSubType } from '../utils/formatters';

const VERIFY_DEBOUNCE_MS = 700;

export default function ScenarioSandbox({ swaps, baselineTotal, month }) {
  const { prefersReducedMotion } = useTheme();

  const [positions, setPositions] = useState(() =>
    Object.fromEntries(swaps.map((swap) => [swap.id, swap.feasibility]))
  );
  const [verified, setVerified] = useState(null); // null | 'checking' | 'match' | 'mismatch'
  const debounceRef = useRef(null);

  const result = useMemo(
    () => applySlidersToBaseline(baselineTotal, swaps, positions),
    [baselineTotal, swaps, positions]
  );

  const [totalRef, totalFormatted] = useCounter(result.projectedTotal, {
    startOnView: false,
    duration: 450,
    decimals: 1,
  });

  useEffect(() => {
    setVerified('checking');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      insightsApi
        .simulate(positions, month)
        .then((serverResult) => {
          const matches = Math.abs(serverResult.projectedTotal - result.projectedTotal) < 0.1;
          setVerified(matches ? 'match' : 'mismatch');
        })
        .catch(() => setVerified(null));
    }, VERIFY_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, month]);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.3rem' }}>
        {swaps.map((swap) => (
          <div key={swap.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
              <span>
                {formatSubType(swap.fromSubType)} → {formatSubType(swap.toSubType)}
              </span>
              <span className="eco-readout" style={{ color: 'var(--readout)' }}>
                {Math.round((positions[swap.id] || 0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={positions[swap.id] || 0}
              onChange={(event) =>
                setPositions((current) => ({ ...current, [swap.id]: Number(event.target.value) }))
              }
              style={{ width: '100%', accentColor: 'var(--eco-primary)' }}
              aria-label={`Fraction of ${formatSubType(swap.fromSubType)} shifted to ${formatSubType(swap.toSubType)}`}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '1.8rem',
          paddingTop: '1.2rem',
          borderTop: '1px solid var(--rule-strong)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.8rem',
        }}
      >
        <div>
          <div className="eco-marker" style={{ marginBottom: '0.3rem' }}>
            Projected month total
          </div>
          <div ref={totalRef} className="eco-readout" style={{ fontSize: '1.9rem', fontWeight: 500 }}>
            {totalFormatted} <span style={{ fontSize: '0.5em' }}>kg CO₂</span>
          </div>
        </div>

        <motion.div
          key={result.totalSavingKg}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'right' }}
        >
          <div style={{ color: 'var(--eco-primary)', fontSize: '1.1rem', fontWeight: 500 }}>
            −{formatEmission(result.totalSavingKg)} / month
          </div>
          <div className="eco-text-muted" style={{ fontSize: '0.78rem' }}>
            ≈ {formatEmission(result.annualSavingKg)} / year
          </div>
        </motion.div>
      </div>

      <div style={{ marginTop: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--eco-text-muted)' }}>
        {verified === 'checking' && (
          <>
            <Loader2
              size={12}
              style={{ animation: prefersReducedMotion ? 'none' : 'eco-spin 0.8s linear infinite' }}
            />
            Confirming with the server…
          </>
        )}
        {verified === 'match' && (
          <>
            <CheckCircle2 size={12} style={{ color: 'var(--eco-primary)' }} />
            Confirmed by the server
          </>
        )}
        {verified === 'mismatch' && <>Could not confirm this figure right now - showing the local estimate.</>}
      </div>
    </div>
  );
}
