// EcoTrack/frontend/src/components/WeatherContext.jsx
// Separates "the weather changed" from "behaviour changed" in electricity -
// the category most sensitive to it. Backed by GET /api/insights/weather,
// itself backed by weather_engine.py - see that file's module docstring for
// the full reasoning behind the two phases rendered here:
//   1. CONTEXT   - this month vs last, in cooling-degree-days. Always shown
//                  once two months of weather + electricity exist.
//   2. REGRESSION - an honest OLS fit once there is enough real spread to
//                  fit against, reported with its own R^2 rather than a
//                  fake line through too few points.
//
// Purely presentational: Insights.jsx owns the fetch and decides whether to
// show the section at all (there is nothing worth a header + empty card for
// a user with no weather data yet) - the same parent-fetches-child-renders
// split it already uses for the swap-ideas section.

import { formatEmission, formatPercent } from '../utils/formatters';

export default function WeatherContext({ weather }) {
  const { context, regression, cityLabel, baseTempC } = weather;
  const warmedUp = context.cddDeltaPercent !== null && context.cddDeltaPercent > 0;

  return (
    <div>
      {context.thisMonth.meanTempC != null && context.previousMonth.meanTempC != null && (
        <p style={{ fontSize: '0.9rem', margin: '0 0 1.1rem' }}>
          This month averaged <strong>{context.thisMonth.meanTempC}°C</strong> in {cityLabel},
          against <strong>{context.previousMonth.meanTempC}°C</strong> last month
          {context.cddDeltaPercent !== null && (
            <>
              {' '}— cooling demand was{' '}
              <strong>{formatPercent(Math.abs(context.cddDeltaPercent), { showSign: false })}</strong>{' '}
              {warmedUp ? 'higher' : 'lower'} than last month.
            </>
          )}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.2rem', marginBottom: regression ? '1.1rem' : 0 }}>
        <div>
          <span className="eco-marker" style={{ fontSize: '0.68rem', display: 'block', marginBottom: '0.2rem' }}>
            This month's electricity
          </span>
          <span className="eco-readout" style={{ fontSize: '1.2rem' }}>
            {context.thisMonth.electricityKg != null ? formatEmission(context.thisMonth.electricityKg) : '—'}
          </span>
        </div>
        <div>
          <span className="eco-marker" style={{ fontSize: '0.68rem', display: 'block', marginBottom: '0.2rem' }}>
            Cooling degree-days
          </span>
          <span className="eco-readout" style={{ fontSize: '1.2rem' }}>
            {context.thisMonth.cdd}
          </span>
        </div>
      </div>

      {regression && (
        <div style={{ paddingTop: '1.1rem', borderTop: '1px solid var(--rule-strong)' }}>
          <p style={{ fontSize: '0.9rem', margin: '0 0 0.4rem' }}>
            At an average-weather month, your fitted rate puts electricity around{' '}
            <strong>{formatEmission(regression.weatherAdjustedMonthlyKg)}</strong> — the figure
            that strips this month's specific weather back out.
          </p>
          <p className="eco-text-muted" style={{ fontSize: '0.78rem', margin: 0 }}>
            Fitted from {regression.months.length} months of your own data
            ({regression.kgPerDegreeDay} kg per degree-day above {baseTempC}°C, R²{' '}
            {regression.r2.toFixed(2)}).
          </p>
        </div>
      )}
    </div>
  );
}
