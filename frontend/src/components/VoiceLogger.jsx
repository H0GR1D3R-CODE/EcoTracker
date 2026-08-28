// EcoTrack/frontend/src/components/VoiceLogger.jsx
// Say an activity instead of typing it in - "I drove ten kilometers to
// work" becomes a pre-filled Calculator entry. The browser's own Web
// Speech API turns speech into text - see the note on WHERE THAT TEXT
// ACTUALLY COMES FROM below, this is NOT purely on-device in most
// browsers - and that transcript is then sent to Groq for extraction; see
// backend/routes/voice.py for the parsing route and why it never saves a
// record itself, only proposes one, the exact same two-step rule
// BillScanner.jsx already follows for a photographed bill.
//
// WHERE THAT TEXT ACTUALLY COMES FROM
// Chrome/Edge's webkitSpeechRecognition (the only implementation most
// visitors have - Firefox and Safari ship no usable equivalent, hence the
// SpeechRecognitionCtor gate below) is NOT a local model: it streams the
// microphone audio to Google's own speech-recognition servers and gets text
// back over the network. That matters for two real, user-facing reasons:
// it needs a working internet connection to work AT ALL (a slow/blocked one
// is a genuine, common cause of "stuck on Listening... forever", handled
// below via LISTEN_TIMEOUT_MS and the 'network' error case), and it is not
// an on-device privacy property this app can honestly claim - unlike the
// BillScanner photo, which really does stay local until the user submits it.
//
// WHY interimResults IS ON
// Without it, nothing appears on screen until Chrome is confident it has a
// FINAL result - if that confidence never arrives (background noise, an
// accent the model struggles with, a flaky connection to Google's service),
// the whole panel just sits on "Listening..." with no sign anything was
// ever heard, which reads as broken even when the mic is working perfectly.
// Interim results show a live, updating guess as the words come in, so
// there is always visible proof the microphone is doing something.
//
// Hidden entirely (not shown half-working) when either the browser has no
// SpeechRecognition support (Firefox, some browsers) or the server has no
// GROQ_API_KEY configured - the same "hide, don't half-work" rule the
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

// A real, hard ceiling on "Listening…" - without this, a hung connection to
// the browser's speech-recognition backend (see the module docstring on why
// that is a network call, not a local one) can leave the panel spinning
// forever with no error and nothing to click but Cancel. 12s is generous for
// one sentence but short enough that a genuine hang is caught quickly.
const LISTEN_TIMEOUT_MS = 12000;

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
  const timeoutRef = useRef(null);
  // Mirrors `transcript` state for the timeout callback below, which closes
  // over whatever `transcript` was AT THE MOMENT startListening ran (always
  // '') rather than its live value - a ref is what actually stays current.
  const transcriptRef = useRef('');

  const clearListenTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Stop listening on unmount too - navigating away mid-listen should not
  // leave the browser's mic indicator on or a stray timeout firing later
  // against a component that is no longer there to update.
  useEffect(() => {
    return () => {
      clearListenTimeout();
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!SpeechRecognitionCtor) return;
    voiceApi
      .getStatus()
      .then((data) => setAvailable(Boolean(data.available)))
      .catch(() => setAvailable(false));
  }, []);

  const closePanel = () => {
    clearListenTimeout();
    setPanelOpen(false);
    setListening(false);
    setTranscript('');
    transcriptRef.current = '';
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
    // Live partial guesses as speech comes in - see the module docstring on
    // why this is what actually fixes "nothing shows up while I'm talking".
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // event.results is every result seen so far this session, each with
      // its own .isFinal - for a single-utterance capture (continuous is
      // left at its default false) there is normally one, but reading the
      // LAST entry rather than assuming index 0 is what actually matches
      // what Chrome does when it revises an earlier interim guess.
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;
      transcriptRef.current = text;
      setTranscript(text);

      if (last.isFinal) {
        clearListenTimeout();
        runExtraction(text);
      }
    };

    recognition.onerror = (event) => {
      clearListenTimeout();
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access was denied. Allow it in your browser settings to use voice logging.');
      } else if (event.error === 'no-speech') {
        setError("Didn't catch anything - try again and speak right after tapping the mic.");
      } else if (event.error === 'network') {
        // The real, common cause behind "stuck on Listening... with no
        // error" that this whole change targets - see the module docstring
        // on why recognition needs a live connection to Google's own speech
        // service at all. Chrome does not always surface this promptly, or
        // at all, which is exactly what LISTEN_TIMEOUT_MS below is a
        // backstop for.
        setError('Could not reach the speech recognition service. Check your internet connection and try again.');
      } else {
        setError('Could not use the microphone. Please try again or enter it manually.');
      }
    };

    recognition.onend = () => {
      clearListenTimeout();
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();

    // The backstop for a hang that fires neither onresult nor onerror nor
    // onend in any reasonable time - a real, observed failure mode for a
    // network-backed API, not a hypothetical one. Forcing stop() here is
    // what turns an indefinite spinner into an honest, actionable message.
    timeoutRef.current = setTimeout(() => {
      recognition.stop();
      setListening(false);
      setError(
        transcriptRef.current
          ? "Didn't finish making that out - try again, a little slower."
          : "Didn't hear anything usable - check your internet connection, or enter it manually."
      );
    }, LISTEN_TIMEOUT_MS);
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem', padding: '1.4rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
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

                {/* The live, still-updating guess as words come in - see the
                    module docstring on interimResults: this is what proves
                    the microphone is actually being heard, instead of an
                    unexplained wait until a final result (or nothing) shows
                    up. Kept visually distinct (no quote marks yet) from the
                    settled transcript below, since it can still change. */}
                <span
                  className="eco-text-muted"
                  style={{ fontSize: '0.85rem', fontStyle: 'italic', minHeight: '1.2em', textAlign: 'center' }}
                >
                  {transcript || 'Say something…'}
                </span>
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
