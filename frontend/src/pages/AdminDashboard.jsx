// EcoTrack/frontend/src/pages/AdminDashboard.jsx
// Platform-wide statistics and user management, for admins only.
//
// TWO LAYERS OF PROTECTION (worth stating in the viva)
// Reaching this page needs a document at admins/{uid} in Firestore.
// ProtectedRoute checks that in the browser so a normal user never sees the
// page - but that check is only convenience. The real guard is the backend:
// every /api/admin/* route re-verifies the admins collection on the server on
// every request. Editing JavaScript in the browser to force this page to
// render would still get nothing but 403s from the API.
//
// All numbers come from GET /api/admin/stats and GET /api/admin/users. This
// page calculates nothing itself; it arranges what the backend already totalled.

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  Database,
  Eye,
  FileText,
  HeartHandshake,
  Leaf,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

import { adminApi, getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import StatCard from '../components/StatCard';
import { CategoryDoughnutChart, TrendLineChart } from '../components/EmissionChart';
import { SkeletonStatCard, SkeletonTable } from '../components/SkeletonCard';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';
import {
  formatCategory,
  formatDate,
  formatEmission,
  formatNumber,
  formatRelativeDate,
  getInitials,
  truncate,
} from '../utils/formatters';
import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';

export default function AdminDashboard() {
  const { profile, user } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Which panel is showing. The console had grown to six stacked sections and
  // roughly 1,700 lines of page; splitting it means the thing you came for is
  // never four scrolls away. The drill-down and delete dialogs sit outside the
  // tabs because they are overlays - they must open from any panel.
  const [tab, setTab] = useState('overview');

  const [search, setSearch] = useState('');
  // The user currently queued for deletion, held while the confirm dialog is open
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Feedback submitted through the public form
  const [feedback, setFeedback] = useState([]);
  const [averageRating, setAverageRating] = useState(null);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState(null);

  // Verified Razorpay donations. Amounts arrive in paise and are divided by 100
  // only at the point of display, so the total never accumulates rounding error.
  const [donations, setDonations] = useState([]);
  const [totalPaise, setTotalPaise] = useState(0);
  const [deletingDonationId, setDeletingDonationId] = useState(null);

  // Live service status. Kept out of the main load()'s Promise.all: it makes a
  // real round trip to Firestore to time it, so pairing it with the queries it
  // is measuring would slow every dashboard load to prove a point.
  const [system, setSystem] = useState(null);
  const [systemLoading, setSystemLoading] = useState(false);

  // The per-user drill-down: which user's full detail is open, the loaded data,
  // and whether it is still loading / failed
  const [detailUid, setDetailUid] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // ---------------------------------------------------------------------
  const load = async () => {
    setLoading(true);
    try {
      // All four requests at once rather than one after another
      const [statsData, usersData, feedbackData, donationsData] = await Promise.all([
        adminApi.getStats(),
        adminApi.getUsers(),
        adminApi.getFeedback(),
        adminApi.getDonations(),
      ]);
      setStats(statsData);
      setUsers(usersData.users || []);
      setFeedback(feedbackData.feedback || []);
      setAverageRating(feedbackData.averageRating ?? null);
      setDonations(donationsData.donations || []);
      setTotalPaise(donationsData.totalPaise || 0);
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load the admin dashboard.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFeedback = async (id) => {
    setDeletingFeedbackId(id);
    try {
      await adminApi.deleteFeedback(id);
      setFeedback((current) => current.filter((item) => item.id !== id));
      toast.success('Feedback deleted.');
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Could not delete that feedback.'));
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const loadSystem = async () => {
    setSystemLoading(true);
    try {
      setSystem(await adminApi.getSystem());
    } catch (requestError) {
      // A failed health check is itself a health signal, so show it as one
      // rather than as an empty panel.
      setSystem({
        overall: 'down',
        checks: [
          {
            id: 'api',
            label: 'API',
            status: 'down',
            detail: getErrorMessage(requestError, 'The status check itself failed.'),
          },
        ],
      });
    } finally {
      setSystemLoading(false);
    }
  };

  // Fetch on first visit to the tab, then leave it alone - it has its own
  // refresh button, and re-running a timed round trip on every tab switch
  // would be noise.
  useEffect(() => {
    if (tab === 'system' && !system && !systemLoading) loadSystem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleDeleteDonation = async (id, amount) => {
    setDeletingDonationId(id);
    try {
      await adminApi.deleteDonation(id);
      setDonations((current) => current.filter((item) => item.id !== id));
      // Keep the headline total in step with the row that just went
      setTotalPaise((current) => Math.max(0, current - (amount || 0)));
      toast.success('Donation record deleted.');
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Could not delete that donation record.'));
    } finally {
      setDeletingDonationId(null);
    }
  };

  // Open the drill-down for one user and fetch their full detail + activity
  const openDetail = async (uid) => {
    setDetailUid(uid);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const data = await adminApi.getUserDetail(uid);
      setDetail(data);
    } catch (requestError) {
      setDetailError(getErrorMessage(requestError, 'Could not load that user.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailUid(null);
    setDetail(null);
    setDetailError(null);
  };

  useEffect(() => {
    load();
  }, []);

  // Search filters the already-loaded list in the browser, so typing is
  // instant and does not fire a request on every keystroke. The backend search
  // parameter exists too, but for the handful of users this app will have,
  // filtering here is simpler and faster.
  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)
    );
  }, [users, search]);

  // Category totals for the doughnut, filtered to categories with real data
  // The open user's own figures, shaped for the same chart components the rest
  // of the console uses. Built here rather than in the drill-down markup so the
  // work is memoised and does not repeat on every unrelated re-render.
  const detailCharts = useMemo(() => {
    if (!detail) return { category: { labels: [], data: [], colors: [] }, trend: { labels: [], data: [] } };

    const entries = CATEGORY_ORDER.map((key) => ({
      key,
      value: detail.summary?.categoryTotals?.[key] || 0,
    })).filter((item) => item.value > 0);

    // Monthly totals from their records. Dates are "YYYY-MM-DD" strings, so the
    // first seven characters are the month key and sort chronologically as text.
    const byMonth = new Map();
    (detail.records || []).forEach((record) => {
      const key = String(record.recordedDate || '').slice(0, 7);
      if (key.length !== 7) return;
      byMonth.set(key, (byMonth.get(key) || 0) + (record.emissionKgco2 || 0));
    });
    const months = [...byMonth.keys()].sort();

    return {
      category: {
        labels: entries.map((item) => formatCategory(item.key)),
        data: entries.map((item) => item.value),
        colors: entries.map((item) => CATEGORY_META[item.key]?.color || '#8888aa'),
      },
      trend: {
        labels: months,
        data: months.map((key) => Math.round(byMonth.get(key) * 100) / 100),
      },
    };
  }, [detail]);

  // One chronological stream of everything that has happened on the platform.
  // The three collections are already loaded for their own tabs, so this costs
  // no extra request - it just stops "what changed recently?" being a question
  // you answer by reading three separate lists and comparing dates by eye.
  const activity = useMemo(() => {
    const events = [];

    users.forEach((user) => {
      if (!user.createdAt) return;
      events.push({
        id: `join-${user.uid}`,
        at: user.createdAt,
        icon: Users,
        color: 'var(--eco-primary)',
        title: `${user.name || 'Someone'} joined`,
        detail: user.email,
        uid: user.uid,
      });
    });

    donations.forEach((donation) => {
      if (!donation.createdAt) return;
      events.push({
        id: `give-${donation.id}`,
        at: donation.createdAt,
        icon: HeartHandshake,
        color: 'var(--eco-purple)',
        title:
          donation.amount == null
            ? `${donation.name} donated`
            : `${donation.name} gave ₹${(donation.amount / 100).toLocaleString('en-IN')}`,
        detail: donation.razorpayPaymentId,
        uid: donation.userId || null,
      });
    });

    feedback.forEach((item) => {
      if (!item.createdAt) return;
      events.push({
        id: `say-${item.id}`,
        at: item.createdAt,
        icon: MessageSquare,
        color: 'var(--readout)',
        title: `${item.name} sent feedback`,
        detail: truncate(item.message, 80),
        uid: null,
      });
    });

    // ISO timestamps sort correctly as plain strings
    return events.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [users, donations, feedback]);

  // Growth, regions and who is actually using the thing.
  const insights = useMemo(() => {
    const byMonth = new Map();
    const regions = new Map();

    users.forEach((user) => {
      const key = String(user.createdAt || '').slice(0, 7);
      if (key.length === 7) byMonth.set(key, (byMonth.get(key) || 0) + 1);

      const region = user.region || 'Unknown';
      regions.set(region, (regions.get(region) || 0) + 1);
    });

    const months = [...byMonth.keys()].sort();

    return {
      months,
      signups: months.map((key) => byMonth.get(key)),
      peakSignups: Math.max(...byMonth.values(), 1),
      regions: [...regions.entries()].sort((a, b) => b[1] - a[1]),
      // Most active by entries logged, which is the thing the app is for.
      // Highest emissions would rank the least green user first, which is a
      // leaderboard nobody wants to top.
      topContributors: [...users]
        .filter((user) => user.recordCount > 0)
        .sort((a, b) => b.recordCount - a.recordCount)
        .slice(0, 5),
    };
  }, [users]);

  const categoryChart = useMemo(() => {
    if (!stats?.categoryTotals) return { labels: [], data: [], colors: [] };

    const entries = CATEGORY_ORDER.map((key) => ({
      key,
      value: stats.categoryTotals[key] || 0,
    })).filter((item) => item.value > 0);

    return {
      labels: entries.map((item) => formatCategory(item.key)),
      data: entries.map((item) => item.value),
      colors: entries.map((item) => CATEGORY_META[item.key]?.color || '#8888aa'),
    };
  }, [stats]);

  // Merge the user's records, goals and reports into one reverse-chronological
  // feed - "everything they have done", newest first. Built only when a
  // drill-down is open, and recomputed only when that user's data changes.
  const activityTimeline = useMemo(() => {
    if (!detail) return [];

    const events = [];

    (detail.records || []).forEach((record) => {
      events.push({
        id: `rec-${record.id}`,
        ts: record.createdAt || record.recordedDate || '',
        when: record.recordedDate || record.createdAt,
        icon: Leaf,
        color: CATEGORY_META[record.category]?.color || 'var(--eco-primary)',
        title: `Logged ${formatCategory(record.category)}`,
        detail: [
          record.quantity ? `${formatNumber(record.quantity, 0)} ${record.unit}`.trim() : null,
          formatEmission(record.emissionKgco2),
        ]
          .filter(Boolean)
          .join('  ·  '),
      });
    });

    (detail.goals || []).forEach((goal) => {
      events.push({
        id: `goal-${goal.id}`,
        ts: goal.createdAt || '',
        when: goal.createdAt,
        icon: Target,
        color: 'var(--eco-purple)',
        title: `Set a ${formatCategory(goal.category)} goal`,
        detail: `Cut ${goal.targetReductionPercent}%  ·  ${goal.status}`,
      });
    });

    (detail.reports || []).forEach((report) => {
      events.push({
        id: `rep-${report.id}`,
        ts: report.createdAt || report.periodStart || '',
        when: report.createdAt || report.periodStart,
        icon: FileText,
        color: 'var(--cat-water)',
        title: `Generated a ${report.reportType || ''} report`.replace('  ', ' '),
        detail: `${report.periodStart} → ${report.periodEnd}`,
      });
    });

    // Newest first. Parsing to a timestamp handles the mix of full ISO strings
    // (createdAt) and plain YYYY-MM-DD dates (recordedDate) consistently.
    return events.sort((a, b) => {
      const timeA = new Date(a.ts).getTime() || 0;
      const timeB = new Date(b.ts).getTime() || 0;
      return timeB - timeA;
    });
  }, [detail]);

  const handleDelete = async () => {
    if (!confirmDelete) return;

    setDeleting(true);
    try {
      const result = await adminApi.deleteUser(confirmDelete.uid);
      toast.success(
        `Deleted ${confirmDelete.name} and ${result.deletedRecords} record(s).`
      );
      // Remove locally rather than re-fetching everything
      setUsers((current) => current.filter((u) => u.uid !== confirmDelete.uid));
      setConfirmDelete(null);
      // The platform totals are now stale, so refresh just those quietly
      adminApi.getStats().then(setStats).catch(() => {});
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Could not delete that user.'));
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------------------------
  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
        <div
          className="eco-skeleton"
          style={{ width: 280, height: 34, borderRadius: 8, marginBottom: '2rem' }}
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
        <SkeletonTable rows={6} columns={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div style={{ maxWidth: 560, paddingTop: '1.1rem', borderTop: '2px solid var(--eco-danger)' }}>
          <AlertTriangle size={22} style={{ color: 'var(--eco-danger)', display: 'block', marginBottom: '0.9rem' }} />
          <span className="eco-marker" style={{ display: 'block', marginBottom: '0.6rem' }}>
            No signal
          </span>
          <h2 className="eco-display" style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.2rem)', margin: '0 0 0.7rem' }}>
            Could not load the admin dashboard
          </h2>
          <p className="eco-text-muted" style={{ margin: '0 0 1.6rem', fontSize: '0.92rem' }}>
            {error}
          </p>
          <button type="button" className="eco-btn eco-btn-primary" onClick={load}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      {/* ============ HEADER ============ */}
      {/* This was the last hand-rolled banner in the app - a photograph under a
          scrim reaching 95% black, a violet radial glow, a purple gradient
          pill and "centre" set in a purple-to-blue gradient. Every one of
          those is the dark-page device removed from the rest of the product;
          this page had simply never had the pass applied. It now matches the
          restyled PageBanner: the plate stands alone, the caption sits under a
          rule beneath it, and the headline figures are amber readouts instead
          of white Space Grotesk. */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: '2.2rem' }}
      >
        <div
          className="eco-photo-zoom"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 'var(--eco-radius-sm)',
            height: 'clamp(140px, 20vh, 210px)',
          }}
        >
          <Photo
            id={PHOTOS.adminBanner}
            alt="Aerial view of a city lit up at night"
            width={1600}
            color="var(--org-goldstandard)"
            loading="eager"
            className="eco-photo-cover"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '1.2rem',
            paddingTop: '0.95rem',
            borderTop: '1px solid var(--rule-strong)',
          }}
        >
          <div>
            <span
              className="eco-marker"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}
            >
              <Shield size={13} style={{ color: 'var(--eco-primary)' }} />
              Admin console
            </span>
            <h1 className="eco-display" style={{ fontSize: 'clamp(1.9rem, 4.4vw, 2.9rem)', margin: '0 0 0.45rem' }}>
              Command <span className="eco-gradient-text">centre</span>
            </h1>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.95rem' }}>
              Signed in as {profile?.email}
            </p>
          </div>

          <button type="button" onClick={load} className="eco-btn eco-btn-ghost">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {/* headline readings, right under the caption, so the top of the page
            is never empty */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'clamp(1.5rem, 4vw, 2.6rem)',
            marginTop: '1.6rem',
          }}
        >
          {[
            { label: 'Users', value: formatNumber(stats?.totalUsers || 0, 0) },
            { label: 'Records', value: formatNumber(stats?.totalRecords || 0, 0) },
            { label: 'Total CO₂', value: formatEmission(stats?.totalEmission || 0) },
            { label: 'Feedback', value: formatNumber(feedback.length, 0) },
            { label: 'Raised', value: `₹${(totalPaise / 100).toLocaleString('en-IN')}` },
          ].map((item) => (
            <div
              key={item.label}
              style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--rule-strong)' }}
            >
              <div
                className="eco-readout"
                style={{ fontSize: 'clamp(1.3rem, 2.6vw, 1.7rem)', fontWeight: 500, lineHeight: 1 }}
              >
                {item.value}
              </div>
              <div className="eco-marker" style={{ marginTop: '0.4rem' }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ============ TABS ============ */}
      <div
        style={{
          display: 'flex',
          gap: '0.3rem',
          flexWrap: 'wrap',
          marginTop: '1.6rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--eco-border)',
          paddingBottom: '0.55rem',
        }}
      >
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3, count: null },
          { id: 'insights', label: 'Insights', icon: TrendingUp, count: null },
          { id: 'activity', label: 'Activity', icon: Activity, count: activity.length },
          { id: 'users', label: 'Users', icon: Users, count: users.length },
          { id: 'donations', label: 'Donations', icon: HeartHandshake, count: donations.length },
          { id: 'feedback', label: 'Feedback', icon: MessageSquare, count: feedback.length },
          { id: 'system', label: 'System', icon: Activity, count: null, dot: system?.overall },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                position: 'relative',
                padding: '0.55rem 1rem',
                borderRadius: 'var(--eco-radius-sm)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: active ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
                transition: 'color 0.18s ease',
              }}
            >
              {/* One shared layoutId means the pill slides between tabs rather
                  than blinking out and in - the same trick the navbar uses. */}
              {active && !prefersReducedMotion && (
                <motion.span
                  layoutId="admin-tab-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'var(--eco-radius-sm)',
                    background: 'rgba(var(--eco-primary-rgb), 0.1)',
                    border: '1px solid rgba(var(--eco-primary-rgb), 0.25)',
                    zIndex: 0,
                  }}
                />
              )}
              <span
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                <Icon size={16} />
                {item.label}
                {/* a status pip on the System tab, so a problem is visible
                    without opening it */}
                {item.dot && (
                  <span
                    title={`System status: ${item.dot}`}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background:
                        item.dot === 'ok'
                          ? 'var(--eco-primary)'
                          : item.dot === 'warn'
                            ? 'var(--readout)'
                            : 'var(--eco-danger)',
                    }}
                  />
                )}
                {item.count != null && (
                  <span
                    className="eco-tabular"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.4rem',
                      borderRadius: 999,
                      background: active
                        ? 'rgba(var(--eco-primary-rgb), 0.2)'
                        : 'var(--eco-border)',
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ============ OVERVIEW TAB ============ */}
      {tab === 'overview' && (
      <motion.div
        key="tab-overview"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >

      {/* ============ STAT CARDS ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard
          icon={Users}
          label="Total users"
          value={stats?.totalUsers || 0}
          decimals={0}
          accent="var(--cat-transport)"
          hint={`${formatNumber(stats?.newUsersThisMonth || 0, 0)} new this month`}
          delay={0}
        />
        <StatCard
          icon={Database}
          label="Total records"
          value={stats?.totalRecords || 0}
          decimals={0}
          accent="var(--org-goldstandard)"
          hint={`${formatNumber(stats?.averageRecordsPerUser || 0, 1)} average per user`}
          delay={0.06}
        />
        <StatCard
          icon={BarChart3}
          label="Total emissions"
          value={stats?.totalEmission || 0}
          unit="kg CO₂"
          accent="var(--cat-water)"
          hint={`${formatEmission(stats?.emissionThisMonth || 0)} this month`}
          delay={0.12}
        />
        <StatCard
          icon={Target}
          label="Goal success rate"
          value={stats?.goalSuccessRate || 0}
          unit="%"
          decimals={1}
          accent="var(--cat-electricity)"
          hint={`${formatNumber(stats?.achievedGoals || 0, 0)} of ${formatNumber(
            stats?.totalGoals || 0,
            0
          )} goals achieved`}
          delay={0.18}
        />
      </div>

      {/* ============ SECONDARY STATS + CATEGORY CHART ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Platform-wide category split */}
        <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}
          >
            <Leaf size={17} style={{ color: 'var(--eco-primary)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>
              Emissions across all users
            </h2>
          </div>
          <p className="eco-text-muted" style={{ margin: '0 0 1.4rem', fontSize: '0.85rem' }}>
            Every logged entry, by category
          </p>

          {categoryChart.data.length > 0 ? (
            <>
              <CategoryDoughnutChart
                labels={categoryChart.labels}
                data={categoryChart.data}
                colors={categoryChart.colors}
                height={240}
              />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.6rem',
                  marginTop: '1.3rem',
                }}
              >
                {categoryChart.labels.map((label, index) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: categoryChart.colors[index],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '0.82rem', flex: 1, minWidth: 0 }}>{label}</span>
                    <span className="eco-readout" style={{ fontSize: '0.78rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {formatEmission(categoryChart.data[index])}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="eco-text-muted" style={{ fontSize: '0.9rem' }}>
              No emissions logged across the platform yet.
            </p>
          )}
        </div>

        {/* At-a-glance figures */}
        <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.4rem' }}
          >
            <TrendingUp size={17} style={{ color: 'var(--readout)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>At a glance</h2>
          </div>

          <div style={{ display: 'grid', gap: '0' }}>
            {[
              {
                icon: BarChart3,
                label: 'Average footprint per user',
                value: formatEmission(stats?.averageEmissionPerUser || 0),
              },
              {
                icon: Target,
                label: 'Active goals right now',
                value: formatNumber(stats?.activeGoals || 0, 0),
              },
              {
                icon: FileText,
                label: 'Reports generated',
                value: formatNumber(stats?.totalReports || 0, 0),
              },
              {
                icon: Leaf,
                label: 'Most common category',
                value: stats?.mostCommonCategory
                  ? formatCategory(stats.mostCommonCategory)
                  : '—',
              },
            ].map((row) => {
              const RowIcon = row.icon;
              return (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.8rem',
                    padding: '0.7rem 0',
                    borderTop: '1px solid var(--rule)',
                  }}
                >
                  <RowIcon size={16} style={{ color: 'var(--eco-text-muted)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.88rem' }}>{row.label}</span>
                  <span className="eco-readout" style={{ fontWeight: 500, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                    {row.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      </motion.div>
      )}

      {/* ============ INSIGHTS TAB ============ */}
      {tab === 'insights' && (
      <motion.div
        key="tab-insights"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        style={{ display: 'grid', gap: '1.5rem' }}
      >
        {/* ---- signups per month ---- */}
        <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <TrendingUp size={17} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>Sign-ups by month</h2>
          </div>
          <p className="eco-text-muted" style={{ margin: '0 0 1.5rem', fontSize: '0.85rem' }}>
            When people actually found EcoTrack
          </p>

          {insights.months.length === 0 ? (
            <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
              No sign-ups recorded yet.
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '0.7rem',
                height: 190,
                paddingTop: '1rem',
              }}
            >
              {insights.months.map((month, index) => {
                const value = insights.signups[index];
                // Bars are drawn as a share of the busiest month, so the tallest
                // always fills the box however small the numbers are.
                const heightPct = (value / insights.peakSignups) * 100;
                return (
                  <div
                    key={month}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.4rem',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span className="eco-readout" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                      {value}
                    </span>
                    <motion.div
                      initial={prefersReducedMotion ? false : { height: 0 }}
                      animate={{ height: `${heightPct}%` }}
                      transition={{
                        duration: 0.7,
                        delay: index * 0.06,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      style={{
                        width: '100%',
                        maxWidth: 54,
                        minHeight: 3,
                        background: 'var(--eco-primary)',
                      }}
                    />
                    <span
                      className="eco-text-muted"
                      style={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                    >
                      {month}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {/* ---- most active users ---- */}
          <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <Star size={16} style={{ color: 'var(--eco-text-muted)' }} />
              <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>Most active</h2>
            </div>
            <p className="eco-text-muted" style={{ margin: '0 0 1.3rem', fontSize: '0.85rem' }}>
              By entries logged — not by emissions, which would rank the least
              green user first
            </p>

            {insights.topContributors.length === 0 ? (
              <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                Nobody has logged an entry yet.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                {insights.topContributors.map((user, index) => (
                  <motion.button
                    key={user.uid}
                    type="button"
                    onClick={() => openDetail(user.uid)}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.06, duration: 0.35 }}
                    whileHover={prefersReducedMotion ? {} : { x: 3 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.6rem 0',
                      borderTop: '1px solid var(--rule)',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--eco-text)',
                    }}
                  >
                    <span
                      className="eco-readout"
                      style={{
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        color: index === 0 ? 'var(--readout)' : 'var(--eco-text-muted)',
                        width: 18,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </span>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                        color: '#04140c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {getInitials(user.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.86rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {user.name || 'Unnamed'}
                      </div>
                      <div className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                        {formatEmission(user.totalEmission || 0)}
                      </div>
                    </div>
                    <span
                      className="eco-readout"
                      style={{ fontSize: '0.8rem', fontWeight: 500, flexShrink: 0 }}
                    >
                      {user.recordCount}
                    </span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* ---- where users are ---- */}
          <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <MapPin size={16} style={{ color: 'var(--eco-text-muted)' }} />
              <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>Where they are</h2>
            </div>
            <p className="eco-text-muted" style={{ margin: '0 0 1.3rem', fontSize: '0.85rem' }}>
              Region chosen at sign-up — it also picks their grid factor
            </p>

            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {insights.regions.map(([region, count], index) => {
                const share = users.length ? (count / users.length) * 100 : 0;
                return (
                  <div key={region}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.82rem',
                        marginBottom: '0.3rem',
                      }}
                    >
                      <span>{region}</span>
                      <span className="eco-readout" style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                        {count} · {Math.round(share)}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--rule)', overflow: 'hidden' }}>
                      <motion.div
                        initial={prefersReducedMotion ? false : { width: 0 }}
                        animate={{ width: `${share}%` }}
                        transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        style={{ height: '100%', background: 'var(--eco-primary)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
      )}

      {/* ============ ACTIVITY TAB ============ */}
      {tab === 'activity' && (
      <motion.div
        key="tab-activity"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <Activity size={17} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>
              Everything that has happened
              <span className="eco-readout" style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '0.5rem' }}>
                {activity.length}
              </span>
            </h2>
          </div>
          <p className="eco-text-muted" style={{ margin: '0 0 1.6rem', fontSize: '0.85rem' }}>
            Sign-ups, donations and feedback in one timeline, newest first
          </p>

          {activity.length === 0 ? (
            <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
              Nothing has happened yet.
            </p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '1.6rem' }}>
              {/* the spine the dots sit on */}
              <div
                style={{
                  position: 'absolute',
                  left: 11,
                  top: 6,
                  bottom: 6,
                  width: 2,
                  background:
                    'linear-gradient(180deg, rgba(var(--eco-primary-rgb),0.5), rgba(var(--eco-primary-rgb),0.05))',
                }}
              />

              <div style={{ display: 'grid', gap: '1rem' }}>
                {activity.map((event, index) => {
                  const EventIcon = event.icon;
                  return (
                    <motion.div
                      key={event.id}
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        // capped so a long history does not take forever to draw
                        delay: Math.min(index * 0.04, 0.6),
                        duration: 0.35,
                      }}
                      style={{ position: 'relative', display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: -1.6 * 16 + 4,
                          top: 2,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: 'var(--eco-bg)',
                          border: `2px solid ${event.color}`,
                          flexShrink: 0,
                        }}
                      />

                      <EventIcon size={15} style={{ color: event.color, flexShrink: 0, marginTop: 1 }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '0.6rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{event.title}</span>
                          <span className="eco-text-muted" style={{ fontSize: '0.72rem' }}>
                            {formatRelativeDate(event.at)}
                          </span>
                          {event.uid && (
                            <button
                              type="button"
                              onClick={() => openDetail(event.uid)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                color: 'var(--eco-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                              }}
                            >
                              <Eye size={11} />
                              open
                            </button>
                          )}
                        </div>
                        {event.detail && (
                          <div
                            className="eco-text-muted"
                            style={{ fontSize: '0.76rem', marginTop: '0.15rem', wordBreak: 'break-word' }}
                          >
                            {event.detail}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
      )}

      {/* ============ USERS TAB ============ */}
      {tab === 'users' && (
      <motion.div
        key="tab-users"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >

      {/* ============ USER TABLE ============ */}
      <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.3rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={17} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>
              Users
              <span className="eco-readout" style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '0.5rem' }}>
                {visibleUsers.length}
              </span>
            </h2>
          </div>

          {/* Search box */}
          <div style={{ position: 'relative', minWidth: 220 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--eco-text-muted)',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email…"
              style={{
                width: '100%',
                padding: '0.5rem 0.7rem 0.5rem 2rem',
                borderRadius: 'var(--eco-radius-sm)',
                border: '1px solid var(--eco-border)',
                background: 'rgba(var(--eco-primary-rgb), 0.04)',
                color: 'var(--eco-text)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {visibleUsers.length === 0 ? (
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            {search ? 'No users match that search.' : 'No users registered yet.'}
          </p>
        ) : (
          <div className="eco-table-wrap">
            <table className="eco-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Region</th>
                  <th>Entries</th>
                  <th>Total emissions</th>
                  <th>Joined</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((row) => {
                  // An admin cannot be deleted through the API, and you cannot
                  // delete yourself - so the button is hidden in both cases
                  const isSelf = row.uid === user?.uid;
                  const protectedRow = row.isAdmin || isSelf;

                  return (
                    <tr
                      key={row.uid}
                      onClick={() => openDetail(row.uid)}
                      style={{ cursor: 'pointer' }}
                      title={`View ${row.name}'s full activity`}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              fontFamily: 'Space Grotesk, sans-serif',
                              background: row.isAdmin
                                ? 'linear-gradient(135deg, var(--eco-purple), var(--eco-primary))'
                                : 'var(--eco-border)',
                              color: row.isAdmin ? '#04140c' : 'var(--eco-text-muted)',
                            }}
                          >
                            {getInitials(row.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                              }}
                            >
                              {row.name}
                              {row.isAdmin && (
                                <span
                                  className="eco-marker"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    color: 'var(--org-goldstandard)',
                                    fontSize: '0.62rem',
                                  }}
                                >
                                  <Shield size={9} />
                                  Admin
                                </span>
                              )}
                            </div>
                            <div
                              className="eco-text-muted"
                              style={{
                                fontSize: '0.78rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 200,
                              }}
                            >
                              {row.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="eco-text-muted">{row.region || '—'}</td>
                      <td className="eco-readout" style={{ fontWeight: 500 }}>
                        {formatNumber(row.recordCount, 0)}
                      </td>
                      <td className="eco-readout" style={{ fontWeight: 500 }}>
                        {formatEmission(row.totalEmission)}
                      </td>
                      <td className="eco-text-muted">{formatDate(row.createdAt)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                          {/* View full activity. stopPropagation is redundant with
                              the row handler here but keeps intent explicit. */}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetail(row.uid);
                            }}
                            aria-label={`View ${row.name}`}
                            title="View full activity"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--eco-text-muted)',
                              cursor: 'pointer',
                              padding: 6,
                              display: 'inline-flex',
                              borderRadius: 6,
                            }}
                          >
                            <Eye size={15} />
                          </button>

                          {protectedRow ? (
                            // Nothing to delete - explains why rather than showing
                            // a disabled button with no reason
                            <span
                              className="eco-text-muted"
                              style={{ fontSize: '0.74rem', paddingRight: 6 }}
                              title={isSelf ? 'You cannot delete yourself' : 'Admins are protected'}
                            >
                              protected
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation(); // don't open the drill-down too
                                setConfirmDelete(row);
                              }}
                              aria-label={`Delete ${row.name}`}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--eco-danger)',
                                cursor: 'pointer',
                                padding: 6,
                                display: 'inline-flex',
                                borderRadius: 6,
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </motion.div>
      )}

      {/* ============ FEEDBACK TAB ============ */}
      {tab === 'feedback' && (
      <motion.div
        key="tab-feedback"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >

      {/* ============ FEEDBACK ============ */}
      <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.3rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={17} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>
              User feedback
              <span className="eco-readout" style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '0.5rem' }}>
                {feedback.length}
              </span>
            </h2>
          </div>

          {/* Average rating summary, if anyone has rated */}
          {averageRating != null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
              }}
            >
              <Star size={15} fill="var(--readout)" style={{ color: 'var(--readout)' }} />
              <span className="eco-readout" style={{ fontWeight: 500 }}>{averageRating}</span>
              <span className="eco-marker">average</span>
            </div>
          )}
        </div>

        {feedback.length === 0 ? (
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            No feedback yet. When visitors use the feedback form, it appears here.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {feedback.map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  gap: '0.9rem',
                  padding: '0.9rem 0',
                  borderTop: index === 0 ? '1px solid var(--rule-strong)' : '1px solid var(--rule)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* who + when + rating */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      flexWrap: 'wrap',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</span>

                    {item.email && (
                      <a
                        href={`mailto:${item.email}`}
                        className="eco-text-muted"
                        style={{ fontSize: '0.78rem' }}
                      >
                        {item.email}
                      </a>
                    )}

                    {item.rating && (
                      <span style={{ display: 'inline-flex', gap: 1 }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={12}
                            fill={star <= item.rating ? 'var(--readout)' : 'none'}
                            style={{
                              color: star <= item.rating ? 'var(--readout)' : 'var(--eco-text-muted)',
                            }}
                          />
                        ))}
                      </span>
                    )}

                    {item.createdAt && (
                      <span className="eco-text-muted" style={{ fontSize: '0.74rem', marginLeft: 'auto' }}>
                        {formatDate(item.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* the message itself */}
                  <p style={{ fontSize: '0.88rem', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
                    {item.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteFeedback(item.id)}
                  disabled={deletingFeedbackId === item.id}
                  aria-label="Delete feedback"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--eco-danger)',
                    cursor: 'pointer',
                    padding: 6,
                    display: 'flex',
                    alignSelf: 'flex-start',
                    flexShrink: 0,
                  }}
                >
                  {deletingFeedbackId === item.id ? (
                    <span
                      style={{
                        width: 15,
                        height: 15,
                        border: '2px solid rgba(239,68,68,0.3)',
                        borderTopColor: 'var(--eco-danger)',
                        borderRadius: '50%',
                        animation: 'eco-spin 0.8s linear infinite',
                      }}
                    />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      </motion.div>
      )}

      {/* ============ DONATIONS TAB ============ */}
      {tab === 'donations' && (
      <motion.div
        key="tab-donations"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >

      {/* ============ DONATIONS ============ */}
      {/* Only signature-verified payments are ever written to the donations
          collection, so every row here is money that actually arrived. The
          Razorpay dashboard remains the authoritative record; this is EcoTrack's
          own copy, which is why deleting a row refunds nothing. */}
      <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.3rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HeartHandshake size={17} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>
              Donations
              <span className="eco-readout" style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '0.5rem' }}>
                {donations.length}
              </span>
            </h2>
          </div>

          {donations.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span className="eco-marker">Total raised</span>
              <span className="eco-readout" style={{ fontWeight: 500 }}>
                ₹{(totalPaise / 100).toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>

        {donations.length === 0 ? (
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            No donations yet. Verified payments from the Support page appear here.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {donations.map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  gap: '0.9rem',
                  alignItems: 'center',
                  padding: '0.9rem 0',
                  borderTop: index === 0 ? '1px solid var(--rule-strong)' : '1px solid var(--rule)',
                }}
              >
                {/* the amount, given the most weight - it is what the row is
                    about, and it is a measured quantity like every other
                    figure the app reports */}
                <div
                  className="eco-readout"
                  style={{ fontWeight: 500, fontSize: '1.05rem', minWidth: 78, flexShrink: 0 }}
                >
                  {item.amount == null
                    ? '—'
                    : `₹${(item.amount / 100).toLocaleString('en-IN')}`}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      flexWrap: 'wrap',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</span>

                    {/* Present only when the donor was signed in, so it is a
                        real account link rather than a guess from the name. */}
                    {item.userId && (
                      <button
                        type="button"
                        onClick={() => openDetail(item.userId)}
                        title="Open this donor's account"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.12rem 0.5rem',
                          borderRadius: 999,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          border: '1px solid rgba(var(--eco-primary-rgb), 0.35)',
                          background: 'rgba(var(--eco-primary-rgb), 0.12)',
                          color: 'var(--eco-primary)',
                        }}
                      >
                        <Eye size={11} />
                        Member
                      </button>
                    )}

                    {item.email && (
                      <a
                        href={`mailto:${item.email}`}
                        className="eco-text-muted"
                        style={{ fontSize: '0.78rem' }}
                      >
                        {item.email}
                      </a>
                    )}

                    {item.createdAt && (
                      <span className="eco-text-muted" style={{ fontSize: '0.74rem', marginLeft: 'auto' }}>
                        {formatDate(item.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* the Razorpay reference, for cross-checking against their dashboard */}
                  <code
                    className="eco-text-muted"
                    style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}
                  >
                    {item.razorpayPaymentId || item.razorpayOrderId}
                  </code>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteDonation(item.id, item.amount)}
                  disabled={deletingDonationId === item.id}
                  aria-label="Delete donation record"
                  title="Deletes EcoTrack's record only — this does not refund the payment"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--eco-danger)',
                    cursor: 'pointer',
                    padding: 6,
                    display: 'flex',
                    alignSelf: 'flex-start',
                    flexShrink: 0,
                  }}
                >
                  {deletingDonationId === item.id ? (
                    <span
                      style={{
                        width: 15,
                        height: 15,
                        border: '2px solid rgba(239,68,68,0.3)',
                        borderTopColor: 'var(--eco-danger)',
                        borderRadius: '50%',
                        animation: 'eco-spin 0.8s linear infinite',
                      }}
                    />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      </motion.div>
      )}

      {/* ============ SYSTEM TAB ============ */}
      {tab === 'system' && (
      <motion.div
        key="tab-system"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '0.3rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={17} style={{ color: 'var(--eco-text-muted)' }} />
              <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>Service status</h2>
            </div>

            <button
              type="button"
              onClick={loadSystem}
              disabled={systemLoading}
              className="eco-btn eco-btn-ghost"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
            >
              <RefreshCw
                size={14}
                style={systemLoading ? { animation: 'eco-spin 0.9s linear infinite' } : undefined}
              />
              Re-check
            </button>
          </div>

          <p className="eco-text-muted" style={{ margin: '0 0 1.6rem', fontSize: '0.85rem' }}>
            Checked live against the running server — never shows a key, only
            whether one is present
          </p>

          {!system && systemLoading && (
            <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
              Checking services…
            </p>
          )}

          {system && (
            <div style={{ display: 'grid', gap: '0' }}>
              {system.checks.map((check, index) => {
                const colour =
                  check.status === 'ok'
                    ? 'var(--eco-primary)'
                    : check.status === 'warn'
                      ? 'var(--readout)'
                      : 'var(--eco-danger)';
                return (
                  <motion.div
                    key={check.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.07, duration: 0.35 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.9rem',
                      padding: '0.85rem 0',
                      borderTop: index === 0 ? '1px solid var(--rule-strong)' : '1px solid var(--rule)',
                    }}
                  >
                    {/* a live dot: healthy services breathe, problems sit still
                        and coloured, so the eye goes to what is wrong */}
                    <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
                      {check.status === 'ok' && !prefersReducedMotion && (
                        <motion.span
                          animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '50%',
                            background: colour,
                          }}
                        />
                      )}
                      <span
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: '50%',
                          background: colour,
                          position: 'relative',
                        }}
                      />
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{check.label}</div>
                      <div
                        className="eco-text-muted"
                        style={{ fontSize: '0.78rem', wordBreak: 'break-word' }}
                      >
                        {check.detail}
                      </div>
                    </div>

                    {check.latencyMs != null && (
                      <span
                        className="eco-readout"
                        title="Round trip to Firestore and back"
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 500,
                          flexShrink: 0,
                          color:
                            check.latencyMs > 1500 ? 'var(--readout)' : 'var(--eco-text-muted)',
                        }}
                      >
                        {check.latencyMs} ms
                      </span>
                    )}

                    <span className="eco-marker" style={{ flexShrink: 0, color: colour }}>
                      {check.status}
                    </span>
                  </motion.div>
                );
              })}

              {system.generatedAt && (
                <p
                  className="eco-text-muted"
                  style={{ fontSize: '0.72rem', margin: '0.4rem 0 0', textAlign: 'right' }}
                >
                  Checked {formatRelativeDate(system.generatedAt)}
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
      )}

      {/* ============ USER DETAIL DRILL-DOWN ============ */}
      {/* Read-only. Shows one user's profile plus every record, goal and report
          they have - "everything they have done" - in one place. */}
      {detailUid && (
        <div
          onClick={closeDetail}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1045,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '3vh 1rem',
            overflowY: 'auto',
          }}
        >
          <motion.div
            onClick={(event) => event.stopPropagation()}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="eco-card"
            style={{ maxWidth: 760, width: '100%', position: 'relative' }}
          >
            {/* Close */}
            <button
              type="button"
              onClick={closeDetail}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: 'transparent',
                border: 'none',
                color: 'var(--eco-text-muted)',
                cursor: 'pointer',
                padding: 6,
                display: 'flex',
              }}
            >
              <X size={20} />
            </button>

            {detailLoading && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 26,
                    height: 26,
                    border: '3px solid var(--eco-border)',
                    borderTopColor: 'var(--eco-primary)',
                    borderRadius: '50%',
                    animation: 'eco-spin 0.8s linear infinite',
                  }}
                />
                <p className="eco-text-muted" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                  Loading user activity…
                </p>
              </div>
            )}

            {detailError && !detailLoading && (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <AlertTriangle size={34} style={{ color: 'var(--eco-danger)' }} />
                <p style={{ marginTop: '0.9rem', marginBottom: '1.2rem' }}>{detailError}</p>
                <button
                  type="button"
                  className="eco-btn eco-btn-ghost"
                  onClick={() => openDetail(detailUid)}
                >
                  <RefreshCw size={15} />
                  Try again
                </button>
              </div>
            )}

            {detail && !detailLoading && (
              <>
                {/* ---- header ---- */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', paddingRight: '2rem' }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontFamily: 'Space Grotesk, sans-serif',
                      background: detail.profile.isAdmin
                        ? 'linear-gradient(135deg, var(--eco-purple), var(--eco-primary))'
                        : 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                      color: '#04140c',
                    }}
                  >
                    {getInitials(detail.profile.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{detail.profile.name}</h2>
                      {detail.profile.isAdmin && (
                        <span
                          className="eco-marker"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            color: 'var(--org-goldstandard)',
                            fontSize: '0.62rem',
                          }}
                        >
                          <Shield size={9} />
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="eco-text-muted" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
                      {detail.profile.email}
                    </div>
                  </div>
                </div>

                {/* ---- meta row ---- */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1.1rem',
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--eco-border)',
                    fontSize: '0.82rem',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} className="eco-text-muted">
                    <MapPin size={14} />
                    {detail.profile.region || '—'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} className="eco-text-muted">
                    <Calendar size={14} />
                    Joined {formatDate(detail.profile.createdAt)}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} className="eco-text-muted">
                    <Activity size={14} />
                    {detail.summary.lastActivity
                      ? `Last active ${formatDate(detail.summary.lastActivity)}`
                      : 'No activity yet'}
                  </span>
                </div>

                {/* ---- account (Firebase Auth) ---- */}
                {detail.account && (
                  <div
                    style={{
                      marginTop: '1.3rem',
                      padding: '0.95rem 1.1rem',
                      borderRadius: 'var(--eco-radius-sm)',
                      background: 'rgba(var(--eco-primary-rgb), 0.04)',
                      border: '1px solid var(--eco-border)',
                    }}
                  >
                    <div
                      className="eco-text-muted"
                      style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.8rem' }}
                    >
                      Account
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem 1.2rem', fontSize: '0.84rem' }}>
                      {[
                        {
                          label: 'Email verified',
                          value: detail.account.emailVerified ? 'Yes' : 'No',
                          color: detail.account.emailVerified ? 'var(--eco-primary)' : 'var(--readout)',
                        },
                        {
                          label: 'Sign-in method',
                          value: (detail.account.providers || [])
                            .map((p) => ({ 'password': 'Email & password', 'google.com': 'Google', 'facebook.com': 'Facebook' }[p] || p))
                            .join(', ') || '—',
                        },
                        { label: 'Account created', value: formatDate(detail.account.accountCreated) },
                        { label: 'Last sign-in', value: formatDate(detail.account.lastSignIn) },
                      ].map((row) => (
                        <div key={row.label}>
                          <div className="eco-text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.15rem' }}>{row.label}</div>
                          <div style={{ fontWeight: 600, color: row.color || 'var(--eco-text)' }}>{row.value}</div>
                        </div>
                      ))}
                    </div>
                    {detail.account.disabled && (
                      <div style={{ marginTop: '0.7rem', fontSize: '0.8rem', color: 'var(--eco-danger)', fontWeight: 600 }}>
                        ⚠ This account is disabled.
                      </div>
                    )}
                  </div>
                )}

                {/* ---- summary tiles ---- */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '0.75rem',
                    marginTop: '1.3rem',
                  }}
                >
                  {[
                    { label: 'Total emissions', value: formatEmission(detail.summary.totalEmission), icon: BarChart3 },
                    { label: 'Entries logged', value: formatNumber(detail.summary.recordCount, 0), icon: Leaf },
                    {
                      label: 'Goals',
                      value: formatNumber(detail.summary.goalCount, 0),
                      hint: `${detail.summary.activeGoals} active · ${detail.summary.achievedGoals} achieved`,
                      icon: Target,
                    },
                    { label: 'Reports', value: formatNumber(detail.summary.reportCount, 0), icon: FileText },
                    {
                      label: 'Donated',
                      value: `₹${((detail.summary.donatedPaise || 0) / 100).toLocaleString('en-IN')}`,
                      hint:
                        detail.summary.donationCount
                          ? `${detail.summary.donationCount} donation${detail.summary.donationCount === 1 ? '' : 's'}`
                          : 'none yet',
                      icon: HeartHandshake,
                    },
                  ].map((tile) => {
                    const TileIcon = tile.icon;
                    return (
                      <div
                        key={tile.label}
                        style={{
                          padding: '0.85rem 0.9rem',
                          borderRadius: 'var(--eco-radius-sm)',
                          background: 'rgba(var(--eco-primary-rgb), 0.04)',
                          border: '1px solid var(--eco-border)',
                        }}
                      >
                        <div
                          className="eco-text-muted"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', marginBottom: '0.35rem' }}
                        >
                          <TileIcon size={13} />
                          {tile.label}
                        </div>
                        <div className="eco-readout" style={{ fontWeight: 500, fontSize: '1.1rem' }}>
                          {tile.value}
                        </div>
                        {tile.hint && (
                          <div className="eco-text-muted" style={{ fontSize: '0.7rem', marginTop: '0.2rem' }}>
                            {tile.hint}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ---- category breakdown ---- */}
                {Object.keys(detail.summary.categoryTotals || {}).length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.7rem' }}>Emissions by category</h3>

                    {/* The same two charts the user sees on their own dashboard,
                        so the console shows their data the way they see it.
                        The bars below stay: a doughnut is poor at exact
                        comparison, and the admin often wants the actual numbers. */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: detailCharts.trend.labels.length > 1
                          ? 'repeat(auto-fit, minmax(240px, 1fr))'
                          : '1fr',
                        gap: '1rem',
                        marginBottom: '1.2rem',
                      }}
                    >
                      {detailCharts.category.data.length > 0 && (
                        <motion.div
                          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4 }}
                          style={{
                            padding: '0.9rem',
                            borderRadius: 'var(--eco-radius-sm)',
                            border: '1px solid var(--eco-border)',
                          }}
                        >
                          <CategoryDoughnutChart
                            labels={detailCharts.category.labels}
                            data={detailCharts.category.data}
                            colors={detailCharts.category.colors}
                            height={200}
                          />
                        </motion.div>
                      )}

                      {/* One month makes no line worth drawing */}
                      {detailCharts.trend.labels.length > 1 && (
                        <motion.div
                          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4, delay: 0.08 }}
                          style={{
                            padding: '0.9rem',
                            borderRadius: 'var(--eco-radius-sm)',
                            border: '1px solid var(--eco-border)',
                          }}
                        >
                          <TrendLineChart
                            labels={detailCharts.trend.labels}
                            data={detailCharts.trend.data}
                            height={200}
                          />
                        </motion.div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gap: '0.55rem' }}>
                      {Object.entries(detail.summary.categoryTotals)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, value], _index, arr) => {
                          const max = arr[0][1] || 1;
                          return (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                              <span style={{ fontSize: '0.8rem', width: 92, flexShrink: 0 }}>
                                {formatCategory(key)}
                              </span>
                              <div style={{ flex: 1, height: 6, background: 'var(--rule)', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${(value / max) * 100}%`,
                                    height: '100%',
                                    background: CATEGORY_META[key]?.color || 'var(--eco-primary)',
                                  }}
                                />
                              </div>
                              <span
                                className="eco-readout"
                                style={{ fontSize: '0.78rem', fontWeight: 500, width: 84, textAlign: 'right', flexShrink: 0 }}
                              >
                                {formatEmission(value)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ---- activity timeline ---- */}
                <div style={{ marginTop: '1.6rem' }}>
                  <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Activity size={15} style={{ color: 'var(--eco-primary)' }} />
                    Activity timeline
                    <span className="eco-text-muted" style={{ fontWeight: 400 }}>
                      ({activityTimeline.length})
                    </span>
                  </h3>

                  {activityTimeline.length === 0 ? (
                    <p className="eco-text-muted" style={{ fontSize: '0.87rem', margin: 0 }}>
                      This user has not logged any activity yet.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.15rem', maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
                      {activityTimeline.map((event) => {
                        const EventIcon = event.icon;
                        return (
                          <div
                            key={event.id}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.2rem' }}
                          >
                            <span
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 9,
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(var(--eco-primary-rgb), 0.08)',
                                color: event.color,
                              }}
                            >
                              <EventIcon size={15} />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{event.title}</div>
                              <div className="eco-text-muted" style={{ fontSize: '0.76rem' }}>
                                {event.detail}
                              </div>
                            </div>
                            <span
                              className="eco-text-muted"
                              style={{ fontSize: '0.73rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                            >
                              {formatDate(event.when)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ---- donations this user has made ---- */}
                {detail.donations && detail.donations.length > 0 && (
                  <div style={{ marginTop: '1.6rem' }}>
                    <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <HeartHandshake size={15} style={{ color: 'var(--eco-primary)' }} />
                      Donations from this user
                      <span className="eco-text-muted" style={{ fontWeight: 400 }}>
                        ({detail.donations.length})
                      </span>
                    </h3>
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                      {detail.donations.map((donation, index) => (
                        <motion.div
                          key={donation.id}
                          initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.3 }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.8rem',
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--eco-radius-sm)',
                            border: '1px solid var(--eco-border)',
                            background: 'rgba(var(--eco-primary-rgb), 0.04)',
                          }}
                        >
                          <span className="eco-readout" style={{ fontWeight: 500, minWidth: 66 }}>
                            {donation.amount == null
                              ? '—'
                              : `₹${(donation.amount / 100).toLocaleString('en-IN')}`}
                          </span>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <code className="eco-text-muted" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                              {donation.razorpayPaymentId}
                            </code>
                          </div>

                          {/* Whether we know it was them, or only inferred it
                              from a matching email typed into the form */}
                          <span
                            title={
                              donation.linkedByAccount
                                ? 'Made while signed in to this account'
                                : 'Matched on email address, not a signed-in session'
                            }
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              padding: '0.15rem 0.45rem',
                              borderRadius: 999,
                              flexShrink: 0,
                              color: donation.linkedByAccount ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
                              background: donation.linkedByAccount
                                ? 'rgba(var(--eco-primary-rgb), 0.14)'
                                : 'var(--eco-border)',
                            }}
                          >
                            {donation.linkedByAccount ? 'signed in' : 'by email'}
                          </span>

                          {donation.createdAt && (
                            <span className="eco-text-muted" style={{ fontSize: '0.72rem', flexShrink: 0 }}>
                              {formatDate(donation.createdAt)}
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ---- feedback this user has submitted ---- */}
                {detail.feedback && detail.feedback.length > 0 && (
                  <div style={{ marginTop: '1.6rem' }}>
                    <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <MessageSquare size={15} style={{ color: 'var(--eco-primary)' }} />
                      Feedback from this user
                      <span className="eco-text-muted" style={{ fontWeight: 400 }}>({detail.feedback.length})</span>
                    </h3>
                    <div style={{ display: 'grid', gap: '0.7rem' }}>
                      {detail.feedback.map((fb) => (
                        <div
                          key={fb.id}
                          style={{
                            padding: '0.8rem 1rem',
                            borderRadius: 'var(--eco-radius-sm)',
                            border: '1px solid var(--eco-border)',
                            background: 'rgba(var(--eco-primary-rgb), 0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.4rem' }}>
                            {fb.rating ? (
                              <span style={{ display: 'inline-flex', gap: 1 }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    size={12}
                                    fill={star <= fb.rating ? 'var(--readout)' : 'none'}
                                    style={{ color: star <= fb.rating ? 'var(--readout)' : 'var(--eco-text-muted)' }}
                                  />
                                ))}
                              </span>
                            ) : (
                              <span />
                            )}
                            {fb.createdAt && (
                              <span className="eco-text-muted" style={{ fontSize: '0.73rem' }}>
                                {formatDate(fb.createdAt)}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.85rem', lineHeight: 1.55, margin: 0, wordBreak: 'break-word' }}>
                            {fb.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* ============ DELETE CONFIRMATION ============ */}
      {/* A destructive, irreversible action always gets an explicit confirm
          step. This deletes the user AND every record, goal and report they
          own - it cannot be undone. */}
      {confirmDelete && (
        <div
          onClick={() => !deleting && setConfirmDelete(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <motion.div
            // Stop a click on the dialog itself from closing it
            onClick={(event) => event.stopPropagation()}
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            className="eco-card"
            style={{ maxWidth: 440, width: '100%' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 11,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--eco-danger)',
                }}
              >
                <AlertTriangle size={21} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>Delete this user?</h3>
                <p className="eco-text-muted" style={{ fontSize: '0.88rem', margin: 0, lineHeight: 1.6 }}>
                  This permanently removes <strong style={{ color: 'var(--eco-text)' }}>{confirmDelete.name}</strong>{' '}
                  ({confirmDelete.email}) along with all{' '}
                  {formatNumber(confirmDelete.recordCount, 0)} of their records, plus their
                  goals and reports. This cannot be undone.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="eco-btn eco-btn-ghost"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                <X size={16} />
                Cancel
              </button>
              <button
                type="button"
                className="eco-btn eco-btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <span
                    style={{
                      width: 15,
                      height: 15,
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'eco-spin 0.8s linear infinite',
                    }}
                  />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete user
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
