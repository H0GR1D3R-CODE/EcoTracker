// EcoTrack/frontend/src/pages/ApiDocs.jsx
// Public documentation for GET /api/community/impact and
// GET /api/community/leaderboard (routes/community.py) - the same two
// endpoints Impact.jsx itself renders, just described for someone who wants
// the raw JSON instead: a student citing real numbers in a report, another
// project pulling in a live figure, anyone curious what is actually behind
// the page. No key, no auth, no rate limit beyond what the 6-hour/1-hour
// server-side cache already imposes on repeated reads.

import { Code2, Database, ShieldCheck } from 'lucide-react';

const IMPACT_FIELDS = [
  ['totalUsers', 'number', 'Accounts registered on the platform.'],
  ['totalEntriesLogged', 'number', 'Individual carbon-log entries across every user, ever.'],
  ['totalEmissionKg', 'number', 'Sum of every logged entry’s emissions, in kg CO₂.'],
  ['categoryBreakdownKg', 'object', 'totalEmissionKg split across the seven tracked categories.'],
  ['recommendationsAccepted', 'number', 'AI-suggested swaps users have actually accepted, not just seen.'],
  ['totalPotentialSavingKg', 'number', 'Combined projected monthly saving from every accepted swap.'],
  ['treeYearsEquivalent', 'number', 'totalEmissionKg divided by 21 kg (a mature tree’s yearly CO₂ absorption, US Forest Service).'],
];

const LEADERBOARD_FIELDS = [
  ['entries', 'array', 'Up to 50 opted-in users, ranked by lifetime effort points (highest first).'],
  ['entries[].displayName', 'string', 'A chosen alias, or a masked "First L." name - never a full name or email.'],
  ['entries[].rewardPoints', 'number', 'Lifetime points earned by claiming challenges and reaching goals.'],
  ['entries[].stageLabel', 'string', 'The reward-tree stage that points total corresponds to (Seed through Banyan).'],
  ['totalOptedIn', 'number', 'How many users have opted in, including any past the top 50 shown.'],
];

function EndpointCard({ method, path, description, fields, curl, sampleJson }) {
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

export default function ApiDocs() {
  const base = import.meta.env.VITE_API_URL || 'https://eco-tracker-hogrider.vercel.app';

  return (
    <div>
      <section style={{ padding: 'clamp(3rem, 9vw, 6rem) 0 clamp(2rem, 5vw, 3rem)' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <span className="eco-marker" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Code2 size={14} /> Public API
          </span>
          <h1 className="eco-display" style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: '1.1rem' }}>
            Free, open access to EcoTrack's aggregate data
          </h1>
          <p className="eco-text-muted" style={{ fontSize: '1.05rem', lineHeight: 1.7 }}>
            The same two endpoints the Impact page itself calls, documented here for anyone who
            wants the raw numbers directly - a research project, a classroom exercise, another
            tool citing a live figure. No API key, no sign-up, no rate limit beyond the caching
            described below.
          </p>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={15} style={{ color: 'var(--eco-text-muted)' }} />
              <span className="eco-text-muted" style={{ fontSize: '0.85rem' }}>Aggregate figures only</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={15} style={{ color: 'var(--eco-text-muted)' }} />
              <span className="eco-text-muted" style={{ fontSize: '0.85rem' }}>Never a single user's raw data</span>
            </div>
          </div>
        </div>
      </section>

      <section className="eco-section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <EndpointCard
            method="GET"
            path="/api/community/impact"
            description="Platform-wide totals: users, entries logged, emissions measured, category breakdown, and accepted recommendation savings. Recomputed at most once every 6 hours."
            fields={IMPACT_FIELDS}
            curl={`curl ${base}/api/community/impact`}
            sampleJson={`{
  "success": true,
  "data": {
    "totalUsers": 412,
    "totalEntriesLogged": 5830,
    "totalEmissionKg": 48210.6,
    "categoryBreakdownKg": {
      "transport": 18420.1,
      "electricity": 15310.4,
      "diet": 6210.8,
      "...": "..."
    },
    "recommendationsAccepted": 96,
    "totalPotentialSavingKg": 412.3,
    "treeYearsEquivalent": 2296
  }
}`}
          />

          <EndpointCard
            method="GET"
            path="/api/community/leaderboard"
            description="The public, opt-in leaderboard - up to 50 users who have chosen to appear, ranked by lifetime effort points rather than raw emissions. Recomputed at most once every hour."
            fields={LEADERBOARD_FIELDS}
            curl={`curl ${base}/api/community/leaderboard`}
            sampleJson={`{
  "success": true,
  "data": {
    "entries": [
      { "displayName": "EcoWarrior", "rewardPoints": 620, "stageLabel": "Mature tree" },
      { "displayName": "Aadi S.", "rewardPoints": 480, "stageLabel": "Young tree" }
    ],
    "totalOptedIn": 37
  }
}`}
          />

          <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
            <h2 className="eco-display" style={{ fontSize: '1.2rem', margin: '0 0 0.8rem' }}>
              Using this in your own work
            </h2>
            <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.7, maxWidth: 640, margin: 0 }}>
              Free to use for research, education, journalism, or your own project - a link back
              to EcoTrack is appreciated but not required. Figures are real platform totals, not
              samples or estimates; see each endpoint's own route in{' '}
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>backend/routes/community.py</code>{' '}
              for exactly how every number is computed.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
