// EcoTrack/frontend/src/components/BillScanner.jsx
// Photograph a bill or receipt - electricity, fuel, water, a shopping
// invoice - and let Gemini read the quantity off it, instead of typing it
// in by hand. See backend/routes/ingest.py for the extraction route (and
// its BILL_EXTRACTION_INSTRUCTION for the full list of what it recognises)
// - it saves nothing itself; this component only ever PRE-FILLS the
// Calculator's own form fields via onExtracted, and the ordinary "Log it"
// submit is still what actually creates a record. The photo is downscaled
// here, client-side, before it ever leaves the browser - both to keep the
// request small on a bundled serverless function and because the backend
// never stores the image either way (see that route's docstring).

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertCircle, Camera, Check, Loader2, ScanLine, X } from 'lucide-react';

import { ingestApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { formatCategory, formatSubType } from '../utils/formatters';

// 2000px, not 1600 - the printed text on a bill (a meter reading, a small
// "units consumed" column) is often the smallest text on the page, and OCR
// accuracy on small print is the whole point of this feature. Quality 0.85
// keeps digits crisp. Still comfortably under backend/routes/ingest.py's
// MAX_IMAGE_BYTES (4MB decoded) - a 2000px photo at this quality is
// typically 400-900KB, nowhere near that ceiling even after base64 inflation.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Downscale + re-encode a File to a JPEG data URL, capped at MAX_DIMENSION
 * on the long edge.
 *
 * Re-encoding to JPEG here (rather than sending the original file) is what
 * lets the file picker below accept literally any image format the OS will
 * hand over, including ones the backend never has to know about: the
 * browser's own <img> decoder does the format-reading, and whatever comes
 * out the other end of this canvas is always a clean JPEG. The only
 * genuine failure mode is a format THIS BROWSER cannot decode at all
 * (chiefly: HEIC/HEIF on Chrome/Firefox, which have no built-in decoder
 * for it even though Safari does) - handleFile's catch block below turns
 * that into a specific, actionable message rather than a generic one.
 */
function downscaleImage(file) {
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
              ? "This browser can't open HEIC photos directly. In your phone's camera settings, switch the format to \"Most Compatible\" (JPEG), or take the photo with your camera app instead of picking an existing one."
              : 'Could not read that image - try a different photo.'
          )
        );
      };
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
  // `panelOpen` is its own flag, not derived from previewUrl - a photo the
  // browser cannot decode at all (see downscaleImage's HEIC case) never
  // produces a previewUrl, and the panel still needs to open to show that
  // specific error rather than silently doing nothing.
  const [panelOpen, setPanelOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const closePanel = () => {
    setPanelOpen(false);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setScanning(false);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    closePanel();
    setPanelOpen(true);
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
    closePanel();
  };

  return (
    <div>
      {/* "image/*" rather than a specific list - the browser's own file
          picker then offers every image format the OS has, including ones
          downscaleImage() above can still turn into a clean JPEG (gif, bmp,
          tiff, HEIC on Safari). Narrowing this to just jpeg/png/webp would
          hide legitimately readable photos from ever being selectable at
          all, for no benefit - the format check that actually matters
          happens where the browser tries to decode the file, not here. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {/* One click straight to the file picker - there used to be a second
          "Choose a photo" button hidden behind this one, which cost every
          scan an extra tap for no reason: the only thing that first click
          revealed was a single button whose sole job was to open this same
          picker. Sized and weighted the same way GoogleSignInButton is
          (full width, generous padding, a hover lift) so it reads as a
          real alternative way in, not a minor afterthought bolted beside
          the form. */}
      <motion.button
        type="button"
        onClick={() => inputRef.current?.click()}
        whileHover={prefersReducedMotion ? {} : { y: -2 }}
        whileTap={prefersReducedMotion ? {} : { scale: 0.985 }}
        className="eco-btn eco-btn-outline"
        style={{ width: '100%', justifyContent: 'center', padding: '0.8rem 1rem' }}
      >
        <Camera size={16} />
        Scan a bill or receipt instead
      </motion.button>
      <p
        className="eco-text-muted"
        style={{ fontSize: '0.78rem', textAlign: 'center', margin: '0.55rem 0 0', lineHeight: 1.5 }}
      >
        Photograph an electricity bill, fuel receipt or shopping invoice and
        we'll read the category, type and quantity off it for you.
      </p>

      {/* A plain conditional, not AnimatePresence/exit - framer-motion's
          height:'auto' exit transition (the previous approach here) turned
          out to be genuinely unreliable for this panel: confirmed live,
          repeatedly, that the CSS tween visually completes (height:0,
          opacity:0) but framer-motion's OWN completion callback never
          fires, so the node - collapsed to nothing, but never actually
          unmounted - is left sitting in the DOM permanently, keeping
          Dismiss/Try-another-photo dead after the first click. Losing the
          animated collapse on close is a small, honest trade for a control
          that reliably closes when clicked; the fade-in on open below is a
          different, layout-measurement-free animation and is not affected. */}
      {panelOpen && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
          >
            {/* A border-top rule, not a second nested .eco-card - this whole
                component already lives inside Calculator's one form card,
                and a card drawn inside a card doubled the border/padding
                into a visibly boxed-within-a-box look. */}
            <div style={{ marginTop: '1.1rem', paddingTop: '1rem', borderTop: '1px solid var(--rule)' }}>
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

              {scanning && !previewUrl && (
                // The photo failed to even decode into a preview (handled
                // in the catch block below, not this state) - or, more
                // commonly, this is the brief instant between choosing a
                // file and the canvas finishing its downscale. Either way,
                // the panel should never look empty and unresponsive while
                // scanning is genuinely still true.
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '2rem 0',
                    color: 'var(--eco-text-muted)',
                    fontSize: '0.85rem',
                  }}
                >
                  <Loader2 size={16} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                  Reading your document…
                </div>
              )}

              {error && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: previewUrl ? '0.9rem' : 0, color: 'var(--eco-danger)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}

              {error && (
                <button
                  type="button"
                  className="eco-btn eco-btn-ghost"
                  onClick={closePanel}
                  style={{ marginTop: '0.7rem', fontSize: '0.82rem' }}
                >
                  <X size={14} /> Dismiss
                </button>
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
                    <button type="button" className="eco-btn eco-btn-ghost" onClick={closePanel}>
                      <X size={15} /> Try another photo
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
      )}
    </div>
  );
}
