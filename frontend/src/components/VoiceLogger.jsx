// EcoTrack/frontend/src/components/VoiceLogger.jsx
// Say an activity instead of typing it in - "I drove ten kilometers to
// work" becomes a pre-filled Calculator entry. The browser's own Web
// Speech API turns speech into text locally (no audio ever leaves the
// device); that transcript is then sent to Gemini for extraction - see
// backend/routes/voice.py for the parsing route and why it never saves a
// record itself, only proposes one, the exact same two-step rule
// BillScanner.jsx already follows for a photographed bill.
//
// Hidden entirely (not shown half-working) when either the browser has no
// SpeechRecognition support (Firefox, some browsers) or the server has no
// GEMINI_API_KEY configured - the same "hide, don't half-work" rule the
// AI plan card and the AI report summary button already follow.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertCircle, Check, Mic, Sparkles, Square, X } from 'lucide-react';

import { voiceApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { formatCategory, formatSubType } from '../utils/formatters';

const SpeechRecognitionCtor =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function VoiceLogger({ onExtracted }) {
  const { prefersReducedMotion } = useTheme();
  const [available, setAvailable] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!SpeechRecognitionCtor) return;
    voiceApi
      .getStatus()
      .then((data) => setAvailable(Boolean(data.available)))
      .catch(() => setAvailable(false));
  }, []);

  const closePanel = () => {
    setPanelOpen(false);
    setListening(false);
    setTranscript('');
    setParsing(false);
    setResult(null);
    setError(null);
    recognitionRef.current?.stop();
  };

  const runExtraction = async (text) => {
    setParsing(true);
    try {
      const data = await voiceApi.parse(text);
      setResult(data);
      if (data.parseError || !data.category || !data.quantity) {
        setError("Couldn't make out a clear activity from that - try again, more directly (\"drove 8 kilometers\"), or enter it manually.");
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not process that.'));
    } finally {
      setParsing(false);
    }
  };

  const startListening = () => {
    closePanel();
    setPanelOpen(true);

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      runExtraction(text);
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access was denied. Allow it in your browser settings to use voice logging.');
      } else if (event.error === 'no-speech') {
        setError("Didn't catch anything - try again and speak right after tapping the mic.");
      } else {
        setError('Could not use the microphone. Please try again or enter it manually.');
      }
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const handleUse = () => {
    if (!result) return;
    onExtracted({ category: result.category, subType: result.subType, quantity: result.quantity, unit: result.unit });
    toast.success('Filled in — check it, then log it.');
    closePanel();
  };

  if (!SpeechRecognitionCtor || !available) return null;

  return (
    <div
      style={{
        marginBottom: '2rem',
        padding: '1.4rem 1.5rem',
        borderRadius: 'var(--eco-radius)',
        border: '1px solid color-mix(in srgb, var(--eco-purple) 28%, var(--eco-border))',
        background: 'color-mix(in srgb, var(--eco-purple) 5%, var(--eco-card))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'wrap' }}>
        <div
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'var(--eco-purple)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Mic size={22} />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <span
            className="eco-marker"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--eco-purple)', marginBottom: '0.35rem' }}
          >
            <Sparkles size={12} /> AI-powered
          </span>
          <h2 className="eco-display" style={{ margin: '0 0 0.3rem', fontSize: '1.15rem' }}>
            Say it instead of typing it in
          </h2>
          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
            "I drove ten kilometers to work" or "I had a vegetarian meal" - tap the mic and just say it.
          </p>
        </div>

        <motion.button
          type="button"
          onClick={startListening}
          whileHover={prefersReducedMotion ? {} : { y: -2 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.985 }}
          className="eco-btn eco-btn-primary"
          style={{ flexShrink: 0, background: 'var(--eco-purple)', borderColor: 'var(--eco-purple)' }}
        >
          <Mic size={16} />
          Speak now
        </motion.button>
      </div>

      {/* A plain conditional, not AnimatePresence/exit - the same class of
          bug fixed across BillScanner.jsx and others: framer-motion's own
          exit-completion callback never reliably fires here. */}
      {panelOpen && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
        >
          <div
            style={{
              marginTop: '1.2rem',
              paddingTop: '1.1rem',
              borderTop: '1px solid color-mix(in srgb, var(--eco-purple) 20%, var(--eco-border))',
            }}
          >
            {listening && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', padding: '1.6rem 0' }}>
                <motion.div
                  animate={prefersReducedMotion ? {} : { scale: [1, 1.25, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--eco-danger)' }}
                />
                <span style={{ fontSize: '0.9rem' }}>Listening…</span>
                <button
                  type="button"
                  onClick={() => recognitionRef.current?.stop()}
                  className="eco-btn eco-btn-ghost"
                  style={{ padding: '0.3rem 0.6rem' }}
                  aria-label="Stop listening"
                >
                  <Square size={13} />
                </button>
              </div>
            )}

            {transcript && !listening && (
              <p style={{ fontSize: '0.88rem', fontStyle: 'italic', margin: '0 0 1rem', color: 'var(--eco-text-muted)' }}>
                "{transcript}"
              </p>
            )}

            {parsing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--eco-text-muted)' }}>
                <Sparkles size={14} /> Working out what that means…
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--eco-danger)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {result && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
              >
                {[
                  ['Category', formatCategory(result.category)],
                  ['Type', formatSubType(result.subType)],
                  ['Quantity', `${result.quantity} ${result.unit || ''}`],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span className="eco-text-muted">{label}</span>
                    <span className="eco-readout">{value}</span>
                  </div>
                ))}

                <span className="eco-marker" style={{ fontSize: '0.68rem', marginTop: '0.2rem' }}>
                  Confidence {Math.round((result.confidence || 0) * 100)}%
                </span>

                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
                  <button type="button" className="eco-btn eco-btn-primary" onClick={handleUse} disabled={!result.category || !result.quantity}>
                    <Check size={15} /> Use these values
                  </button>
                  <button type="button" className="eco-btn eco-btn-ghost" onClick={closePanel}>
                    <X size={15} /> Try again
                  </button>
                </div>
              </motion.div>
            )}

            {!listening && !parsing && !result && !error && (
              <button type="button" className="eco-btn eco-btn-ghost" onClick={closePanel} style={{ fontSize: '0.8rem' }}>
                <X size={14} /> Cancel
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
