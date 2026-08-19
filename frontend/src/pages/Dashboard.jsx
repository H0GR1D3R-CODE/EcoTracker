// EcoTrack/frontend/src/pages/Dashboard.jsx
// The main screen for a signed-in user.
//
// SECTIONS, IN ORDER
//   1.  Greeting and last-updated line
//   2.  Four stat cards        - this month, this year, best category, active goals
//   3.  The bigger picture     - photo-led context (GlobalPictureSection), moved up
//                                 here from last so the top of the page isn't
//                                 wall-to-wall numbers
//   4.  Six-month trend line   - is the footprint going up or down over time
//   5.  Category doughnut      - what the footprint is made of, right now
//   6.  Impact equivalents     - what the number actually means in real terms
//   7.  This month vs last     - which categories moved, and in which direction
//   8.  Insights               - plain-English observations drawn from the data
//   9.  SDG 13 context strip   - ties the personal number to the global goal
//   10. Give to the cause      - donation CTA, last on purpose
//
// Every figure comes from GET /api/dashboard/summary. The page does no emission
// maths of its own: the backend calculated and stored each value when the user
// logged it, and this screen only ever arranges those numbers.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Cloud,
  Flame,
  Heart,
  Info,
  Leaf,
  Lightbulb,
  Plus,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useDashboard } from '../hooks/useDashboard';
import StatCard from '../components/StatCard';
import ImpactEquivalents from '../components/ImpactEquivalents';
import PageBanner from '../components/PageBanner';
import Reveal from '../components/Reveal';
import GlobalPictureSection from '../components/GlobalPictureSection';
import ForecastGauge from '../components/ForecastGauge';
import StreakFlame from '../components/StreakFlame';
import {
  CategoryDoughnutChart,
  ComparisonBarChart,
  TrendLineChart,
} from '../components/EmissionChart';
import { SkeletonBanner, SkeletonChart, SkeletonGlobalPicture, SkeletonStatCard } from '../components/SkeletonCard';
import { useSlowLoadHint } from '../hooks/useSlowLoadHint';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';
import { formatCategory, formatEmission, formatNumber } from '../utils/formatters';

// ---------------------------------------------------------------------------
// INSIGHTS
//
// Rule-based, not machine learning. Each rule is a plain observation anyone
// could make by looking at the numbers - which is exactly why it is useful:
// every sentence on screen can be traced back to a specific comparison, and
// explained on the spot if a marker asks where it came from.
// ---------------------------------------------------------------------------

function buildInsights(summary) {
  if (!summary) return [];

  const insights = [];
  const breakdown = summary.categoryBreakdown || {};
  const thisMonth = summary.thisMonth || 0;

  // Which category is doing the most damage this month
  const activeCategories = Object.entries(breakdown).filter(([, value]) => value > 0);
  const ranked = activeCategories.sort((a, b) => b[1] - a[1]);

  if (ranked.length > 0) {
    const [topCategory, topValue] = ranked[0];
    const share = thisMonth > 0 ? (topValue / thisMonth) * 100 : 0;

    insights.push({
      tone: share > 50 ? 'warning' : 'neutral',
      icon: Flame,
      title: `${formatCategory(topCategory)} is your biggest source`,
      body:
        `It accounts for ${share.toFixed(0)}% of this month's footprint ` +
        `(${formatEmission(topValue)}). Cutting here moves your total more than ` +
        `anywhere else.`,
    });
  }

  // Direction of travel versus last month
  if (summary.percentageChange !== null && summary.percentageChange !== undefined) {
    const change = summary.percentageChange;

    if (change > 5) {
      insights.push({
        tone: 'warning',
        icon: TrendingUp,
        title: `Emissions rose ${change.toFixed(1)}% this month`,
        body:
          `You are ${formatEmission(Math.abs(thisMonth - summary.previousMonth))} above ` +
          `last month. Worth checking whether one unusual activity caused it.`,
      });
    } else if (change < -5) {
      insights.push({
        tone: 'good',
        icon: TrendingDown,
        title: `Emissions fell ${Math.abs(change).toFixed(1)}% this month`,
        body:
          `That is ${formatEmission(Math.abs(summary.previousMonth - thisMonth))} saved ` +
          `against last month. Whatever changed, it is working.`,
      });
    }
  }

  // Goals nudge
  if (!summary.activeGoals) {
    insights.push({
      tone: 'neutral',
      icon: Target,
      title: 'You have no active goals',
      body:
        'A target on your largest category turns a number you watch into a number ' +
        'you are actively bringing down.',
      action: { to: '/goals', label: 'Set a goal' },
    });
  }

  // Categories never logged - usually means the footprint is understated
  const untouched = CATEGORY_ORDER.filter((category) => !(breakdown[category] > 0));
  if (untouched.length >= 3 && summary.totalRecords > 0) {
    insights.push({
      tone: 'neutral',
      icon: Info,
      title: `${untouched.length} categories have no entries yet`,
      body:
        `Nothing logged under ${untouched.slice(0, 3).map(formatCategory).join(', ')}. ` +
        'Your real footprint is almost certainly higher than the figure above.',
    });
  }

  return insights;
}

// The tone is carried by the rule an insight hangs off, not by a tinted panel
// behind it. Warning is the instrument amber rather than --eco-orange, which
// measured under the 4.5:1 floor on the paper ground.
const TONE_STYLES = {
  good: { color: 'var(--eco-primary)', rule: 'rgba(var(--eco-primary-rgb), 0.55)' },
  warning: { color: 'var(--readout)', rule: 'rgba(var(--readout-rgb), 0.55)' },
  neutral: { color: 'var(--eco-text-muted)', rule: 'var(--rule-strong)' },
};

// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { profile } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const {
    summary,
    monthlyChart,
    categoryChart,
    loading,
    refreshing,
    error,
    lastUpdated,
    reload,
  } = useDashboard();

  const firstName = profile?.name?.split(' ')[0] || 'there';

  // Same reasoning as ProtectedRoute's own use of this hook: the backend can
  // take several real seconds to answer on a cold start, and a skeleton with
  // no explanation for why it is taking this long reads as stuck rather than
  // merely slow once that stretches past a few seconds.
  const showSlowHint = useSlowLoadHint(loading);

  // ---------- error ----------
  if (error && !summary) {
    return (
      <div className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        {/* A failed read is still a state the instrument reports, so it is a
            channel like every other - under a danger-coloured rule rather than
            centred in a card. */}
        <div style={{ maxWidth: 560, paddingTop: '1.1rem', borderTop: '2px solid var(--eco-danger)' }}>
          <AlertTriangle size={22} style={{ color: 'var(--eco-danger)', display: 'block', marginBottom: '0.9rem' }} />
          <span className="eco-marker" style={{ display: 'block', marginBottom: '0.6rem' }}>
            No signal
          </span>
          <h2 className="eco-display" style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.2rem)', margin: '0 0 0.7rem' }}>
            Could not load your dashboard
          </h2>
          <p className="eco-text-muted" style={{ margin: '0 0 1.6rem', fontSize: '0.92rem' }}>
            {error}
          </p>
          <button type="button" className="eco-btn eco-btn-primary" onClick={reload}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ---------- first load ----------
  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
        <SkeletonBanner />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
            // Matches the gap the real readings use, so nothing shifts sideways
            // when the data arrives
            gap: '1.8rem',
            marginBottom: '2.5rem',
          }}
        >
          {[0, 1, 2, 3].map((index) => (
            <SkeletonStatCard key={index} />
          ))}
        </div>
        <SkeletonGlobalPicture />
        <div style={{ display: 'grid', gap: '2.5rem' }}>
          <SkeletonChart height={280} />
          <SkeletonChart height={280} />
        </div>

        {showSlowHint && (
          <p
            className="eco-text-muted"
            style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '2rem' }}
          >
            Waking up the server — the first request after a quiet spell can take a few seconds.
          </p>
        )}
      </div>
    );
  }

  const hasData = (summary?.totalRecords || 0) > 0;
  const insights = buildInsights(summary);

  // Category chart data, filtered to categories that actually have emissions -
  // seven slices where four are zero is harder to read, not more complete
  const activeCategoryIndexes = (categoryChart?.data || [])
    .map((value, index) => ({ value, index }))
    .filter((item) => item.value > 0)
    .map((item) => item.index);

  const doughnutLabels = activeCategoryIndexes.map((i) => categoryChart.labels[i]);
  const doughnutData = activeCategoryIndexes.map((i) => categoryChart.data[i]);
  const doughnutColors = activeCategoryIndexes.map(
    (i) => CATEGORY_META[categoryChart.keys[i]]?.color || '#8888aa'
  );

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      {/* ============ 1. HEADER (image banner) ============ */}
      {/* Was a hand-rolled copy of PageBanner. Now the shared one, so the
          scroll parallax and any future change land on all four app pages at
          once instead of three of them. */}
      <PageBanner
        photo="earth"
        alt="The Earth seen from space"
        color="var(--cat-water)"
        title="Welcome back,"
        titleAccent={firstName}
        subtitle={
          hasData
            ? 'Here is where your footprint stands today.'
            : 'Log your first activity to bring this dashboard to life.'
        }
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            {lastUpdated && (
              <span
                className="eco-marker"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.66rem',
                }}
              >
                {/* The icon spins only while a refresh is actually in flight */}
                <RefreshCw
                  size={12}
                  style={{
                    animation:
                      refreshing && !prefersReducedMotion
                        ? 'eco-spin 1s linear infinite'
                        : 'none',
                  }}
                />
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            <Link to="/calculator" className="eco-btn eco-btn-primary">
              <Plus size={17} />
              Log emission
            </Link>
          </div>
        }
      />

      {/* ============ EMPTY STATE ============ */}
      {!hasData && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          // The instrument reporting that it has nothing to report: an amber
          // rule, the same one the Estimate readout panel hangs off.
          style={{
            paddingTop: '1.1rem',
            borderTop: '2px solid var(--readout)',
            marginBottom: '2.5rem',
          }}
        >
          <Leaf size={22} style={{ color: 'var(--eco-primary)', display: 'block', marginBottom: '0.9rem' }} />
          <span className="eco-marker" style={{ display: 'block', marginBottom: '0.6rem' }}>
            No readings
          </span>
          <h2 className="eco-display" style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.2rem)', margin: '0 0 0.7rem' }}>
            Nothing logged yet
          </h2>
          <p className="eco-text-muted" style={{ maxWidth: '54ch', margin: '0 0 1.6rem' }}>
            Your first entry takes about thirty seconds. Log one car journey or one
            electricity bill and every chart below fills in.
          </p>
          <Link to="/calculator" className="eco-btn eco-btn-primary">
            Open the calculator
            <ArrowRight size={17} />
          </Link>
        </motion.div>
      )}

      {/* ============ 2. STAT CARDS ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
          // Wider gaps than a card grid needs. With no card edges to separate
          // them, the whitespace is what groups each reading with its label -
          // the same spacing the hero readings use on Home.
          gap: '1.8rem',
          marginBottom: '2.5rem',
        }}
      >
        <StatCard
          icon={CalendarDays}
          label="This month"
          value={summary?.thisMonth || 0}
          unit="kg CO₂"
          trend={summary?.trend}
          change={summary?.percentageChange}
          accent="var(--cat-transport)"
          delay={0}
        />
        <StatCard
          icon={Activity}
          label="This year"
          value={summary?.thisYear || 0}
          unit="kg CO₂"
          accent="var(--org-goldstandard)"
          hint={`${formatNumber(summary?.totalRecords || 0, 0)} entries logged in total`}
          delay={0.06}
        />
        <StatCard
          icon={Leaf}
          label="Best category"
          value={summary?.bestCategory?.thisMonth || 0}
          unit="kg CO₂"
          accent="var(--cat-water)"
          decimals={1}
          hint={
            summary?.bestCategory
              ? summary.bestCategory.reason === 'largest_reduction'
                ? `${formatCategory(summary.bestCategory.category)} — your biggest cut this month`
                : `${formatCategory(summary.bestCategory.category)} — your lowest emitter`
              : 'No activity logged yet'
          }
          delay={0.12}
        />
        <StatCard
          icon={Target}
          label="Active goals"
          value={summary?.activeGoals || 0}
          decimals={0}
          accent="var(--cat-electricity)"
          hint={summary?.activeGoals ? 'In progress right now' : 'No goals set yet'}
          delay={0.18}
        />
      </div>

      {/* ============ 2b. FORECAST & STREAK (compact, links to /insights) ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.8rem',
          marginBottom: '2.5rem',
        }}
      >
        <div className="eco-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span className="eco-marker">This month's forecast</span>
            <Link to="/insights" className="eco-text-muted" style={{ fontSize: '0.78rem' }}>
              Full forecast →
            </Link>
          </div>
          <ForecastGauge compact />
        </div>

        <div className="eco-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span className="eco-marker">Logging streak</span>
            <Link to="/insights" className="eco-text-muted" style={{ fontSize: '0.78rem' }}>
              Swap ideas →
            </Link>
          </div>
          <StreakFlame compact />
        </div>
      </div>

      {/* ============ 3. THE BIGGER PICTURE ============ */}
      {/* Moved up from the bottom of the page to right here, straight after
          the stat row - the numbers-only zone right after the header was
          exactly what read as cramped, and a real photograph is what that
          space needed rather than another chart. Extracted into its own
          component (GlobalPictureSection) rather than inline: it's a
          self-contained, animated block, the same shape ImpactEquivalents
          was created to solve. */}
      <GlobalPictureSection />

      {/* ============ 4. TREND LINE ============ */}
      {/* Every panel on this page loses its card. A chart is already a bounded
          object with its own axes; putting it inside a lifted, bordered,
          shadowed box drew a second frame around a thing that was already
          framed. A rule and a heading is enough to say where one panel ends and
          the next begins. */}
      <Reveal style={{ marginBottom: '2.5rem', display: 'block', paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.4rem',
          }}
        >
          <div>
            <h2 className="eco-display" style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>
              Six-month trend
            </h2>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Total emissions per month, oldest to newest
            </p>
          </div>
          <span className="eco-marker">kg CO₂ per month</span>
        </div>

        <TrendLineChart
          labels={monthlyChart?.labels || []}
          data={monthlyChart?.data || []}
          height={290}
        />
      </Reveal>

      {/* ============ 5 + 6. BREAKDOWN AND IMPACT ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'clamp(2rem, 4vw, 3rem)',
          marginBottom: '2.5rem',
        }}
      >
        {/* Doughnut with a custom legend underneath */}
        <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <h2 className="eco-display" style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>
            Where it comes from
          </h2>
          <p className="eco-text-muted" style={{ margin: '0 0 1.4rem', fontSize: '0.85rem' }}>
            This month, split by category
          </p>

          {doughnutData.length > 0 ? (
            <>
              <CategoryDoughnutChart
                labels={doughnutLabels}
                data={doughnutData}
                colors={doughnutColors}
                height={250}
              />

              {/* A hand-built legend rather than Chart.js's own, so it can show
                  the value and the share alongside each colour */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.6rem',
                  marginTop: '1.3rem',
                }}
              >
                {doughnutLabels.map((label, index) => {
                  const value = doughnutData[index];
                  const share =
                    categoryChart.total > 0 ? (value / categoryChart.total) * 100 : 0;

                  return (
                    <div
                      key={label}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: doughnutColors[index],
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: '0.82rem', flex: 1, minWidth: 0 }}>{label}</span>
                      {/* The share is a measured quantity, so it is a readout -
                          it was muted grey text, which read as a caption rather
                          than as the number it is. */}
                      <span
                        className="eco-readout"
                        style={{ fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap' }}
                      >
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="eco-text-muted" style={{ fontSize: '0.9rem' }}>
              No emissions recorded this month yet.
            </p>
          )}
        </div>

        {/* The pictorial "what does this mean" panel */}
        <ImpactEquivalents
          emissionKg={summary?.thisMonth || 0}
          title="What this month actually means"
          subtitle={
            summary?.thisMonth
              ? `${formatNumber(summary.thisMonth, 1)} kg of CO₂, in everyday terms`
              : ''
          }
        />
      </div>

      {/* ============ 7. THIS MONTH VS LAST ============ */}
      <Reveal style={{ marginBottom: '2.5rem', display: 'block', paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.4rem',
          }}
        >
          <div>
            <h2 className="eco-display" style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>
              This month against last
            </h2>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Category by category — shorter bars are better
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.9rem', fontSize: '0.78rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: 'var(--eco-purple)',
                }}
              />
              Last month
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: 'var(--eco-primary)',
                }}
              />
              This month
            </span>
          </div>
        </div>

        <ComparisonBarChart
          labels={categoryChart?.labels || []}
          currentData={categoryChart?.data || []}
          previousData={categoryChart?.previousData || []}
          height={330}
        />
      </Reveal>

      {/* ============ 8. INSIGHTS ============ */}
      {insights.length > 0 && (
        <div style={{ marginBottom: '2.5rem', paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.4rem',
            }}
          >
            <Lightbulb size={18} style={{ color: 'var(--readout)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.25rem', margin: 0 }}>
              What the numbers are telling you
            </h2>
          </div>

          <div style={{ display: 'grid', gap: '1.2rem' }}>
            {insights.map((insight, index) => {
              const Icon = insight.icon;
              const tone = TONE_STYLES[insight.tone] || TONE_STYLES.neutral;

              return (
                <motion.div
                  key={insight.title}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: false, amount: 0.4 }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                  // Each observation was a tinted, bordered, rounded box - a
                  // notification component. An insight is a line of reasoning
                  // about a reading, so it hangs off a rule in its own tone:
                  // amber where something needs attention, green where
                  // something improved, a plain hairline where it is neutral.
                  style={{
                    display: 'flex',
                    gap: '0.85rem',
                    paddingTop: '0.85rem',
                    borderTop: `1px solid ${tone.rule}`,
                  }}
                >
                  <Icon size={18} style={{ color: tone.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="eco-display" style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: '0.25rem' }}>
                      {insight.title}
                    </div>
                    <div
                      className="eco-text-muted"
                      style={{ fontSize: '0.85rem', lineHeight: 1.55 }}
                    >
                      {insight.body}
                    </div>

                    {insight.action && (
                      <Link
                        to={insight.action.to}
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          marginTop: '0.5rem',
                        }}
                      >
                        {insight.action.label}
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ 9. SDG 13 CONTEXT ============ */}
      {/* The last glow orb in the signed-in app, and the gradient disc behind
          the icon, both go the same way as everywhere else. */}
      <Reveal style={{ display: 'block', paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <div style={{ display: 'flex', gap: '1.1rem' }}>
          <Cloud size={20} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 4 }} />

          <div>
            <h2 className="eco-display" style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>
              Your number in context — <span className="eco-gradient-text">SDG 13</span>
            </h2>
            <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0, maxWidth: '64ch', lineHeight: 1.7 }}>
              To hold warming to 1.5 °C, the average person needs a footprint of
              roughly <strong style={{ color: 'var(--eco-text)' }}>2,000 kg CO₂ per year</strong>,
              or about 167 kg a month. Your current month sits at{' '}
              <strong style={{ color: 'var(--eco-primary)' }}>
                {formatEmission(summary?.thisMonth || 0)}
              </strong>
              {summary?.thisMonth > 0 && (
                <>
                  {' '}
                  — that is{' '}
                  <strong style={{ color: 'var(--eco-text)' }}>
                    {((summary.thisMonth / 167) * 100).toFixed(0)}%
                  </strong>{' '}
                  of that budget.
                </>
              )}
            </p>
          </div>
        </div>
      </Reveal>

      {/* ============ 10. GIVE TO THE CAUSE ============ */}
      {/* Last on the page on purpose: it only makes its case once someone has
          seen their own numbers. Donations are forwarded to climate
          organisations - see the donate page - and EcoTrack keeps nothing. */}
      <Reveal>
        <div
          style={{
            marginTop: '2.5rem',
            paddingTop: '1.05rem',
            borderTop: '1px solid var(--rule-strong)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.2rem',
            flexWrap: 'wrap',
          }}
        >
          <Heart size={20} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />

          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: '0 0 0.35rem' }}>
              Cutting your own footprint is one lever
            </h2>
            <p className="eco-text-muted" style={{ fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              The other is funding the people already doing it. Anything you give
              through EcoTrack goes straight on to climate organisations — we keep
              nothing.
            </p>
          </div>

          <Link to="/donate" className="eco-btn eco-btn-primary" style={{ flexShrink: 0 }}>
            <Heart size={16} />
            Give to the cause
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
