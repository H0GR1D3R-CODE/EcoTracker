// EcoTrack/frontend/src/pages/Calculator.jsx
//
// PLACEHOLDER - this file will be replaced when the Calculator module is built.
//
// When built, this page will contain:
//   * a tabbed interface with an animated indicator sliding between categories
//   * a live emission preview that updates as the user types, before submitting
//   * an animated result card with real-world equivalents and a severity badge
//   * a progress ring comparing the entry to the user's daily average
// Data sources: GET /api/factors, POST /api/carbon/calculate

import { Calculator as CalculatorIcon } from 'lucide-react';

import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';

export default function Calculator() {
  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.4rem' }}>
        Carbon <span className="eco-gradient-text">Calculator</span>
      </h1>
      <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
        Log an activity and see its emissions instantly.
      </p>

      <div className="eco-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <CalculatorIcon size={44} style={{ color: 'var(--eco-primary)', opacity: 0.6 }} />

        <h2 style={{ fontSize: '1.3rem', marginTop: '1.2rem', marginBottom: '0.6rem' }}>
          Calculator coming next
        </h2>

        <p className="eco-text-muted" style={{ maxWidth: 480, margin: '0 auto 2rem' }}>
          These are the seven categories it will cover. Each one gets its own tab,
          its own icon colour, and a live preview of the emission as you type.
        </p>

        {/* A preview of the category tabs, built from the shared metadata so
            this list can never drift out of step with the real calculator */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            maxWidth: 620,
            margin: '0 auto',
          }}
        >
          {CATEGORY_ORDER.map((category) => {
            const meta = CATEGORY_META[category];
            return (
              <span
                key={category}
                className="eco-badge"
                style={{ color: meta.color, borderColor: `${meta.color}55` }}
              >
                {meta.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
