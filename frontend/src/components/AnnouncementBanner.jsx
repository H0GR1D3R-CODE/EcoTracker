// EcoTrack/frontend/src/components/AnnouncementBanner.jsx
// The one site-wide banner an admin can put in front of every signed-in
// user - see backend/routes/announcements.py's own module docstring for
// the full design (one active announcement at a time, dismissal is
// client-side only). Mounted once in App.jsx, right under Navbar, so it
// sits above every page rather than being a per-page concern.
//
// Signed-in only - the endpoint itself requires a token (see
// routes/announcements.py), and a visitor with no account has nothing here
// to be told about that a public page would not already say.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Info, Sparkles, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { announcementsApi } from '../utils/api';

// Same key-per-browser pattern the theme and reduce-motion preferences
// already use - see that route's own module docstring for why this is
// deliberately NOT written to the user's Firestore profile.
const DISMISSED_KEY = 'eco_dismissed_announcement_id';

// The exact good/warning/neutral vocabulary Dashboard.jsx's own insights
// already use, kept identical here rather than inventing a fourth "info"
// tone this app has never had anywhere else.
const TONE_STYLES = {
  good: { icon: Sparkles, color: 'var(--eco-primary)', tint: 'color-mix(in srgb, var(--eco-primary) 8%, var(--eco-bg-alt))' },
  warning: { icon: AlertTriangle, color: 'var(--readout)', tint: 'color-mix(in srgb, var(--readout) 8%, var(--eco-bg-alt))' },
  neutral: { icon: Info, color: 'var(--eco-text-muted)', tint: 'var(--eco-bg-alt)' },
};

export default function AnnouncementBanner() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const [announcement, setAnnouncement] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) {
      setAnnouncement(null);
      return;
    }

    let cancelled = false;
    announcementsApi
      .getActive()
      .then((data) => {
        if (cancelled) return;
        setAnnouncement(data.announcement || null);
        setDismissed(
          Boolean(data.announcement) && localStorage.getItem(DISMISSED_KEY) === data.announcement.id
        );
      })
      .catch(() => {
        // A banner is a nice-to-have, not core functionality - a failed
        // fetch here should never block or error out the rest of the app.
        if (!cancelled) setAnnouncement(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!announcement || dismissed) return null;

  const tone = TONE_STYLES[announcement.tone] || TONE_STYLES.neutral;
  const Icon = tone.icon;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, announcement.id);
    setDismissed(true);
  };

  // Internal links (starting with "/") use the router; anything else opens
  // in a new tab, the same as every other external link in this app.
  const isInternalLink = announcement.link?.to?.startsWith('/');

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.3 }}
      style={{
        background: tone.tint,
        borderBottom: `1px solid color-mix(in srgb, ${tone.color} 25%, transparent)`,
        overflow: 'hidden',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.7rem',
          padding: '0.65rem 0',
          flexWrap: 'wrap',
        }}
      >
        <Icon size={16} style={{ color: tone.color, flexShrink: 0 }} />
        <span style={{ flex: '1 1 auto', fontSize: '0.86rem', minWidth: 0 }}>
          {announcement.message}
        </span>

        {announcement.link &&
          (isInternalLink ? (
            <Link
              to={announcement.link.to}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600, color: tone.color, flexShrink: 0 }}
            >
              {announcement.link.label}
              <ArrowRight size={13} />
            </Link>
          ) : (
            <a
              href={announcement.link.to}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600, color: tone.color, flexShrink: 0 }}
            >
              {announcement.link.label}
              <ArrowRight size={13} />
            </a>
          ))}

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss this announcement"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--eco-text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            flexShrink: 0,
          }}
        >
          <X size={15} />
        </button>
      </div>
    </motion.div>
  );
}
