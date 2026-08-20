// EcoTrack/frontend/src/pages/Insights.jsx
// The closed-loop page: where your forecast, the counterfactual swaps that
// would improve it, a what-if sandbox, your logging streak, and how you
// compare to your region all live. Everything the tracking pages MEASURE,
// this page turns into something to actually DO - see
// backend/insights_engine.py for the maths behind every panel here.
//
// Mounted at /insights

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Flame, Target, Users } from 'lucide-react';

import { dashboardApi, insightsApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import PageBanner from '../components/PageBanner';
import SkeletonCard from '../components/SkeletonCard';
import ForecastGauge from '../components/ForecastGauge';
import SwapCard from '../components/SwapCard';
import MaccChart from '../components/MaccChart';
import ScenarioSandbox from '../components/ScenarioSandbox';
import StreakFlame from '../components/StreakFlame';
import ActivityHeatmap from '../components/ActivityHeatmap';
import ChallengeList from '../components/ChallengeList';
import CohortCurve from '../components/CohortCurve';
import { currentMonthISO } from '../utils/formatters';

function Section({ icon: Icon, title, subtitle, children, delay = 0 }) {
  const { prefersReducedMotion } = useTheme();
  return (
    <motion.section
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ marginBottom: '2.6rem', paddingTop: '1.3rem', borderTop: '1px solid var(--rule-strong)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.3rem' }}>
        <Icon size={16} style={{ color: 'var(--eco-primary)' }} />
        <span className="eco-marker">{title}</span>
      </div>
      {subtitle && (
        <p className="eco-text-muted" style={{ fontSize: '0.86rem', marginBottom: '1.4rem', maxWidth: '58ch' }}>
          {subtitle}
        </p>
      )}
      <div className="eco-card">{children}</div>
    </motion.section>
  );
}

export default function Insights() {
  const [swapsData, setSwapsData] = useState(null);
  const [swapsError, setSwapsError] = useState(null);
  const [baselineTotal, setBaselineTotal] = useState(null);

  useEffect(() => {
    insightsApi
      .getSwaps()
      .then(setSwapsData)
      .catch((error) => setSwapsError(getErrorMessage(error, 'Could not load swap ideas.')));

    dashboardApi
      .getSummary()
      .then((data) => setBaselineTotal(data.thisMonth))
      .catch(() => setBaselineTotal(0));
  }, []);

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      <PageBanner
        photo="foggyForecast"
        alt="A narrow road disappearing into thick morning fog"
        color="var(--eco-primary)"
        eyebrow="Predict, prescribe, verify"
        title="Insights"
        titleAccent="& Forecast"
        subtitle="Where your month is heading, what would change it, and how you compare — every figure cited back to its source."
      />

      <Section icon={Target} title="Month-end forecast" subtitle="Projected from your own logging pattern, with an honest range of uncertainty.">
        <ForecastGauge />
      </Section>

      <Section icon={Flame} title="Streak & activity" delay={0.05}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.6rem' }}>
          <StreakFlame />
          <div>
            <ActivityHeatmap />
          </div>
        </div>

        <div style={{ marginTop: '1.6rem', paddingTop: '1.2rem', borderTop: '1px solid var(--rule-strong)' }}>
          <span className="eco-marker" style={{ display: 'block', marginBottom: '0.2rem' }}>
            This week's challenges
          </span>
          <ChallengeList />
        </div>
      </Section>

      <motion.section
        initial={false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        style={{ marginBottom: '2.6rem', paddingTop: '1.3rem', borderTop: '1px solid var(--rule-strong)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.3rem' }}>
          <ArrowLeftRight size={16} style={{ color: 'var(--eco-primary)' }} />
          <span className="eco-marker">Swap ideas</span>
        </div>
        <p className="eco-text-muted" style={{ fontSize: '0.86rem', marginBottom: '1.4rem', maxWidth: '58ch' }}>
          Ranked, counterfactual, and cited — every saving traces back to a published emission factor.
        </p>

        {swapsError && <p style={{ color: 'var(--eco-danger)', fontSize: '0.85rem' }}>{swapsError}</p>}

        {!swapsData && !swapsError && <SkeletonCard lines={3} height={140} />}

        {swapsData && swapsData.swaps.length === 0 && (
          <div className="eco-card">
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              No swap ideas yet — log more entries in the Calculator and this fills in as patterns emerge.
            </p>
          </div>
        )}

        {swapsData && swapsData.swaps.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.8rem' }}>
              {swapsData.swaps.map((swap, index) => (
                <SwapCard key={swap.id} swap={swap} delay={index * 0.06} />
              ))}
            </div>

            <div className="eco-card" style={{ marginBottom: '1.8rem' }}>
              <span className="eco-marker" style={{ display: 'block', marginBottom: '1rem' }}>
                Marginal abatement curve
              </span>
              <MaccChart curve={swapsData.maccCurve} />
            </div>

            {baselineTotal !== null && (
              <div className="eco-card">
                <span className="eco-marker" style={{ display: 'block', marginBottom: '1rem' }}>
                  What-if sandbox
                </span>
                <ScenarioSandbox swaps={swapsData.swaps} baselineTotal={baselineTotal} month={currentMonthISO()} />
              </div>
            )}
          </>
        )}
      </motion.section>

      <Section icon={Users} title="How you compare" subtitle="Deciles only, and only once at least 10 people in your region are tracking — never a single person's figure.">
        <CohortCurve />
      </Section>
    </div>
  );
}
