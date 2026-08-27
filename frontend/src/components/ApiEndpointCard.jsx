// EcoTrack/frontend/src/components/ApiEndpointCard.jsx
// One documented API endpoint: method, path, description, a curl example,
// a sample response, and a field table. Originally the content of a public
// pages/ApiDocs.jsx page; that page was removed from public navigation and
// this became a component so the same content could be reused inside
// AdminDashboard.jsx's own "API" tab instead - the underlying endpoints
// (routes/community.py's impact/leaderboard) are still public/unauthenticated
// (Impact.jsx itself depends on that), only the DOCUMENTATION page moved.

export default function ApiEndpointCard({ method, path, description, fields, curl, sampleJson }) {
  return (
    <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)', marginBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <span
          className="eco-readout"
          style={{
            fontSize: '0.76rem',
            fontWeight: 700,
            padding: '0.2rem 0.55rem',
            border: '1px solid var(--eco-primary)',
            borderRadius: 999,
            color: 'var(--eco-primary)',
          }}
        >
          {method}
        </span>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem' }}>{path}</code>
      </div>
      <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: '0 0 1.3rem', maxWidth: 640 }}>
        {description}
      </p>

      <div className="eco-marker" style={{ marginBottom: '0.6rem' }}>Try it</div>
      <pre
        style={{
          background: 'var(--eco-bg-alt)',
          border: '1px solid var(--eco-border)',
          borderRadius: 'var(--eco-radius-sm)',
          padding: '1rem 1.2rem',
          fontSize: '0.82rem',
          fontFamily: 'var(--font-mono)',
          overflowX: 'auto',
          marginBottom: '1.6rem',
        }}
      >
        {curl}
      </pre>

      <div className="eco-marker" style={{ marginBottom: '0.6rem' }}>Example response</div>
      <pre
        style={{
          background: 'var(--eco-bg-alt)',
          border: '1px solid var(--eco-border)',
          borderRadius: 'var(--eco-radius-sm)',
          padding: '1rem 1.2rem',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-mono)',
          overflowX: 'auto',
          marginBottom: '1.6rem',
          lineHeight: 1.6,
        }}
      >
        {sampleJson}
      </pre>

      <div className="eco-marker" style={{ marginBottom: '0.8rem' }}>Fields</div>
      <div className="eco-table-wrap">
        <table className="eco-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([field, type, meaning]) => (
              <tr key={field}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{field}</td>
                <td className="eco-text-muted">{type}</td>
                <td className="eco-text-muted">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
