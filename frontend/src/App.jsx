// EcoTrack/frontend/src/App.jsx
// The router: decides which page to show for each URL, wraps every page in a
// fade-and-slide transition, and catches crashes so a bug in one page never
// takes the whole app down.

import React, { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import NProgress from 'nprogress';
import { AlertTriangle, RotateCw } from 'lucide-react';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import CookieConsent from './components/CookieConsent';
import { useTheme } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';

// Lazy (see the render below) rather than the plain eager imports these used
// to be. Both now pull in react-markdown to render their replies properly,
// which made each one's own weight too big to belong in the bundle every
// visitor downloads just to load the homepage - the same reasoning the
// page-level lazy() calls below already follow, just applied to a component
// instead of a route. Assistant is additionally gated on `user` being
// truthy (see the render below) since it is only ever shown signed in;
// PublicHelper has no such gate to add - it is the one shown to a
// signed-out visitor, which is most of this app's traffic, so there is no
// smaller audience to defer it to.
const Assistant = lazy(() => import('./components/Assistant'));
const PublicHelper = lazy(() => import('./components/PublicHelper'));

import LoadingSpinner from './components/LoadingSpinner';

// ---------------------------------------------------------------------------
// CODE SPLITTING
//
// Every page used to be imported eagerly, which put the whole app - admin
// console, chart pages, the lot - into one 571 kB file that a first-time
// visitor downloaded before seeing the landing page.
//
// lazy() gives each page its own chunk, fetched when its route is first
// opened. Home stays eager: it is the landing page and by far the most common
// entry point, so deferring it would only add a round trip before first paint.
//
// This also stops the charting library loading for people who never open a
// page that draws one.
// ---------------------------------------------------------------------------

import Home from './pages/Home';

const Login = lazy(() => import('./pages/Login'));
const VerifyTwoFactor = lazy(() => import('./pages/VerifyTwoFactor'));
const Register = lazy(() => import('./pages/Register'));
const About = lazy(() => import('./pages/About'));
const Learn = lazy(() => import('./pages/Learn'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Estimate = lazy(() => import('./pages/Estimate'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Donate = lazy(() => import('./pages/Donate'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalculatorPage = lazy(() => import('./pages/Calculator'));
const Insights = lazy(() => import('./pages/Insights'));
const Goals = lazy(() => import('./pages/Goals'));
const Reports = lazy(() => import('./pages/Reports'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const NotFound = lazy(() => import('./pages/NotFound'));

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
  const { user } = useAuth();

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
        {/* Each page fades in on arrival (see MotionPage). We deliberately do
            NOT wrap this in <AnimatePresence mode="wait">. That would hold the
            new page back until the old page finished animating out, which both
            adds a visible delay to every navigation AND can dead-lock: logging
            out fires two navigations at once (the ProtectedRoute redirect the
            moment the user becomes null, plus the explicit navigate('/')),
            interrupting an exit animation so the "exit complete" callback never
            fires and the view freezes until a full reload. Remounting on the
            location key gives a clean enter animation with none of that risk. */}
        {/* Shown only while a page's chunk is in flight - usually a few
            hundred milliseconds on a first visit to that route, and nothing at
            all afterwards, because the browser caches it. Sized to the same
            min-height the pages use so the footer does not jump up and back. */}
        <Suspense
          fallback={
            <div
              style={{
                minHeight: '70dvh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LoadingSpinner size="lg" />
            </div>
          }
        >
        <Routes location={location} key={location.pathname}>
            {/* ---------- Public ---------- */}
            <Route path="/" element={<MotionPage><Home /></MotionPage>} />
            <Route path="/login" element={<MotionPage><Login /></MotionPage>} />
            <Route path="/verify-2fa" element={<MotionPage><VerifyTwoFactor /></MotionPage>} />
            <Route path="/register" element={<MotionPage><Register /></MotionPage>} />
            <Route path="/about" element={<MotionPage><About /></MotionPage>} />
            <Route path="/learn" element={<MotionPage><Learn /></MotionPage>} />
            <Route path="/gallery" element={<MotionPage><Gallery /></MotionPage>} />
            <Route path="/estimate" element={<MotionPage><Estimate /></MotionPage>} />
            <Route path="/feedback" element={<MotionPage><Feedback /></MotionPage>} />
            {/* Donations are deliberately open to everyone - a visitor should
                never have to make an account before they can support the project. */}
            <Route path="/donate" element={<MotionPage><Donate /></MotionPage>} />

            {/* ---------- Signed in ---------- */}
            {/* userOnly: the admin account is admin-only, so these personal
                tracking pages redirect an admin to their console instead. */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute userOnly>
                  <MotionPage><Dashboard /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculator"
              element={
                <ProtectedRoute userOnly>
                  <MotionPage><CalculatorPage /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights"
              element={
                <ProtectedRoute userOnly>
                  <MotionPage><Insights /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/goals"
              element={
                <ProtectedRoute userOnly>
                  <MotionPage><Goals /></MotionPage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute userOnly>
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
            {/* A real 404 rather than a silent redirect - the old behaviour
                sent a mistyped or stale URL straight to the homepage with no
                sign anything was wrong, which just hides the mistake instead
                of explaining it. */}
            <Route path="*" element={<MotionPage><NotFound /></MotionPage>} />
        </Routes>
        </Suspense>
      </ErrorBoundary>

      {/* The marketing footer. It renders itself to null for signed-in users,
          so it only appears on the public site, never inside the app. */}
      <Footer />

      {/* Two floating helpers, but only ever one on screen at a time:
          - Assistant: the AI helper, for signed-in users - only mounted (and
            its chunk only fetched) once `user` is actually truthy, so a
            signed-out visitor never downloads it at all
          - PublicHelper: the rule-based guide, for signed-out visitors
          Each renders null unless it is the right one for the current visitor. */}
      {user && (
        <Suspense fallback={null}>
          <Assistant />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <PublicHelper />
      </Suspense>
      <CookieConsent />
    </>
  );
}
