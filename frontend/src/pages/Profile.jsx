// EcoTrack/frontend/src/pages/Profile.jsx
// The user's account page - view and edit name and region.
//
// This page is fully working, and it is deliberately the first one to be
// finished: it exercises the entire authentication stack end to end. If saving
// a name here works, then Firebase login, the ID token, the Authorization
// header, the Flask token check and the Firestore write are all correct.
//
// Email is shown but cannot be edited. Changing an email address has to go
// through Firebase Auth itself, otherwise the Auth account and the Firestore
// profile would disagree about who the user is.
//
// Restyled into the instrument system. The identity block and stats summary
// lose their cards for channels under rules - they are readings about the
// account, not separate widgets - while the edit form keeps its card as the
// page's one control surface.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertCircle,
  CalendarDays,
  Check,
  Database,
  Leaf,
  Mail,
  MapPin,
  Save,
  Shield,
  Target,
  User,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { dashboardApi, getErrorMessage } from '../utils/api';
import SelectField from '../components/SelectField';
import { formatCategory, formatDate, formatEmission, formatNumber, getInitials } from '../utils/formatters';

const REGIONS = [
  'India',
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'West Bengal',
  'Other',
];

export default function Profile() {
  const { profile, isAdmin, updateProfile } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [form, setForm] = useState({ name: '', region: 'India' });
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);

  // The at-a-glance figures shown above the edit form. Pulled from the same
  // dashboard summary the Dashboard page uses, so the two never disagree.
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);

  // Fill the form once the profile arrives from the backend.
  // Without this effect the inputs would stay empty, because the first render
  // happens before the profile request has finished.
  useEffect(() => {
    if (profile) {
      setForm({ name: profile.name || '', region: profile.region || 'India' });
    }
  }, [profile]);

  // Load the stats summary once. A failure here is not fatal - the profile edit
  // form still works - so it degrades to hiding the stats rather than erroring.
  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .getSummary()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setStatsError(true);
          console.error('[EcoTrack] Profile stats:', getErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const errors = {
    name: !form.name.trim()
      ? 'Name is required.'
      : form.name.trim().length < 2
        ? 'Name must be at least 2 characters.'
        : form.name.trim().length > 60
          ? 'Name must be 60 characters or fewer.'
          : null,
    region: !form.region ? 'Please choose a region.' : null,
  };

  const isValid = !errors.name && !errors.region;

  // Nothing to save if the user has not actually changed anything.
  // Comparing against the loaded profile is what greys the Save button out.
  const hasChanges =
    profile && (form.name.trim() !== profile.name || form.region !== profile.region);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleBlur = (event) => {
    setTouched((previous) => ({ ...previous, [event.target.name]: true }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setTouched({ name: true, region: true });
    if (!isValid || saving || !hasChanges) return;

    setSaving(true);

    try {
      await updateProfile({ name: form.name.trim(), region: form.region });
      toast.success('Profile updated successfully.');
      setTouched({});
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (field) => {
    if (!touched[field]) return '';
    return errors[field] ? 'is-invalid' : 'is-valid';
  };

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem', maxWidth: 780 }}>
      <div style={{ marginBottom: '2.4rem' }}>
        <div className="eco-marker" style={{ marginBottom: '1rem', display: 'block' }}>
          Your account
        </div>
        <h1 className="eco-display" style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', margin: '0 0 0.5rem' }}>
          Your <span className="eco-gradient-text">Profile</span>
        </h1>
        <p className="eco-text-muted" style={{ margin: 0 }}>
          Manage your account details.
        </p>
      </div>

      {/* ---------- Identity ---------- */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)', marginBottom: '2rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'wrap' }}>
          {/* The avatar keeps the gradient disc - it is the one place on the
              site a person's identity is represented, not a measurement, so it
              is exempt from the "never gradient-fill a figure" rule that
              applies to numbers. */}
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
              color: '#04140c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '1.3rem',
              fontFamily: 'var(--font-display)',
              flexShrink: 0,
            }}
          >
            {getInitials(profile?.name)}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="eco-display" style={{ fontSize: '1.4rem', margin: '0 0 0.3rem' }}>
              {profile?.name || 'EcoTrack user'}
            </h2>

            <div
              className="eco-text-muted"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}
            >
              <Mail size={13} style={{ flexShrink: 0 }} />
              <span style={{ wordBreak: 'break-all' }}>{profile?.email}</span>
            </div>

            {/* Status markers, not badge pills - they were glass chips; a
                marker in mono is the same instrument notation the calibration
                rail and every readout label already use. */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
              <span
                className="eco-marker"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--eco-primary)' }}
              >
                <Check size={12} />
                Active account
              </span>

              {/* The admin badge reflects the admins collection in Firestore.
                  It is display only - every admin route re-checks it server-side. */}
              {isAdmin && (
                <span
                  className="eco-marker"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--eco-purple)' }}
                >
                  <Shield size={12} />
                  Administrator
                </span>
              )}

              {profile?.createdAt && (
                <span className="eco-marker">
                  Member since {formatDate(profile.createdAt, 'MMM yyyy')}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ---------- Stats summary ---------- */}
      {stats && !statsError && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06 }}
          style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)', marginBottom: '2rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1.4rem' }}>
            <Activity size={17} style={{ color: 'var(--eco-primary)' }} />
            <h3 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>
              Your activity at a glance
            </h3>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1.6rem',
            }}
          >
            {/* The four accents are the theme-aware category variables now,
                not the hardcoded dark-theme hexes (#00ff87 etc.) that used to
                sit here - #00ff87 measures 1.21:1 on the paper ground. */}
            {[
              {
                icon: CalendarDays,
                color: 'var(--cat-transport)',
                label: 'This month',
                value: formatEmission(stats.thisMonth || 0),
              },
              {
                icon: Leaf,
                color: 'var(--org-goldstandard)',
                label: 'This year',
                value: formatEmission(stats.thisYear || 0),
              },
              {
                icon: Database,
                color: 'var(--cat-water)',
                label: 'Entries logged',
                value: formatNumber(stats.totalRecords || 0, 0),
              },
              {
                icon: Target,
                color: 'var(--cat-electricity)',
                label: 'Active goals',
                value: formatNumber(stats.activeGoals || 0, 0),
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} style={{ paddingTop: '0.85rem', borderTop: '1px solid var(--rule)' }}>
                  <Icon size={16} style={{ color: item.color, display: 'block', marginBottom: '0.6rem' }} />
                  <div className="eco-readout" style={{ fontSize: '1.15rem', fontWeight: 500, lineHeight: 1.15 }}>
                    {item.value}
                  </div>
                  <div className="eco-marker" style={{ marginTop: '0.3rem' }}>
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* One-line highlight - the category doing the most damage this month */}
          {stats.bestCategory?.category && (
            <p
              className="eco-text-muted"
              style={{ fontSize: '0.86rem', marginTop: '1.4rem', marginBottom: 0, lineHeight: 1.6 }}
            >
              <Leaf size={13} style={{ verticalAlign: -2, marginRight: 5, color: 'var(--eco-primary)' }} />
              Your standout category this month is{' '}
              <strong style={{ color: 'var(--eco-text)' }}>
                {formatCategory(stats.bestCategory.category)}
              </strong>
              .
            </p>
          )}
        </motion.div>
      )}

      {/* ---------- Edit form ---------- */}
      {/* The form keeps its card - the only control surface on the page, the
          same reasoning applied to every form elsewhere in the app. */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="eco-card"
      >
        <h3 className="eco-display" style={{ fontSize: '1.15rem', marginBottom: '1.4rem' }}>
          Edit details
        </h3>

        <form className="eco-form" onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="text"
                id="profile-name"
                name="name"
                className={`form-control ${fieldClass('name')}`}
                placeholder="Your full name"
                value={form.name}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={saving}
              />
              <label htmlFor="profile-name">
                <User size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Full name
              </label>
            </div>
            {touched.name && errors.name && (
              <div className="eco-field-error">
                <AlertCircle size={13} />
                {errors.name}
              </div>
            )}
          </div>

          {/* Email is read-only, so it is disabled rather than editable */}
          <div className="mb-3">
            <div className="form-floating">
              <input
                type="email"
                id="profile-email"
                className="form-control"
                placeholder="you@example.com"
                value={profile?.email || ''}
                disabled
                readOnly
              />
              <label htmlFor="profile-email">
                <Mail size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Email address
              </label>
            </div>
            <div className="eco-field-hint">
              Email cannot be changed here — it is managed by Firebase Authentication.
            </div>
          </div>

          <div className="mb-3">
            <SelectField
              id="profile-region"
              label="Region"
              value={form.region}
              onChange={(region) => setForm((previous) => ({ ...previous, region }))}
              disabled={saving}
              options={[
                // If the saved region is not in the standard list (an older
                // account, or one edited by hand), it is added at the top so
                // opening the dropdown cannot silently change the saved value
                ...(!REGIONS.includes(form.region) && form.region
                  ? [{ value: form.region, label: form.region }]
                  : []),
                ...REGIONS.map((region) => ({ value: region, label: region })),
              ]}
            />
            <div className="eco-field-hint">
              <MapPin size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              Used to pick region-specific emission factors where they exist.
            </div>
          </div>

          <button
            type="submit"
            className="eco-btn eco-btn-primary"
            disabled={saving || !hasChanges || !isValid}
            style={{ marginTop: '0.8rem' }}
          >
            {saving ? (
              <>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    // White, matching the button's own label - it was near-black
                    // on a gradient dark enough to need white text, the same fix
                    // already applied to Login and Register.
                    border: '2px solid rgba(255,255,255,0.35)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'eco-spin 0.8s linear infinite',
                  }}
                />
                Saving…
              </>
            ) : (
              <>
                <Save size={17} />
                {hasChanges ? 'Save changes' : 'No changes to save'}
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
