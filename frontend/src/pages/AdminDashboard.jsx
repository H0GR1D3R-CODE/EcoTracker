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
import { CategoryDoughnutChart } from '../components/EmissionChart';
import { SkeletonStatCard, SkeletonTable } from '../components/SkeletonCard';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';
import { formatCategory, formatDate, formatEmission, formatNumber, getInitials } from '../utils/formatters';
import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';

export default function AdminDashboard() {
  const { profile, user } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  // The user currently queued for deletion, held while the confirm dialog is open
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Feedback submitted through the public form
  const [feedback, setFeedback] = useState([]);
  const [averageRating, setAverageRating] = useState(null);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState(null);

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
      // All three requests at once rather than one after another
      const [statsData, usersData, feedbackData] = await Promise.all([
        adminApi.getStats(),
        adminApi.getUsers(),
        adminApi.getFeedback(),
      ]);
      setStats(statsData);
      setUsers(usersData.users || []);
      setFeedback(feedbackData.feedback || []);
      setAverageRating(feedbackData.averageRating ?? null);
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
        color: '#0ea5e9',
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
        <div className="eco-card" style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <AlertTriangle size={40} style={{ color: 'var(--eco-orange)' }} />
          <h2 style={{ fontSize: '1.25rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
            Could not load the admin dashboard
          </h2>
          <p className="eco-text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
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
      {/* ============ HEADER (image banner) ============ */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '20px',
          border: '1px solid var(--eco-border)',
          marginBottom: '1.5rem',
          minHeight: 220,
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        {/* the photograph, filling the whole banner */}
        <Photo
          id={PHOTOS.adminBanner}
          alt="Aerial view of a city lit up at night"
          width={1600}
          color="#7c3aed"
          loading="eager"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        {/* slow drift so the banner feels alive, not a flat picture */}
        {!prefersReducedMotion && (
          <motion.div
            aria-hidden
            initial={{ x: 0, y: 0 }}
            animate={{ x: [0, 14, 0], y: [0, -10, 0] }}
            transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: '-8%',
              background:
                'radial-gradient(60% 60% at 78% 20%, rgba(124,58,237,0.35), transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* dark scrim so white text stays legible over the bright lights */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(103deg, rgba(6,10,14,0.95) 0%, rgba(6,10,14,0.82) 42%, rgba(6,10,14,0.52) 100%)',
          }}
        />

        {/* everything readable sits on top of the scrim */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            padding: 'clamp(1.4rem, 3.2vw, 2.1rem)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.28rem 0.7rem',
                  borderRadius: 999,
                  background: 'rgba(124,58,237,0.18)',
                  border: '1px solid rgba(124,58,237,0.35)',
                  marginBottom: '0.7rem',
                }}
              >
                <Shield size={15} style={{ color: '#c4b5fd' }} />
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: '#ddd6fe',
                  }}
                >
                  Admin console
                </span>
              </div>
              <h1
                style={{
                  fontSize: 'clamp(1.9rem, 4.5vw, 2.7rem)',
                  margin: '0 0 0.35rem',
                  color: '#fff',
                  lineHeight: 1.05,
                }}
              >
                Command{' '}
                <span
                  style={{
                    background: 'linear-gradient(120deg, #a78bfa, #38bdf8)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  centre
                </span>
              </h1>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.72)' }}>
                Signed in as {profile?.email}
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1rem',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.24)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {/* headline numbers, right on the banner, so the top of the page is never empty */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'clamp(1.3rem, 5vw, 2.8rem)',
              marginTop: '1.4rem',
              paddingTop: '1.15rem',
              borderTop: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            {[
              { label: 'Users', value: formatNumber(stats?.totalUsers || 0, 0) },
              { label: 'Records', value: formatNumber(stats?.totalRecords || 0, 0) },
              { label: 'Total CO₂', value: formatEmission(stats?.totalEmission || 0) },
              { label: 'Feedback', value: formatNumber(feedback.length, 0) },
            ].map((item) => (
              <div key={item.label}>
                <div
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: 'clamp(1.2rem, 3vw, 1.5rem)',
                    color: '#fff',
                    lineHeight: 1.1,
                  }}
                >
                  {item.value}
                </div>
                <div
                  style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(255,255,255,0.6)',
                    marginTop: '0.15rem',
                  }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

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
          accent="#00ff87"
          hint={`${formatNumber(stats?.newUsersThisMonth || 0, 0)} new this month`}
          delay={0}
        />
        <StatCard
          icon={Database}
          label="Total records"
          value={stats?.totalRecords || 0}
          decimals={0}
          accent="#7c3aed"
          hint={`${formatNumber(stats?.averageRecordsPerUser || 0, 1)} average per user`}
          delay={0.06}
        />
        <StatCard
          icon={BarChart3}
          label="Total emissions"
          value={stats?.totalEmission || 0}
          unit="kg CO₂"
          accent="#0ea5e9"
          hint={`${formatEmission(stats?.emissionThisMonth || 0)} this month`}
          delay={0.12}
        />
        <StatCard
          icon={Target}
          label="Goal success rate"
          value={stats?.goalSuccessRate || 0}
          unit="%"
          decimals={1}
          accent="#f59e0b"
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
        <div className="eco-card">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}
          >
            <Leaf size={18} style={{ color: 'var(--eco-primary)' }} />
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Emissions across all users</h2>
          </div>
          <p className="eco-text-muted" style={{ margin: '0 0 1.2rem', fontSize: '0.82rem' }}>
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
                    <span className="eco-text-muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
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
        <div className="eco-card">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.3rem' }}
          >
            <TrendingUp size={18} style={{ color: 'var(--eco-orange)' }} />
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>At a glance</h2>
          </div>

          <div style={{ display: 'grid', gap: '0.9rem' }}>
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
                    padding: '0.75rem 0.9rem',
                    borderRadius: 'var(--eco-radius-sm)',
                    background: 'rgba(var(--eco-primary-rgb), 0.04)',
                    border: '1px solid var(--eco-border)',
                  }}
                >
                  <RowIcon size={17} style={{ color: 'var(--eco-text-muted)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.88rem' }}>{row.label}</span>
                  <span
                    style={{
                      fontFamily: 'Space Grotesk, sans-serif',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============ USER TABLE ============ */}
      <div className="eco-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>
              Users
              <span className="eco-text-muted" style={{ fontWeight: 400, marginLeft: '0.4rem' }}>
                ({visibleUsers.length})
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
                                  className="eco-badge"
                                  style={{
                                    color: 'var(--eco-purple)',
                                    padding: '0.1rem 0.45rem',
                                    fontSize: '0.66rem',
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
                      <td>{formatNumber(row.recordCount, 0)}</td>
                      <td style={{ fontWeight: 600 }}>{formatEmission(row.totalEmission)}</td>
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

      {/* ============ FEEDBACK ============ */}
      <div className="eco-card" style={{ marginTop: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={18} style={{ color: 'var(--eco-text-muted)' }} />
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>
              User feedback
              <span className="eco-text-muted" style={{ fontWeight: 400, marginLeft: '0.4rem' }}>
                ({feedback.length})
              </span>
            </h2>
          </div>

          {/* Average rating summary, if anyone has rated */}
          {averageRating != null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem',
              }}
            >
              <Star size={15} fill="var(--eco-orange)" style={{ color: 'var(--eco-orange)' }} />
              <strong className="eco-tabular">{averageRating}</strong>
              <span className="eco-text-muted">average</span>
            </div>
          )}
        </div>

        {feedback.length === 0 ? (
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            No feedback yet. When visitors use the feedback form, it appears here.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {feedback.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  gap: '0.9rem',
                  padding: '1rem 1.1rem',
                  borderRadius: 'var(--eco-radius-sm)',
                  border: '1px solid var(--eco-border)',
                  background: 'rgba(var(--eco-primary-rgb), 0.03)',
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
                            fill={star <= item.rating ? 'var(--eco-orange)' : 'none'}
                            style={{
                              color:
                                star <= item.rating ? 'var(--eco-orange)' : 'var(--eco-text-muted)',
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
                <AlertTriangle size={34} style={{ color: 'var(--eco-orange)' }} />
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
                          className="eco-badge"
                          style={{ color: 'var(--eco-purple)', padding: '0.1rem 0.45rem', fontSize: '0.66rem' }}
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
                          color: detail.account.emailVerified ? 'var(--eco-primary)' : 'var(--eco-orange)',
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
                        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.1rem' }}>
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
                              <div
                                style={{
                                  flex: 1,
                                  height: 8,
                                  borderRadius: 999,
                                  background: 'var(--eco-border)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${(value / max) * 100}%`,
                                    height: '100%',
                                    borderRadius: 999,
                                    background: CATEGORY_META[key]?.color || 'var(--eco-primary)',
                                  }}
                                />
                              </div>
                              <span
                                className="eco-text-muted eco-tabular"
                                style={{ fontSize: '0.76rem', width: 84, textAlign: 'right', flexShrink: 0 }}
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
                                    fill={star <= fb.rating ? 'var(--eco-orange)' : 'none'}
                                    style={{ color: star <= fb.rating ? 'var(--eco-orange)' : 'var(--eco-text-muted)' }}
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
