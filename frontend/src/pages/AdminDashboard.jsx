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
  AlertTriangle,
  BarChart3,
  Database,
  FileText,
  Leaf,
  RefreshCw,
  Search,
  Shield,
  Target,
  Trash2,
  TrendingUp,
  UserPlus,
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

  // ---------------------------------------------------------------------
  const load = async () => {
    setLoading(true);
    try {
      // Both requests at once rather than one after the other
      const [statsData, usersData] = await Promise.all([
        adminApi.getStats(),
        adminApi.getUsers(),
      ]);
      setStats(statsData);
      setUsers(usersData.users || []);
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load the admin dashboard.'));
    } finally {
      setLoading(false);
    }
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
      {/* ============ HEADER ============ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.3rem' }}>
            <Shield size={24} style={{ color: 'var(--eco-purple)' }} />
            <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', margin: 0 }}>
              Admin <span className="eco-gradient-text">Dashboard</span>
            </h1>
          </div>
          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.92rem' }}>
            Signed in as {profile?.email}
          </p>
        </div>

        <button type="button" className="eco-btn eco-btn-ghost" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

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
                    <tr key={row.uid}>
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
                      <td style={{ textAlign: 'right' }}>
                        {protectedRow ? (
                          // Nothing to click - explains why rather than showing
                          // a disabled button with no reason
                          <span
                            className="eco-text-muted"
                            style={{ fontSize: '0.74rem' }}
                            title={isSelf ? 'You cannot delete yourself' : 'Admins are protected'}
                          >
                            protected
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(row)}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
