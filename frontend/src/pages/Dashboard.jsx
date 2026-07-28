// EcoTrack/frontend/src/pages/Dashboard.jsx
// The main screen for a signed-in user.
//
// SECTIONS, IN ORDER
//   1. Greeting and last-updated line
//   2. Four stat cards        - this month, this year, best category, active goals
//   3. Six-month trend line   - is the footprint going up or down over time
//   4. Category doughnut      - what the footprint is made of, right now
//   5. Impact equivalents     - what the number actually means in real terms
//   6. This month vs last     - which categories moved, and in which direction
//   7. Insights               - plain-English observations drawn from the data
//   8. SDG 13 context strip   - ties the personal number to the global goal
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
import Photo from '../components/Photo';
import Reveal from '../components/Reveal';
import { PHOTOS } from '../utils/photos';
import {
  CategoryDoughnutChart,
  ComparisonBarChart,
  TrendLineChart,
} from '../components/EmissionChart';
import { SkeletonChart, SkeletonStatCard } from '../components/SkeletonCard';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';
import { formatCategory, formatEmission, formatNumber } from '../utils/formatters';

// ---------------------------------------------------------------------------
// THE GLOBAL PICTURE
//
// Educational context shown on every dashboard: where the world's emissions
// actually come from, tied back to the EcoTrack category the user can act on.
// Every percentage is a published figure with its source named, so it can be
// cited in the report and defended in the viva - not a number we made up.
// ---------------------------------------------------------------------------

const GLOBAL_SOURCES = [
  {
    photo: 'powerPlant4',
    alt: 'An electricity transmission pylon in a field',
    title: 'Energy & electricity',
    share: '~25%',
    color: '#f59e0b',
    body: 'Producing electricity and heat is the single largest source of global emissions, because so much of it still burns coal and gas.',
    tie: 'Your Electricity category',
    source: 'IPCC / EPA',
  },
  {
    photo: 'traffic4',
    alt: 'Cars on a road',
    title: 'Transport',
    share: '~24%',
    color: '#00ff87',
    body: 'Cars, trucks, ships and planes together, and the fastest-growing source of emissions in most countries.',
    tie: 'Your Transport category',
    source: 'IEA',
  },
  {
    photo: 'factory3',
    alt: 'A large industrial factory',
    title: 'Industry',
    share: '~21%',
    color: '#7c3aed',
    body: 'Making steel, cement, chemicals and goods. Much of a product’s carbon is spent before it ever reaches you.',
    tie: 'Your Consumption category',
    source: 'EPA',
  },
  {
    photo: 'forest3',
    alt: 'Green forest on a mountainside',
    title: 'Land use & waste',
    share: '~18%',
    color: '#0ea5e9',
    body: 'Deforestation, farming and rotting landfill. This slice both emits carbon and destroys the forests that would absorb it.',
    tie: 'Your Diet & Waste categories',
    source: 'Our World in Data',
  },
];

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

const TONE_STYLES = {
  good: { color: 'var(--eco-primary)', background: 'rgba(var(--eco-primary-rgb), 0.08)' },
  warning: { color: 'var(--eco-orange)', background: 'rgba(245, 158, 11, 0.08)' },
  neutral: { color: 'var(--eco-text-muted)', background: 'rgba(var(--eco-primary-rgb), 0.04)' },
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

  // ---------- error ----------
  if (error && !summary) {
    return (
      <div className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div className="eco-card" style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <AlertTriangle size={40} style={{ color: 'var(--eco-orange)' }} />
          <h2 style={{ fontSize: '1.25rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
            Could not load your dashboard
          </h2>
          <p className="eco-text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
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
        <div
          className="eco-skeleton"
          style={{ width: 260, height: 34, borderRadius: 8, marginBottom: '2rem' }}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {[0, 1, 2, 3].map((index) => (
            <SkeletonStatCard key={index} />
          ))}
        </div>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <SkeletonChart height={280} />
          <SkeletonChart height={280} />
        </div>
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
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="eco-card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: 0,
          marginBottom: '1.5rem',
          minHeight: 176,
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        {/* Earth from space, sitting behind the greeting */}
        <Photo
          id={PHOTOS.earth}
          alt="The Earth seen from space"
          width={1500}
          color="#0ea5e9"
          className="eco-photo-cover"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(110deg, rgba(4,20,12,0.92) 0%, rgba(4,20,12,0.72) 45%, rgba(4,20,12,0.35) 100%)',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: 'clamp(1.3rem, 3vw, 1.9rem)',
          }}
        >
          <div>
            <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.3rem', color: '#fff' }}>
              Welcome back,{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, var(--eco-primary), #7dd3fc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {firstName}
              </span>
            </h1>
            <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255,255,255,0.82)' }}>
              {hasData
                ? 'Here is where your footprint stands today.'
                : 'Log your first activity to bring this dashboard to life.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            {lastUpdated && (
              <span
                style={{
                  fontSize: '0.76rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  color: 'rgba(255,255,255,0.75)',
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
        </div>
      </motion.div>

      {/* ============ EMPTY STATE ============ */}
      {!hasData && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="eco-card"
          style={{ textAlign: 'center', padding: '3rem 1.5rem', marginBottom: '1.5rem' }}
        >
          <Leaf size={44} style={{ color: 'var(--eco-primary)', opacity: 0.65 }} />
          <h2 style={{ fontSize: '1.3rem', marginTop: '1.1rem', marginBottom: '0.6rem' }}>
            Nothing logged yet
          </h2>
          <p className="eco-text-muted" style={{ maxWidth: 440, margin: '0 auto 1.6rem' }}>
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
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard
          icon={CalendarDays}
          label="This month"
          value={summary?.thisMonth || 0}
          unit="kg CO₂"
          trend={summary?.trend}
          change={summary?.percentageChange}
          accent="#00ff87"
          delay={0}
        />
        <StatCard
          icon={Activity}
          label="This year"
          value={summary?.thisYear || 0}
          unit="kg CO₂"
          accent="#7c3aed"
          hint={`${formatNumber(summary?.totalRecords || 0, 0)} entries logged in total`}
          delay={0.06}
        />
        <StatCard
          icon={Leaf}
          label="Best category"
          value={summary?.bestCategory?.thisMonth || 0}
          unit="kg CO₂"
          accent="#0ea5e9"
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
          accent="#f59e0b"
          hint={summary?.activeGoals ? 'In progress right now' : 'No goals set yet'}
          delay={0.18}
        />
      </div>

      {/* ============ 3. TREND LINE ============ */}
      <Reveal className="eco-card" style={{ marginBottom: '1.5rem', display: 'block' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.2rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.08rem', marginBottom: '0.2rem' }}>Six-month trend</h2>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Total emissions per month, oldest to newest
            </p>
          </div>
          <span className="eco-badge eco-badge-low">kg CO₂ per month</span>
        </div>

        <TrendLineChart
          labels={monthlyChart?.labels || []}
          data={monthlyChart?.data || []}
          height={290}
        />
      </Reveal>

      {/* ============ 4 + 5. BREAKDOWN AND IMPACT ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Doughnut with a custom legend underneath */}
        <div className="eco-card">
          <h2 style={{ fontSize: '1.08rem', marginBottom: '0.2rem' }}>Where it comes from</h2>
          <p className="eco-text-muted" style={{ margin: '0 0 1.2rem', fontSize: '0.82rem' }}>
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
                      <span
                        className="eco-text-muted"
                        style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
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

      {/* ============ 6. THIS MONTH VS LAST ============ */}
      <Reveal className="eco-card" style={{ marginBottom: '1.5rem', display: 'block' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.2rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.08rem', marginBottom: '0.2rem' }}>
              This month against last
            </h2>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
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

      {/* ============ 7. INSIGHTS ============ */}
      {insights.length > 0 && (
        <div className="eco-card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.2rem',
            }}
          >
            <Lightbulb size={19} style={{ color: 'var(--eco-orange)' }} />
            <h2 style={{ fontSize: '1.08rem', margin: 0 }}>What the numbers are telling you</h2>
          </div>

          <div style={{ display: 'grid', gap: '0.8rem' }}>
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
                  style={{
                    display: 'flex',
                    gap: '0.85rem',
                    padding: '0.95rem 1.1rem',
                    borderRadius: 'var(--eco-radius-sm)',
                    background: tone.background,
                    border: '1px solid var(--eco-border)',
                  }}
                >
                  <Icon size={19} style={{ color: tone.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.2rem' }}>
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

      {/* ============ 8. THE GLOBAL PICTURE ============ */}
      {/* Zooms out from the user's own number to where the world's emissions
          come from, with an illustration and a cited figure for each. Every
          card links to the EcoTrack category the user can actually act on. */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '1.2rem' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '0.25rem' }}>
            The bigger picture
          </h2>
          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
            Where the world&rsquo;s carbon comes from — and the category of yours that maps to it
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.2rem',
          }}
        >
          {GLOBAL_SOURCES.map((item, index) => (
            <motion.div
              key={item.title}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.2 }}
              transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="eco-card eco-card-hover eco-photo-zoom"
              style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              {/* photo band */}
              <div style={{ height: 118, overflow: 'hidden' }}>
                <Photo
                  id={PHOTOS[item.photo]}
                  alt={item.alt}
                  width={520}
                  color={item.color}
                  className="eco-photo-cover"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>

              {/* text */}
              <div style={{ padding: '0.9rem 1.2rem 1.3rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <h3 style={{ fontSize: '1rem', margin: 0 }}>{item.title}</h3>
                  <span
                    className="eco-tabular"
                    style={{
                      fontFamily: 'Space Grotesk, sans-serif',
                      fontWeight: 700,
                      fontSize: '1.15rem',
                      color: item.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.share}
                  </span>
                </div>

                <p
                  className="eco-text-muted"
                  style={{ fontSize: '0.82rem', lineHeight: 1.6, margin: '0 0 0.9rem' }}
                >
                  {item.body}
                </p>

                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    paddingTop: '0.7rem',
                    borderTop: '1px solid var(--eco-border)',
                  }}
                >
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, color: item.color }}>
                    {item.tie}
                  </span>
                  <span className="eco-text-muted" style={{ fontSize: '0.68rem' }}>
                    {item.source}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ============ 9. SDG 13 CONTEXT ============ */}
      <Reveal className="eco-card" style={{ position: 'relative', overflow: 'hidden', display: 'block' }}>
        <div
          className="eco-glow-orb eco-glow-orb-green"
          style={{ width: 300, height: 300, top: '-60%', right: '-10%' }}
        />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '1.1rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
              color: '#04140c',
            }}
          >
            <Cloud size={22} />
          </div>

          <div>
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
              Your number in context — <span className="eco-gradient-text">SDG 13</span>
            </h2>
            <p className="eco-text-muted" style={{ fontSize: '0.88rem', margin: 0, maxWidth: 640 }}>
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
    </div>
  );
}
