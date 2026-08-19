// EcoTrack/frontend/src/components/BillScanner.jsx
// Photograph an electricity bill or fuel receipt and let Gemini read the
// quantity off it, instead of typing it in by hand. See
// backend/routes/ingest.py for the extraction route - it saves nothing
// itself; this component only ever PRE-FILLS the Calculator's own form
// fields via onExtracted, and the ordinary "Log it" submit is still what
// actually creates a record. The photo is downscaled here, client-side,
// before it ever leaves the browser - both to keep the request small on a
// bundled serverless function and because the backend never stores the
// image either way (see that route's docstring).

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertCircle, Camera, Check, Loader2, ScanLine, X } from 'lucide-react';

import { ingestApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { formatCategory, formatSubType } from '../utils/formatters';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;

/** Downscale + re-encode a File to a JPEG data URL, capped at MAX_DIMENSION on the long edge. */
function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function BillScanner({ onExtracted }) {
  const { prefersReducedMotion } = useTheme();
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const reset = () => {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setScanning(false);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    reset();
    setScanning(true);

    try {
      const dataUrl = await downscaleImage(file);
      setPreviewUrl(dataUrl);
      const base64 = dataUrl.split(',')[1];

      const data = await ingestApi.scanBill({ imageBase64: base64, mimeType: 'image/jpeg' });
      setResult(data);
      if (data.parseError || !data.category || !data.quantity) {
        setError("Couldn't read a clear value from that photo - try a clearer shot, or enter it manually.");
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not scan that image.'));
    } finally {
      setScanning(false);
    }
  };

  const handleUse = () => {
    if (!result) return;
    onExtracted({ category: result.category, subType: result.subType, quantity: result.quantity, unit: result.unit });
    toast.success('Filled in from your photo — check it, then log it.');
    setOpen(false);
    reset();
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        type="button"
        className="eco-btn eco-btn-outline"
        style={{ fontSize: '0.82rem' }}
        onClick={() => setOpen((o) => !o)}
      >
        <Camera size={15} />
        {open ? 'Close bill scanner' : 'Scan a bill instead'}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="eco-card" style={{ marginTop: '0.9rem' }}>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleFile}
                style={{ display: 'none' }}
              />

              {!previewUrl && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="eco-btn eco-btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Camera size={16} />
                  Choose a photo of your bill or receipt
                </button>
              )}

              {previewUrl && (
                <div style={{ position: 'relative', borderRadius: 'var(--eco-radius-sm)', overflow: 'hidden' }}>
                  <img src={previewUrl} alt="Bill preview" style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }} />

                  {scanning && (
                    <motion.div
                      initial={{ y: '-10%' }}
                      animate={prefersReducedMotion ? { y: '50%' } : { y: ['0%', '100%'] }}
                      transition={prefersReducedMotion ? {} : { duration: 1.6, repeat: Infinity, ease: 'linear' }}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: 2,
                        background: 'var(--eco-primary)',
                        boxShadow: '0 0 12px var(--eco-primary)',
                      }}
                    />
                  )}

                  {scanning && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.35)',
                        color: '#fff',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      <ScanLine size={16} /> Reading your document…
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', color: 'var(--eco-danger)', fontSize: '0.82rem' }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}

              {result && !error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                >
                  {[
                    ['Category', formatCategory(result.category)],
                    ['Type', formatSubType(result.subType)],
                    ['Quantity', `${result.quantity} ${result.unit || ''}`],
                  ].map(([label, value], index) => (
                    <motion.div
                      key={label}
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: prefersReducedMotion ? 0 : index * 0.12 }}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
                    >
                      <span className="eco-text-muted">{label}</span>
                      <span className="eco-readout">{value}</span>
                    </motion.div>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                    <span className="eco-marker" style={{ fontSize: '0.68rem' }}>
                      Confidence {Math.round((result.confidence || 0) * 100)}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
                    <button type="button" className="eco-btn eco-btn-primary" onClick={handleUse} disabled={!result.category || !result.quantity}>
                      <Check size={15} /> Use these values
                    </button>
                    <button type="button" className="eco-btn eco-btn-ghost" onClick={reset}>
                      <X size={15} /> Try another photo
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
