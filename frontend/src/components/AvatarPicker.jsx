// EcoTrack/frontend/src/components/AvatarPicker.jsx
// The modal opened by clicking your own avatar on Profile.jsx - choose one
// of a curated set of icon marks, upload a photo of your own, or go back to
// plain initials. Same fixed-overlay modal shell ActivityLog.jsx's EditModal
// already uses, for the one control surface this needs.
//
// UPLOAD PATH
// A photo is downscaled AND CENTRE-CROPPED TO A SQUARE client-side, via
// canvas, before it ever leaves the browser - the same technique
// BillScanner.jsx already uses to keep a bill photo small, extended here
// with a crop step since an avatar specifically needs a 1:1 image (an oval
// face crammed into a circle mask is a worse result than actually cropping
// it square first). Always re-encoded to JPEG regardless of the source
// format, which is what lets the backend use one fixed Storage path
// (avatars/{uid}.jpg) forever - see backend/routes/auth.py's upload_avatar
// for the other half of that reasoning.

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertCircle, Camera, Check, Loader2, RotateCcw, X } from 'lucide-react';

import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Avatar, { AVATAR_PRESETS } from './Avatar';

// 512px is plenty for every place this ever renders (the largest is this
// modal's own preview, well under that) while keeping the upload small -
// avatars are shown at 60px or less everywhere else in the app.
const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.88;

/**
 * Downscale + CENTRE-CROP a File to a square JPEG data URL.
 *
 * Unlike BillScanner.jsx's downscaleImage (which preserves the original
 * aspect ratio - a bill's actual proportions matter for reading it), an
 * avatar is always rendered inside a circle, so a non-square source has to
 * be cropped to square here rather than squashed or letterboxed.
 */
function prepareAvatarImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        const isHeic = /\.hei[cf]$/i.test(file.name) || /heic|heif/i.test(file.type);
        reject(
          new Error(
            isHeic
              ? "This browser can't open HEIC photos directly. Switch your camera's format to \"Most Compatible\" (JPEG) and try again."
              : 'Could not read that image - try a different photo.'
          )
        );
      };
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sourceX = (img.width - side) / 2;
        const sourceY = (img.height - side) / 2;
        const outputSide = Math.min(MAX_DIMENSION, side);

        const canvas = document.createElement('canvas');
        canvas.width = outputSide;
        canvas.height = outputSide;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sourceX, sourceY, side, side, 0, 0, outputSide, outputSide);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AvatarPicker({ onClose }) {
  const { profile, updateProfile, uploadAvatar } = useAuth();
  const { prefersReducedMotion } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [savingPreset, setSavingPreset] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const busy = uploading || savingPreset !== null || removing;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file next time
    if (!file || busy) return;

    setError(null);
    setUploading(true);
    try {
      const dataUrl = await prepareAvatarImage(file);
      const base64 = dataUrl.split(',')[1];
      await uploadAvatar(base64, 'image/jpeg');
      toast.success('Avatar updated.');
      onClose();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not upload that photo.'));
    } finally {
      setUploading(false);
    }
  };

  const handlePreset = async (presetId) => {
    if (busy) return;
    setError(null);
    setSavingPreset(presetId);
    try {
      await updateProfile({ avatarType: 'preset', avatarValue: presetId });
      toast.success('Avatar updated.');
      onClose();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not save that avatar.'));
    } finally {
      setSavingPreset(null);
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setError(null);
    setRemoving(true);
    try {
      await updateProfile({ avatarType: null, avatarValue: null });
      toast.success('Back to your initials.');
      onClose();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not remove your avatar.'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={busy ? undefined : onClose}
    >
      {/* Enter-only, no AnimatePresence/exit - the same class of bug fixed
          everywhere else in this app that used to depend on an exit
          animation completing before the next thing could render. */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="eco-card"
        style={{ width: '100%', maxWidth: 460 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.3rem' }}>
          <div>
            <span className="eco-marker" style={{ display: 'block', marginBottom: '0.3rem' }}>
              Your avatar
            </span>
            <h3 className="eco-display" style={{ fontSize: '1.1rem', margin: 0 }}>Choose how you appear</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: 'var(--eco-text-muted)', cursor: busy ? 'default' : 'pointer', padding: 6 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Upload */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            padding: '0.9rem',
            marginBottom: '1.3rem',
            border: '1px solid var(--eco-border)',
            borderRadius: 'var(--eco-radius-sm)',
          }}
        >
          <Avatar profile={profile} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>Upload your own photo</div>
            <div className="eco-text-muted" style={{ fontSize: '0.78rem', marginTop: '0.1rem' }}>
              Cropped to a square, kept small - under 2MB
            </div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="eco-btn eco-btn-outline"
            style={{ flexShrink: 0, fontSize: '0.82rem', padding: '0.5rem 0.85rem' }}
          >
            {uploading ? (
              <Loader2 size={15} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
            ) : (
              <Camera size={15} />
            )}
            {uploading ? 'Uploading…' : 'Choose photo'}
          </button>
        </div>

        {/* Presets */}
        <div className="eco-text-muted" style={{ fontSize: '0.72rem', fontWeight: 500, marginBottom: '0.6rem' }}>
          OR PICK ONE
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
            gap: '0.6rem',
            marginBottom: '1.3rem',
          }}
        >
          {AVATAR_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isSelected = profile?.avatarType === 'preset' && profile?.avatarValue === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePreset(preset.id)}
                disabled={busy}
                aria-label={preset.label}
                aria-pressed={isSelected}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.7rem 0.4rem',
                  border: `1px solid ${isSelected ? preset.color : 'var(--eco-border)'}`,
                  borderRadius: 'var(--eco-radius-sm)',
                  background: isSelected ? `color-mix(in srgb, ${preset.color} 10%, var(--eco-card))` : 'transparent',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: preset.color,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {savingPreset === preset.id ? (
                    <Loader2 size={18} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                  ) : (
                    <Icon size={18} />
                  )}
                </div>
                {isSelected && <Check size={12} style={{ color: preset.color }} />}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--eco-danger)', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '1rem' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {profile?.avatarType && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="eco-btn eco-btn-ghost"
            style={{ width: '100%', fontSize: '0.85rem' }}
          >
            {removing ? (
              <Loader2 size={15} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
            ) : (
              <RotateCcw size={15} />
            )}
            Go back to plain initials
          </button>
        )}
      </motion.div>
    </div>
  );
}
