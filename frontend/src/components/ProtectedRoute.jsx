// EcoTrack/frontend/src/components/ProtectedRoute.jsx
// Wraps any page that should not be visible to a signed-out visitor.
//
//   <ProtectedRoute><Dashboard /></ProtectedRoute>
//   <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
//   <ProtectedRoute userOnly><Dashboard /></ProtectedRoute>   (admins redirected)
//
// adminOnly  - only admins may enter; normal users are sent to /dashboard.
// userOnly   - only normal users may enter; the admin account is admin-only, so
//              admins are sent to their console (/admin). This is what keeps the
//              two experiences separate rather than mixed into one account.
//
// SECURITY NOTE (important for the viva)
// This component is CONVENIENCE, not security. Anyone can edit JavaScript in
// their browser and force this to render. What actually protects the data is
// the backend: every API route verifies the Firebase ID token, and admin routes
// re-check the admins collection on the server. Hiding a page here just stops
// honest users seeing an empty screen full of failed requests.

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CloudOff, RotateCw } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({ children, adminOnly = false, userOnly = false }) {
  const { user, profile, loading, isAdmin, profileError, refreshProfile, logout } = useAuth();
  const location = useLocation();
  const [retrying, setRetrying] = useState(false);

  // Show the toast in an effect, not during render. Updating another component
  // (the toast container) while this one renders is a React error.
  //
  // The "profile &&" is important: isAdmin is false while the profile is still
  // loading, so without it every admin visit would flash a wrong "you need
  // admin access" toast a moment before the real answer arrives.
  useEffect(() => {
    if (!loading && user && profile && adminOnly && !isAdmin) {
      toast.error('You need admin access to view that page.');
    }
  }, [loading, user, profile, adminOnly, isAdmin]);

  // STEP 1: still checking with Firebase.
  // This branch matters more than it looks. Without it, a page refresh would
  // briefly see "no user" and bounce the person to the login screen before
  // Firebase had finished restoring their session.
  if (loading) {
    return <LoadingSpinner message="Checking your session…" />;
  }

  // STEP 2: definitely not signed in - send them to log in.
  // state={{ from: location }} remembers where they were headed, so Login can
  // return them there instead of dumping everyone on the dashboard.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // STEP 3: signed in, but the profile could not be fetched.
  // This is almost always the Flask backend being unreachable - either it is
  // not running locally, or Render has put the free service to sleep. Showing
  // a retry button here is what stops the app hanging on a spinner forever.
  if (!profile && profileError) {
    const handleRetry = async () => {
      setRetrying(true);
      await refreshProfile();
      setRetrying(false);
    };

    // Total unreachability, not a page-level hiccup - the same "no signal"
    // channel treatment as Dashboard and Calculator's own failed reads, just
    // full-screen since nothing behind it can render without a profile.
    return (
      <div
        className="container"
        style={{
          minHeight: '70dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center', paddingTop: '1.1rem', borderTop: '2px solid var(--eco-danger)' }}>
          <CloudOff size={26} style={{ color: 'var(--eco-danger)', margin: '0 auto 0.9rem', display: 'block' }} />

          <span className="eco-marker" style={{ display: 'block', marginBottom: '0.6rem' }}>
            No signal
          </span>
          <h2 className="eco-display" style={{ fontSize: 'clamp(1.5rem, 3.4vw, 2rem)', margin: '0 0 0.7rem' }}>
            Cannot reach the server
          </h2>

          <p className="eco-text-muted" style={{ margin: '0 0 0.4rem' }}>
            You are signed in, but your profile could not be loaded.
          </p>
          <p className="eco-text-muted" style={{ fontSize: '0.87rem', margin: '0 0 1.8rem' }}>
            {profileError}
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="eco-btn eco-btn-primary"
              onClick={handleRetry}
              disabled={retrying}
            >
              <RotateCw size={16} />
              {retrying ? 'Retrying…' : 'Try again'}
            </button>

            {/* Wrapped rather than passed directly: logout() returns a promise
                that can reject, and an unhandled rejection would surface as a
                console error the user cannot act on */}
            <button
              type="button"
              className="eco-btn eco-btn-ghost"
              onClick={() => {
                logout().catch((error) => toast.error(error.message));
              }}
            >
              Sign out
            </button>
          </div>

          {/* Only shown while developing - the most likely cause by far */}
          {import.meta.env.DEV && (
            <p
              className="eco-text-muted"
              style={{ fontSize: '0.8rem', marginTop: '1.6rem', marginBottom: 0 }}
            >
              Is the Flask backend running? Start it with{' '}
              <code style={{ color: 'var(--eco-primary)' }}>python app.py</code> in the
              backend folder.
            </p>
          )}
        </div>
      </div>
    );
  }

  // STEP 4: signed in and no error, but the profile is still on its way.
  // Pages expect profile.name to exist, so wait rather than render a broken UI.
  if (!profile) {
    return <LoadingSpinner message="Loading your profile…" />;
  }

  // STEP 5: admin pages need the admins document as well
  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // STEP 6: personal-tracking pages are for normal users only. The admin
  // account is a separate, admin-only identity, so send an admin who lands on
  // one of these pages back to their console instead.
  if (userOnly && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // All checks passed
  return children;
}
