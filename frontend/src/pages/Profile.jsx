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

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertCircle, Check, Mail, MapPin, Save, Shield, User } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { formatDate, getInitials } from '../utils/formatters';

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

  // Fill the form once the profile arrives from the backend.
  // Without this effect the inputs would stay empty, because the first render
  // happens before the profile request has finished.
  useEffect(() => {
    if (profile) {
      setForm({ name: profile.name || '', region: profile.region || 'India' });
    }
  }, [profile]);

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
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem', maxWidth: 760 }}>
      <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.4rem' }}>
        Your <span className="eco-gradient-text">Profile</span>
      </h1>
      <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
        Manage your account details.
      </p>

      {/* ---------- Identity card ---------- */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="eco-card"
        style={{ marginBottom: '1.3rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
              color: '#04140c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.5rem',
              fontFamily: 'Space Grotesk, sans-serif',
              flexShrink: 0,
            }}
          >
            {getInitials(profile?.name)}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: '1.35rem', marginBottom: '0.2rem' }}>
              {profile?.name || 'EcoTrack user'}
            </h2>

            <div
              className="eco-text-muted"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}
            >
              <Mail size={14} />
              <span style={{ wordBreak: 'break-all' }}>{profile?.email}</span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
              <span className="eco-badge eco-badge-low">
                <Check size={12} />
                Active account
              </span>

              {/* The admin badge reflects the admins collection in Firestore.
                  It is display only - every admin route re-checks it server-side. */}
              {isAdmin && (
                <span className="eco-badge" style={{ color: 'var(--eco-purple)' }}>
                  <Shield size={12} />
                  Administrator
                </span>
              )}

              {profile?.createdAt && (
                <span className="eco-badge eco-text-muted">
                  Member since {formatDate(profile.createdAt, 'MMM yyyy')}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ---------- Edit form ---------- */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="eco-card"
      >
        <h3 style={{ fontSize: '1.05rem', marginBottom: '1.3rem' }}>Edit details</h3>

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
            <div className="form-floating">
              <select
                id="profile-region"
                name="region"
                className={`form-select ${fieldClass('region')}`}
                value={form.region}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={saving}
              >
                {/* If the saved region is not in the list (for example an older
                    account), add it so the dropdown does not silently change it */}
                {!REGIONS.includes(form.region) && form.region && (
                  <option value={form.region}>{form.region}</option>
                )}
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <label htmlFor="profile-region">
                <MapPin size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Region
              </label>
            </div>
            <div className="eco-field-hint">
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
                    border: '2px solid rgba(0,0,0,0.25)',
                    borderTopColor: '#04140c',
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
