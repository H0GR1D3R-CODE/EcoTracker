// EcoTrack/frontend/src/pages/Reports.jsx
//
// PLACEHOLDER - this file will be replaced when the Reports module is built.
//
// When built, this page will contain:
//   * a date range picker (react-datepicker, themed in index.css)
//   * monthly / yearly / custom report types
//   * a summary of totals, the worst category and the worst single day
//   * a download option
// Data sources: POST /api/reports/generate, GET /api/reports, GET /api/reports/:id

import { FileText } from 'lucide-react';

export default function Reports() {
  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.4rem' }}>
        <span className="eco-gradient-text">Reports</span>
      </h1>
      <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
        Summaries of any period you choose.
      </p>

      <div className="eco-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <FileText size={44} style={{ color: 'var(--eco-primary)', opacity: 0.6 }} />

        <h2 style={{ fontSize: '1.3rem', marginTop: '1.2rem', marginBottom: '0.6rem' }}>
          Reports coming next
        </h2>

        <p className="eco-text-muted" style={{ maxWidth: 500, margin: '0 auto' }}>
          A report stores only its date range. The figures are recalculated from
          your records every time you open it, so a report can never disagree with
          your dashboard.
        </p>
      </div>
    </div>
  );
}
