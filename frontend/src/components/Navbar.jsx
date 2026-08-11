// EcoTrack/frontend/src/components/Navbar.jsx
// The sticky top navigation, plus the bottom navigation bar that replaces it
// on phones.
//
// Behaviour:
//   * transparent at the top of the page, frosted glass once scrolled past 80px
//   * desktop shows the links inline; mobile collapses them into a hamburger
//   * signed-in users get app links, visitors get Login and Register buttons
//   * the Admin link only appears for admins

import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Calculator,
  FileText,
  Heart,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Shield,
  Target,
  User,
  X,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';
import { getInitials } from '../utils/formatters';

// How far the user scrolls before the navbar turns opaque
const SCROLL_THRESHOLD = 80;

// The main app links, for signed-in NORMAL users. Used by both the top navbar
// and the mobile bottom bar.
const APP_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calculator', label: 'Calculator', icon: Calculator },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/reports', label: 'Reports', icon: FileText },
];

// The admin account is a separate, admin-only identity - it does not track a
// personal footprint, so it gets its own single link instead of APP_LINKS.
const ADMIN_LINKS = [{ to: '/admin', label: 'Admin', icon: Shield }];

// The public content pages, shown next to the logo for signed-out visitors
// (the marketing site). Signed-in users get the app links instead, so the bar
// never shows both sets at once.
const PUBLIC_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/learn', label: 'Learn' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/estimate', label: 'Estimate' },
  { to: '/feedback', label: 'Feedback' },
  // Donate is deliberately NOT here: it gets its own button next to Log in,
  // where it reads as an action rather than another page to browse.
];

export default function Navbar() {
  const { user, profile, isAdmin, logout } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Watch the scroll position so the navbar can change appearance
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);

    handleScroll(); // run once in case the page loads already scrolled down
    // passive: true tells the browser we will not block scrolling, which keeps
    // scrolling smooth even while this handler runs
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close the mobile menu whenever the route changes, otherwise it would stay
  // open on top of the page the user just navigated to
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Stop the page behind the mobile menu from scrolling while it is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out.');
      // replace:true so the protected page they left is not sitting in history
      // for the back button, and so this is the single settled destination
      // rather than racing the ProtectedRoute redirect that fires on sign-out.
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Which primary links show in the bar:
  //   admin account  -> just the Admin console (no personal tracking)
  //   normal user    -> the app links
  //   signed out      -> none (they get the public links + auth buttons)
  const primaryLinks = isAdmin ? ADMIN_LINKS : user ? APP_LINKS : [];

  // Where the logo points: admins home is the console, users' is the dashboard
  const homeTo = isAdmin ? '/admin' : user ? '/dashboard' : '/';

  return (
    <>
      <nav className={`eco-navbar ${scrolled ? 'eco-navbar-scrolled' : ''}`}>
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 68,
            gap: '1rem',
          }}
        >
          {/* ---------- Logo ---------- */}
          <Link
            to={homeTo}
            style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}
          >
            <motion.span
              whileHover={prefersReducedMotion ? {} : { rotate: -12, scale: 1.12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12 }}
              style={{ display: 'flex', color: 'var(--eco-primary)' }}
            >
              <Leaf size={26} />
            </motion.span>
            <span
              className="eco-gradient-text"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1.32rem',
                letterSpacing: '-0.03em',
              }}
            >
              EcoTrack
            </span>
          </Link>

          {/* ---------- Public content links, next to the logo (signed-out only) ---------- */}
          {!user && (
            <div
              className="d-none d-lg-flex"
              style={{ alignItems: 'center', gap: '0.15rem', marginLeft: '1rem' }}
            >
              {PUBLIC_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  // `end` so the Home link ("/") is only active on the exact
                  // landing page, not on every route that starts with "/"
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                  }
                  style={{ fontSize: '0.9rem' }}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          )}

          {/* ---------- Desktop links (hidden under 992px by Bootstrap's d-none) ---------- */}
          <div className="d-none d-lg-flex" style={{ alignItems: 'center', gap: '0.2rem' }}>
            {primaryLinks.map(
              (link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.to;

                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={`eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`}
                    style={{ position: 'relative' }}
                  >
                    {/* The pill. Sharing one layoutId across every link makes
                        Framer Motion slide it from the old link to the new one
                        when the route changes, instead of it blinking. */}
                    {isActive && !prefersReducedMotion && (
                      <motion.span
                        layoutId="navbar-active-pill"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 'var(--eco-radius-sm)',
                          background: 'rgba(var(--eco-primary-rgb), 0.1)',
                          border: '1px solid rgba(var(--eco-primary-rgb), 0.2)',
                          zIndex: 0,
                        }}
                      />
                    )}
                    <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Icon size={17} />
                      {link.label}
                    </span>
                  </NavLink>
                );
              }
            )}
          </div>

          {/* ---------- Right side ---------- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ThemeToggle />

            {user ? (
              <>
                {/* Signed-in visitors lose the footer and the public links, so
                    without this there is no route to the donate page at all.
                    Icon-only keeps the signed-in bar uncluttered. The admin
                    account is skipped - it is the project, not a supporter. */}
                {!isAdmin && (
                  <Link
                    to="/donate"
                    className="d-none d-lg-flex"
                    title="Support EcoTrack"
                    aria-label="Support EcoTrack"
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: '1px solid var(--eco-border)',
                      color: 'var(--eco-primary)',
                    }}
                  >
                    <Heart size={16} />
                  </Link>
                )}

                {/* Avatar + name, links to the profile page */}
                <Link
                  to="/profile"
                  className="d-none d-lg-flex"
                  style={{ alignItems: 'center', gap: '0.55rem' }}
                  title="Your profile"
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                      color: '#04140c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {getInitials(profile?.name)}
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="eco-btn eco-btn-ghost d-none d-lg-inline-flex"
                  style={{ padding: '0.45rem 0.9rem', fontSize: '0.86rem' }}
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </>
            ) : (
              <div className="d-none d-lg-flex" style={{ gap: '0.55rem' }}>
                {/* Donate sits beside the auth buttons so it reads as an action.
                    Outline rather than solid keeps "Get started" the one clear
                    primary call on the bar.

                    Only from xl (1200px) up: at the lg breakpoint the six public
                    links plus both auth buttons already fill the container, and
                    adding a third button there pushes the bar into a horizontal
                    scroll. Below xl the footer button and the home-page strip
                    carry the same link. */}
                <Link
                  to="/donate"
                  className="eco-btn eco-btn-outline d-none d-xl-inline-flex"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                >
                  <Heart size={15} />
                  Donate
                </Link>
                <Link
                  to="/login"
                  className="eco-btn eco-btn-ghost"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="eco-btn eco-btn-primary"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1.1rem', whiteSpace: 'nowrap' }}
                >
                  Get started
                </Link>
              </div>
            )}

            {/* ---------- Hamburger (visible below 992px) ---------- */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="d-lg-none"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{
                background: 'transparent',
                border: '1px solid var(--eco-border)',
                borderRadius: 10,
                color: 'var(--eco-text)',
                width: 38,
                height: 38,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* ---------- Mobile slide-down menu ---------- */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="d-lg-none"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
            style={{
              position: 'fixed',
              top: 68,
              left: 0,
              right: 0,
              zIndex: 1029,
              background: 'var(--eco-glass-bg)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: '1px solid var(--eco-glass-border)',
              padding: '1rem',
              maxHeight: 'calc(100dvh - 68px)',
              overflowY: 'auto',
            }}
          >
            {user ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.3rem 1rem',
                    borderBottom: '1px solid var(--eco-border)',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                      color: '#04140c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {getInitials(profile?.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{profile?.name || 'EcoTrack user'}</div>
                    <div
                      className="eco-text-muted"
                      style={{
                        fontSize: '0.8rem',
                        // These three lines cut off a long email with "..."
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {profile?.email}
                    </div>
                  </div>
                </div>

                {primaryLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                      }
                      style={{ display: 'flex', width: '100%', padding: '0.75rem 0.6rem' }}
                    >
                      <Icon size={18} />
                      {link.label}
                    </NavLink>
                  );
                })}

                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                  }
                  style={{ display: 'flex', width: '100%', padding: '0.75rem 0.6rem' }}
                >
                  <User size={18} />
                  Profile
                </NavLink>

                {!isAdmin && (
                  <NavLink
                    to="/donate"
                    className={({ isActive }) =>
                      `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                    }
                    style={{ display: 'flex', width: '100%', padding: '0.75rem 0.6rem' }}
                  >
                    <Heart size={18} />
                    Support EcoTrack
                  </NavLink>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="eco-btn eco-btn-ghost"
                  style={{ width: '100%', marginTop: '0.85rem' }}
                >
                  <LogOut size={17} />
                  Logout
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Public content pages, so the mobile menu matches the desktop bar.
                    Home is the first entry in PUBLIC_LINKS, so it appears here too. */}
                {PUBLIC_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    className={({ isActive }) =>
                      `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                    }
                    style={{ padding: '0.75rem 0.6rem' }}
                  >
                    {link.label}
                  </NavLink>
                ))}

                <Link to="/donate" className="eco-btn eco-btn-outline" style={{ width: '100%', marginTop: '0.3rem' }}>
                  <Heart size={16} />
                  Donate
                </Link>
                <Link to="/login" className="eco-btn eco-btn-ghost" style={{ width: '100%' }}>
                  Log in
                </Link>
                <Link to="/register" className="eco-btn eco-btn-primary" style={{ width: '100%' }}>
                  Get started
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Mobile bottom navigation ----------
          Only rendered for signed-in users. index.css hides it above 768px. */}
      {user && (
        <div className="eco-bottom-nav">
          {primaryLinks.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`eco-bottom-nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={19} />
                <span>{link.label}</span>
              </Link>
            );
          })}

          <Link
            to="/profile"
            className={`eco-bottom-nav-item ${location.pathname === '/profile' ? 'active' : ''}`}
          >
            <User size={19} />
            <span>Profile</span>
          </Link>
        </div>
      )}
    </>
  );
}
