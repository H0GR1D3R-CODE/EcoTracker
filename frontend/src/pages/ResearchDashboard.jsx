// EcoTrack/frontend/src/pages/ResearchDashboard.jsx
/**
 * A narrower, read-only sibling of AdminDashboard's "Research" tab, for the
 * researcher role - see backend/routes/admin.py's require_researcher note
 * and backend/routes/__init__.py's is_researcher/require_researcher.
 *
 * This is a deliberate duplication of that tab's markup, not a shared
 * import from AdminDashboard.jsx: AdminDashboard is one large stateful
 * component with its own tab-switching, drill-down and admin-only side
 * effects, and importing pieces out of it would couple this page to all of
 * that. The two pages call the exact same two endpoints
 * (GET /api/admin/research/stats, GET /api/admin/research/export) - both
 * already gated server-side by @require_researcher, which is what actually
 * keeps this data safe, not which page happens to render it (see
 * ProtectedRoute.jsx's own security note).
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Download, FlaskConical, RefreshCw, Target, TrendingUp } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';
import { adminApi, getErrorMessage } from '../utils/api';
import StatCard from '../components/StatCard';
import { AdoptionRateBarChart, InterventionTrendChart } from '../components/EmissionChart';
import { formatDate, formatSubType } from '../utils/formatters';

// Kept in sync with AdminDashboard.jsx's own copy by value, not by import -
// see this file's module docstring for why the two pages stay separate.
const INTERVENTION_TYPE_LABELS = {
  swap_item: 'Swap suggestions',
  quick_log_suggestion: 'Quick-log suggestions',
  forecast: 'Forecasts',
  cohort: 'Cohort comparisons',
};

export default function ResearchDashboard() {
  const { prefersReducedMotion } = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setStats(await adminApi.getResearchStats());
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not load research stats.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await adminApi.getResearchExport();
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.rowCount} intervention${data.rowCount === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not build the export.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '2.2rem', paddingBottom: '4rem', maxWidth: 980 }}>
      <div style={{ marginBottom: '2rem' }}>
        <span className="eco-marker" style={{ display: 'block', marginBottom: '0.5rem' }}>
          Research access
        </span>
        <h1 className="eco-display" style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', margin: '0 0 0.6rem' }}>
          Adoption &amp; impact
        </h1>
        <p className="eco-text-muted" style={{ margin: 0, maxWidth: '64ch', fontSize: '0.92rem' }}>
          Read-only. The evaluation harness behind EcoTrack's central claim: not "we log
          recommendations" but the measured rate people actually acted on them. User ids in
          the export are hashed with a server-side secret - no name or email is included.
        </p>
      </div>

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FlaskConical size={17} style={{ color: 'var(--eco-text-muted)' }} />
              <h2 className="eco-display" style={{ fontSize: '1.1rem', margin: 0 }}>Interventions</h2>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="eco-btn eco-btn-ghost"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
            >
              <RefreshCw size={14} style={loading ? { animation: 'eco-spin 0.9s linear infinite' } : undefined} />
              Re-check
            </button>
          </div>

          {!stats && loading && <p className="eco-text-muted" style={{ fontSize: '0.9rem' }}>Computing…</p>}

          {stats && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.6rem', marginBottom: '2rem' }}>
                <StatCard
                  icon={FlaskConical}
                  label="Interventions shown"
                  value={stats.totalInterventions}
                  decimals={0}
                  accent="var(--cat-transport)"
                  hint="Every forecast, swap idea, cohort card and quick-log suggestion, logged once each"
                />
                <StatCard
                  icon={Target}
                  label="Actionable adoption rate"
                  value={stats.actionableAdoptionRate}
                  unit="%"
                  decimals={1}
                  accent="var(--eco-primary)"
                  hint={`${stats.actionableShown} shown were things a person could actually accept or dismiss`}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Projected saving, accepted"
                  value={stats.totalProjectedSavingKg}
                  unit="kg CO₂/mo"
                  decimals={2}
                  accent="var(--org-goldstandard)"
                  hint="Summed across every swap someone actually said yes to"
                />
              </div>

              {stats.byType.some((t) => t.actionable) && (
                <div className="eco-card" style={{ marginBottom: '1.6rem' }}>
                  <span className="eco-marker" style={{ display: 'block', marginBottom: '1rem' }}>
                    Adoption rate by type
                  </span>
                  <AdoptionRateBarChart
                    labels={stats.byType.filter((t) => t.actionable).map((t) => INTERVENTION_TYPE_LABELS[t.type] || formatSubType(t.type))}
                    data={stats.byType.filter((t) => t.actionable).map((t) => t.adoptionRate)}
                    height={Math.max(120, stats.byType.filter((t) => t.actionable).length * 60)}
                  />
                </div>
              )}

              {stats.dailyTrend.some((d) => d.shown > 0) && (
                <div className="eco-card" style={{ marginBottom: '1.6rem' }}>
                  <span className="eco-marker" style={{ display: 'block', marginBottom: '1rem' }}>
                    Shown vs. accepted, last 14 days
                  </span>
                  <InterventionTrendChart
                    labels={stats.dailyTrend.map((d) => formatDate(d.date, 'dd MMM'))}
                    shown={stats.dailyTrend.map((d) => d.shown)}
                    accepted={stats.dailyTrend.map((d) => d.accepted)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ paddingTop: '1.6rem', marginTop: '0.4rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <FlaskConical size={17} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.1rem', margin: 0 }}>Export</h2>
          </div>
          <p className="eco-text-muted" style={{ margin: '0 0 1.4rem', fontSize: '0.85rem', maxWidth: '64ch' }}>
            The raw data the numbers above are computed from - one row per shown recommendation.
          </p>
          <button type="button" className="eco-btn eco-btn-primary" disabled={exporting} onClick={handleExport}>
            <Download size={16} />
            {exporting ? 'Building CSV…' : 'Download interventions.csv'}
          </button>
          <p className="eco-text-muted" style={{ marginTop: '1.4rem', fontSize: '0.78rem' }}>
            Forecast accuracy (MAE/MAPE against a naive baseline) is a separate, heavier
            walk-forward backtest run from the project's own machine, not shown here.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
