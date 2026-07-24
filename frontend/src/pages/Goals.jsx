// EcoTrack/frontend/src/pages/Goals.jsx
//
// PLACEHOLDER - this file will be replaced when the Goals module is built.
//
// When built, this page will contain:
//   * an animated SVG circular progress ring per goal
//   * ring colour shifting red -> orange -> yellow -> green as progress grows
//   * confetti when a goal is achieved (canvas-confetti)
//   * a timeline showing goal start -> today -> target date
// Data source: GET /api/goals (the backend calculates progress for each goal)

import { Target } from 'lucide-react';

export default function Goals() {
  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.4rem' }}>
        Your <span className="eco-gradient-text">Goals</span>
      </h1>
      <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
        Reduction targets, set one category at a time.
      </p>

      <div className="eco-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <Target size={44} style={{ color: 'var(--eco-primary)', opacity: 0.6 }} />

        <h2 style={{ fontSize: '1.3rem', marginTop: '1.2rem', marginBottom: '0.6rem' }}>
          Goals coming next
        </h2>

        <p className="eco-text-muted" style={{ maxWidth: 500, margin: '0 auto' }}>
          Goals are set per category rather than as one overall target, because
          &ldquo;cut transport by 25%&rdquo; tells you what to actually change —
          &ldquo;reduce emissions&rdquo; does not.
        </p>
      </div>
    </div>
  );
}
