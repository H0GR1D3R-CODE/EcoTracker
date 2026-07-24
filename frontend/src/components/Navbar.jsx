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
  BarChart3,
  Calculator,
  FileText,
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

// The main app links, used by both the top navbar and the mobile bottom bar
const APP_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calculator', label: 'Calculator', icon: Calculator },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/reports', label: 'Reports', icon: FileText },
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
      toast.success('Signed out successfully.');
      navigate('/');
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Signed-in users get the app links; visitors only see the landing page
  const visibleLinks = user ? APP_LINKS : [];

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
            to={user ? '/dashboard' : '/'}
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
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 700,
                fontSize: '1.32rem',
                letterSpacing: '-0.03em',
              }}
            >
              EcoTrack
            </span>
          </Link>

          {/* ---------- Desktop links (hidden under 992px by Bootstrap's d-none) ---------- */}
          <div className="d-none d-lg-flex" style={{ alignItems: 'center', gap: '0.2rem' }}>
            {visibleLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  // NavLink passes isActive so the current page can be highlighted
                  className={({ isActive }) =>
                    `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                  }
                >
                  <Icon size={17} />
                  {link.label}
                </NavLink>
              );
            })}

            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                }
              >
                <Shield size={17} />
                Admin
              </NavLink>
            )}
          </div>

          {/* ---------- Right side ---------- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ThemeToggle />

            {user ? (
              <>
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
                      fontFamily: 'Space Grotesk, sans-serif',
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
                <Link to="/login" className="eco-btn eco-btn-ghost" style={{ fontSize: '0.88rem' }}>
                  Log in
                </Link>
                <Link to="/register" className="eco-btn eco-btn-primary" style={{ fontSize: '0.88rem' }}>
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
                      fontFamily: 'Space Grotesk, sans-serif',
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

                {APP_LINKS.map((link) => {
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

                {isAdmin && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `eco-nav-link ${isActive ? 'eco-nav-link-active' : ''}`
                    }
                    style={{ display: 'flex', width: '100%', padding: '0.75rem 0.6rem' }}
                  >
                    <Shield size={18} />
                    Admin
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
                <Link to="/" className="eco-nav-link" style={{ padding: '0.75rem 0.6rem' }}>
                  <BarChart3 size={18} />
                  Home
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
          {APP_LINKS.map((link) => {
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
