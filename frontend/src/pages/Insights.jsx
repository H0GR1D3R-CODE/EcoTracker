// EcoTrack/frontend/src/pages/Insights.jsx
// The closed-loop page: where your forecast, the counterfactual swaps that
// would improve it, a what-if sandbox, and how you compare to your region
// all live. Everything the tracking pages MEASURE, this page turns into
// something to actually DO - see backend/insights_engine.py for the maths
// behind every panel here.
//
// TWO TIERS, NOT ONE LONG SCROLL
// Forecast and the ranked swap list are the two things worth seeing on
// every visit - always on screen. Everything else here (the MACC curve,
// the what-if sandbox, weather context, the activity calendar, cohort
// comparison) is real analysis, but not something most visits need: it now
// sits behind one "Show more analysis" toggle rather than being bombarded
// on page load regardless of whether anyone asked for it. Letting the user
// decide to open it, rather than deciding for them that they want five
// stacked panels every time, is the whole point of this split.
//
// Streak, the reward tree and this week's challenges moved to Dashboard -
// see that page's own header comment for why "motivate me to log
// something" belongs at the top of the page someone actually opens first,
// not a few scrolls into a page about analysis.
//
// Mounted at /insights

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, CalendarRange, ChevronDown, Target, ThermometerSun, Users } from 'lucide-react';

import { dashboardApi, insightsApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import PageBanner from '../components/PageBanner';
import SkeletonCard from '../components/SkeletonCard';
import ForecastGauge from '../components/ForecastGauge';
import SwapCard from '../components/SwapCard';
import MaccChart from '../components/MaccChart';
import ScenarioSandbox from '../components/ScenarioSandbox';
import ActivityHeatmap from '../components/ActivityHeatmap';
import CohortCurve from '../components/CohortCurve';
import WeatherContext from '../components/WeatherContext';
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
  const { prefersReducedMotion } = useTheme();
  const [swapsData, setSwapsData] = useState(null);
  const [swapsError, setSwapsError] = useState(null);
  const [baselineTotal, setBaselineTotal] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    insightsApi
      .getSwaps()
      .then(setSwapsData)
      .catch((error) => setSwapsError(getErrorMessage(error, 'Could not load swap ideas.')));

    dashboardApi
      .getSummary()
      .then((data) => setBaselineTotal(data.thisMonth))
      .catch(() => setBaselineTotal(0));

    insightsApi
      .getWeather()
      .then(setWeatherData)
      .catch(() => {}); // supporting context, not the main event - fails quietly, same as cohort
  }, []);

  const showWeather = weatherData && weatherData.status !== 'weather_unavailable' && weatherData.status !== 'insufficient_data';

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

      <motion.section
        initial={false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        style={{ marginBottom: '1.4rem', paddingTop: '1.3rem', borderTop: '1px solid var(--rule-strong)' }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {swapsData.swaps.map((swap, index) => (
              <SwapCard key={swap.id} swap={swap} delay={index * 0.06} />
            ))}
          </div>
        )}
      </motion.section>

      {/* One toggle, not five sections everyone sees whether they asked for
          them or not - the MACC curve, the sandbox, weather context, your
          activity calendar and the cohort comparison are all real analysis,
          just not a first-glance need on every visit. */}
      <div style={{ textAlign: 'center', marginBottom: '2.6rem' }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="eco-btn eco-btn-outline"
          style={{ fontSize: '0.85rem' }}
        >
          {showAdvanced ? 'Show less' : 'Show more analysis'}
          <motion.span
            animate={{ rotate: showAdvanced ? 180 : 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
            style={{ display: 'inline-flex' }}
          >
            <ChevronDown size={15} />
          </motion.span>
        </button>
      </div>

      {showAdvanced && (
        <>
          {swapsData && swapsData.swaps.length > 0 && (
            <motion.section
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              style={{ marginBottom: '2.6rem', paddingTop: '1.3rem', borderTop: '1px solid var(--rule-strong)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.3rem' }}>
                <ArrowLeftRight size={16} style={{ color: 'var(--eco-primary)' }} />
                <span className="eco-marker">Swap ideas — the detail</span>
              </div>
              <p className="eco-text-muted" style={{ fontSize: '0.86rem', marginBottom: '1.4rem', maxWidth: '58ch' }}>
                How the ranked list above adds up, and what changing several at once would do.
              </p>

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
            </motion.section>
          )}

          {showWeather && (
            <Section
              icon={ThermometerSun}
              title="Weather-adjusted electricity"
              subtitle="Separating a cooler or warmer month from an actual change in behaviour, cited to your own logged data."
            >
              <WeatherContext weather={weatherData} />
            </Section>
          )}

          <Section icon={CalendarRange} title="Your activity calendar" subtitle="Every day you logged something, at a glance.">
            <ActivityHeatmap />
          </Section>

          <Section icon={Users} title="How you compare" subtitle="Deciles only, and only once at least 10 people in your region are tracking — never a single person's figure.">
            <CohortCurve />
          </Section>
        </>
      )}
    </div>
  );
}
