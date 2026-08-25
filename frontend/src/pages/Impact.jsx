// EcoTrack/frontend/src/pages/Impact.jsx
// Public "collective impact" page - aggregate totals across every EcoTrack
// user, backed by GET /api/community/impact (routes/community.py). No
// login, no per-user data - every figure here is a sum or a count across
// the whole platform, the same k-anonymity spirit routes/insights.py's
// cohort comparison already applies, just at the scale of "everyone" so
// there is no threshold to enforce.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe2, Sprout, TrendingDown, Users } from 'lucide-react';

import { communityApi } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';
import { formatCategory, formatEmission, formatNumber } from '../utils/formatters';

function StatTile({ icon: Icon, label, value, sub, delay = 0 }) {
  const { prefersReducedMotion } = useTheme();
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ paddingTop: '1rem', borderTop: '2px solid var(--readout)' }}
    >
      <Icon size={17} style={{ color: 'var(--eco-text-muted)', marginBottom: '0.6rem' }} />
      <div className="eco-readout" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div className="eco-marker" style={{ marginTop: '0.35rem' }}>{label}</div>
      {sub && <p className="eco-text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>{sub}</p>}
    </motion.div>
  );
}

export default function Impact() {
  const { prefersReducedMotion } = useTheme();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    communityApi
      .getImpact()
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  const totalCategoryKg = stats
    ? Object.values(stats.categoryBreakdownKg).reduce((sum, value) => sum + value, 0)
    : 0;

  return (
    <div>
      <section style={{ padding: 'clamp(3rem, 9vw, 6rem) 0 clamp(2rem, 5vw, 3rem)' }}>
        <div className="container">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ maxWidth: 720 }}
          >
            <span className="eco-marker" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Globe2 size={14} /> Collective impact
            </span>
            <h1 className="eco-display" style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: '1.1rem' }}>
              What EcoTrack's users have measured, together
            </h1>
            <p className="eco-text-muted" style={{ fontSize: '1.05rem', lineHeight: 1.7 }}>
              Real totals across every account on the platform - never a single person's figure,
              only sums and counts. This is what tracking a footprint, at scale, actually adds up to.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="eco-section" style={{ paddingTop: 0 }}>
        <div className="container">
          {error && (
            <p className="eco-text-muted" style={{ fontSize: '0.9rem' }}>
              Could not load community figures right now. Please try again shortly.
            </p>
          )}

          {!error && !stats && (
            <div className="eco-skeleton" style={{ height: 200, borderRadius: 8 }} />
          )}

          {stats && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '2rem',
                  marginBottom: '3rem',
                }}
              >
                <StatTile
                  icon={Users}
                  label="People tracking"
                  value={formatNumber(stats.totalUsers, 0)}
                  delay={0}
                />
                <StatTile
                  icon={Globe2}
                  label="Entries logged"
                  value={formatNumber(stats.totalEntriesLogged, 0)}
                  sub="across all seven categories"
                  delay={0.05}
                />
                <StatTile
                  icon={TrendingDown}
                  label="Emissions measured"
                  value={formatEmission(stats.totalEmissionKg, { compact: true })}
                  sub="lifetime, all users"
                  delay={0.1}
                />
                <StatTile
                  icon={Sprout}
                  label="Tree-years to absorb it"
                  value={formatNumber(stats.treeYearsEquivalent, 0)}
                  sub="US Forest Service, ~21 kg CO₂/tree/year"
                  delay={0.15}
                />
              </div>

              {stats.recommendationsAccepted > 0 && (
                <div className="eco-card" style={{ marginBottom: '3rem' }}>
                  <span className="eco-marker" style={{ display: 'block', marginBottom: '0.6rem' }}>
                    Real behaviour change, not just measurement
                  </span>
                  <p style={{ fontSize: '0.95rem', margin: 0 }}>
                    Users have accepted{' '}
                    <strong className="eco-readout">{formatNumber(stats.recommendationsAccepted, 0)}</strong>{' '}
                    cited swap recommendations, together worth a real{' '}
                    <strong className="eco-readout">{formatEmission(stats.totalPotentialSavingKg)}</strong>{' '}
                    in projected monthly savings.
                  </p>
                </div>
              )}

              <span className="eco-marker" style={{ display: 'block', marginBottom: '1.2rem' }}>
                Where it comes from
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxWidth: 640 }}>
                {CATEGORY_ORDER.filter((category) => (stats.categoryBreakdownKg[category] || 0) > 0).map((category) => {
                  const kg = stats.categoryBreakdownKg[category] || 0;
                  const percent = totalCategoryKg > 0 ? Math.round((kg / totalCategoryKg) * 100) : 0;
                  const meta = CATEGORY_META[category];
                  return (
                    <div key={category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '0.3rem' }}>
                        <span style={{ color: meta?.color }}>{meta?.label || formatCategory(category)}</span>
                        <span className="eco-text-muted">{formatEmission(kg, { compact: true })} · {percent}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--rule)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${percent}%`, background: meta?.color || 'var(--eco-primary)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="eco-text-muted" style={{ fontSize: '0.78rem', marginTop: '2.5rem', maxWidth: 640 }}>
                Refreshed every few hours. Aggregate figures only - EcoTrack never publishes any
                individual user's data.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
