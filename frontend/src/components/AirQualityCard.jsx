// EcoTrack/frontend/src/components/AirQualityCard.jsx
// A second, health-framed reason to act, alongside the emissions figure
// itself - see backend/air_quality_engine.py's module docstring for the
// citation on why health framing is worth showing separately from carbon.
//
// Purely presentational, same parent-fetches-child-renders split as
// GridIntensityCard and WeatherContext.

import { Wind } from 'lucide-react';

const CATEGORY_COLORS = {
  good: 'var(--eco-primary)',
  moderate: 'var(--org-goldstandard)',
  unhealthy_sensitive: 'var(--org-goldstandard)',
  unhealthy: 'var(--eco-danger, #c0392b)',
  very_unhealthy: 'var(--eco-danger, #c0392b)',
  hazardous: 'var(--eco-danger, #c0392b)',
};

export default function AirQualityCard({ air }) {
  if (!air || air.status !== 'ok') return null;

  const color = CATEGORY_COLORS[air.category] || 'var(--eco-text-muted)';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', marginBottom: '0.6rem' }}>
        <Wind size={22} style={{ color, flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span className="eco-readout" style={{ fontSize: '1.6rem', fontWeight: 600 }}>
              {air.aqi}
            </span>
            <span className="eco-marker" style={{ color, fontSize: '0.72rem' }}>
              {air.categoryLabel}
            </span>
          </div>
          <span className="eco-text-muted" style={{ fontSize: '0.72rem' }}>
            US AQI{air.pm25 != null ? ` · PM2.5 ${Math.round(air.pm25)} µg/m³` : ''}
          </span>
        </div>
      </div>
      <p style={{ fontSize: '0.88rem', margin: 0 }}>{air.advice}</p>
    </div>
  );
}
