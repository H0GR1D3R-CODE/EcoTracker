// EcoTrack/frontend/src/pages/AdminDashboard.jsx
//
// PLACEHOLDER - this file will be replaced when the Admin module is built.
//
// When built, this page will contain:
//   * platform statistics (total users, records, emissions, goal success rate)
//   * a searchable user management table with per-user activity totals
//   * user deletion with a confirmation step
// Data sources: GET /api/admin/stats, GET /api/admin/users, DELETE /api/admin/users/:id
//
// Reaching this page requires TWO things: a valid Firebase token, and a document
// at admins/{uid} in Firestore. ProtectedRoute checks the second one in the
// browser for convenience; the backend checks it again on every single request,
// which is what actually keeps non-admins out.

import { Shield, Users } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const { profile } = useAuth();

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
        <Shield size={26} style={{ color: 'var(--eco-purple)' }} />
        <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', margin: 0 }}>
          Admin <span className="eco-gradient-text">Dashboard</span>
        </h1>
      </div>
      <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
        Signed in as {profile?.email}
      </p>

      <div className="eco-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <Users size={44} style={{ color: 'var(--eco-purple)', opacity: 0.6 }} />

        <h2 style={{ fontSize: '1.3rem', marginTop: '1.2rem', marginBottom: '0.6rem' }}>
          Admin tools coming next
        </h2>

        <p className="eco-text-muted" style={{ maxWidth: 500, margin: '0 auto' }}>
          Platform statistics and the user management table are the last module
          to be built. Their backend routes are already live and already reject
          any request from a non-admin account.
        </p>
      </div>
    </div>
  );
}
