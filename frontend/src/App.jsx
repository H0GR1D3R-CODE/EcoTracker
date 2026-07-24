// EcoTrack/frontend/src/App.jsx
// The router: decides which page to show for each URL, wraps every page in a
// fade-and-slide transition, and catches crashes so a bug in one page never
// takes the whole app down.

import React, { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import NProgress from 'nprogress';
import { AlertTriangle, RotateCw } from 'lucide-react';

import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import { useTheme } from './context/ThemeContext';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CalculatorPage from './pages/Calculator';
import Goals from './pages/Goals';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';

// ---------------------------------------------------------------------------
// ERROR BOUNDARY
//
// If any page throws while rendering, React unmounts the entire app and the
// user is left with a blank white screen. An error boundary catches that and
// shows a recovery screen instead.
//
// This has to be a class component - it is the one thing React hooks still
// cannot do, because componentDidCatch has no hook equivalent.
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // Called by React when a child throws; whatever it returns becomes the state
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // In a production app this is where you would send the crash to a logging
    // service. For this project the browser console is enough.
    console.error('[EcoTrack] Page crashed:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        className="container"
        style={{
          minHeight: '70dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '1rem',
        }}
      >
        <div className="eco-card" style={{ maxWidth: 520 }}>
          <AlertTriangle size={44} style={{ color: 'var(--eco-orange)' }} />
          <h2 style={{ marginTop: '1rem' }}>Something went wrong</h2>
          <p className="eco-text-muted">
            This page hit an unexpected error. Your data is safe — nothing was lost.
          </p>

          {/* The actual message, shown only while developing.
              import.meta.env.DEV is true with "npm run dev" and false in the
              production build, so users never see a stack trace. */}
          {import.meta.env.DEV && this.state.error && (
            <pre
              style={{
                textAlign: 'left',
                fontSize: '0.78rem',
                color: 'var(--eco-danger)',
                background: 'rgba(239,68,68,0.08)',
                padding: '0.85rem',
                borderRadius: 10,
                overflowX: 'auto',
                marginTop: '1rem',
              }}
            >
              {String(this.state.error)}
            </pre>
          )}

          <button
            type="button"
            className="eco-btn eco-btn-primary"
            style={{ marginTop: '1.2rem' }}
            onClick={() => window.location.assign('/')}
          >
            <RotateCw size={17} />
            Back to safety
          </button>
        </div>
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// PAGE TRANSITION
// Every page fades in and slides up slightly as it arrives.
// ---------------------------------------------------------------------------

function MotionPage({ children }) {
  const { prefersReducedMotion } = useTheme();

  // No movement at all for users who asked for reduced motion
  const variants = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ duration: prefersReducedMotion ? 0 : 0.32, ease: [0.4, 0, 0.2, 1] }}
      className="eco-page-content"
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// APP
// ---------------------------------------------------------------------------

export default function App() {
  const location = useLocation();

  // The thin loading bar across the top when moving between pages.
  // Route changes are instant in a single page app, so a brief flash of the bar
  // is what gives the user the feedback they expect from a page change.
  useEffect(() => {
    NProgress.start();
    const timer = setTimeout(() => NProgress.done(), 320);

    // Clearing the timer stops a stale one firing if the user clicks quickly
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Scroll back to the top on every navigation. Without this, moving from the
  // bottom of a long page keeps you at the bottom of the next one.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <>
      <Navbar />

      <ErrorBoundary>
        {/* mode="wait" lets the old page finish leaving before the new one
            arrives, so the two never overlap mid-animation.
            The key on Routes is what tells AnimatePresence a change happened. */}
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {/* ---------- Public ---------- */}
            <Route path="/" element={<MotionPage><Home /></MotionPage>} />
            <Route path="/login" element={<MotionPage><Login /></MotionPage>} />
            <Route path="/register" element={<MotionPage><Register /></MotionPage>} />

            {/* ---------- Signed in ---------- */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <MotionPage><Dashboard /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculator"
              element={
                <ProtectedRoute>
                  <MotionPage><CalculatorPage /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/goals"
              element={
                <ProtectedRoute>
                  <MotionPage><Goals /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <MotionPage><Reports /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <MotionPage><Profile /></MotionPage>
                </ProtectedRoute>
              }
            />

            {/* ---------- Admin only ---------- */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <MotionPage><AdminDashboard /></MotionPage>
                </ProtectedRoute>
              }
            />

            {/* ---------- Anything else ---------- */}
            {/* replace means the bad URL does not stay in the back button history */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </ErrorBoundary>
    </>
  );
}
