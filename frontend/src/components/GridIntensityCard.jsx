// EcoTrack/frontend/src/components/GridIntensityCard.jsx
// Time-of-day grid carbon intensity - see backend/grid_engine.py's module
// docstring for the full model and its stated assumptions (three time
// bands, a real but deliberately simple multiplier on the CEA factor, not
// live grid telemetry).
//
// Purely presentational: Insights.jsx owns the fetch, the same
// parent-fetches-child-renders split WeatherContext.jsx already uses.

import { Moon, Sun, Sunset } from 'lucide-react';

const PART_ICONS = { day: Sun, eveningPeak: Sunset, night: Moon };

export default function GridIntensityCard({ grid }) {
  const { currentPart, currentPartLabel, cleanestPart, cleanestPartLabel, isCurrentlyCleanest, potentialSavingPercent, parts } = grid;
  const CurrentIcon = PART_ICONS[currentPart] || Sun;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', marginBottom: '1.3rem' }}>
        <CurrentIcon size={22} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: '0.9rem', margin: 0 }}>
          Right now (<strong>{currentPartLabel}</strong>) is
          {isCurrentlyCleanest ? (
            <> already the <strong>cleanest</strong> time to use electricity today.</>
          ) : (
            <>
              {' '}a relatively dirtier time to draw power. Shifting flexible use (laundry,
              charging, the dishwasher) to <strong>{cleanestPartLabel}</strong> would draw from a
              grid that's roughly <strong>{potentialSavingPercent}% cleaner</strong>.
            </>
          )}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.8rem',
        }}
      >
        {parts.map((part) => {
          const Icon = PART_ICONS[part.key] || Sun;
          const isCurrent = part.key === currentPart;
          const isCleanest = part.key === cleanestPart;
          return (
            <div
              key={part.key}
              style={{
                padding: '0.8rem',
                borderRadius: 'var(--eco-radius-sm)',
                border: `1px solid ${isCurrent ? 'var(--eco-primary)' : 'var(--rule)'}`,
                background: isCurrent ? 'color-mix(in srgb, var(--eco-primary) 8%, transparent)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <Icon size={14} style={{ color: isCleanest ? 'var(--eco-primary)' : 'var(--eco-text-muted)' }} />
                <span className="eco-marker" style={{ fontSize: '0.66rem' }}>{part.label}</span>
              </div>
              <span className="eco-readout" style={{ fontSize: '1rem' }}>
                {part.multiplier}×
              </span>
              {isCleanest && (
                <span className="eco-text-muted" style={{ fontSize: '0.72rem', marginLeft: '0.4rem' }}>
                  cleanest
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="eco-text-muted" style={{ fontSize: '0.74rem', margin: '1rem 0 0' }}>
        A stated model, not live grid telemetry: solar output peaks midday and falls off at
        sunset, so the grid leans more on coal/gas peaker plants right as evening demand rises.
      </p>
    </div>
  );
}
