// EcoTrack/frontend/src/components/VoiceLogger.jsx
// Say an activity instead of typing it in - "I drove ten kilometers to
// work" becomes a pre-filled Calculator entry. See backend/routes/voice.py
// for the parsing route and why it never saves a record itself, only
// proposes one, the exact same two-step rule BillScanner.jsx already
// follows for a photographed bill.
//
// WHY THIS RECORDS AUDIO INSTEAD OF USING THE BROWSER'S SpeechRecognition
// This used to run on the Web Speech API (window.webkitSpeechRecognition) -
// Chrome/Edge's built-in speech-to-text. That turned out to be a much
// narrower promise than it looked: it is not a standard every browser
// implements, and even among the browsers that DO expose the constructor
// (so `available` looked true), Opera, Brave and Vivaldi inherit the same
// `webkitSpeechRecognition` global from Chromium but cannot actually reach
// Google's proprietary speech backend behind it - onstart never fires,
// nothing ever works, for reasons entirely outside this app's control.
// Firefox and Safari never implemented it at all.
//
// MediaRecorder + getUserMedia have no such gap: every real browser that
// can use a microphone at all supports both. So this now records a short
// clip locally, uploads it to EcoTrack's own backend (POST
// /api/voice/transcribe), and Groq's Whisper model turns it into text
// there - a network round trip either way (the old approach silently
// streamed audio to Google's servers for the same reason), but one this
// app controls end to end, and one that actually works everywhere a
// microphone does. See backend/routes/voice.py's own module docstring for
// the rest of this reasoning.
//
// Hidden entirely (not shown half-working) when either this browser cannot
// record audio at all, or the server has no GROQ_API_KEY configured - the
// same "hide, don't half-work" rule the AI plan card and the AI report
// summary button already follow.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertCircle, Check, Mic, Sparkles, Square, X } from 'lucide-react';

import { voiceApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { formatCategory, formatSubType } from '../utils/formatters';

const MEDIA_RECORDING_SUPPORTED =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof window.MediaRecorder !== 'undefined';

// A real, hard ceiling on how long one recording can run - long enough for
// one unhurried sentence, short enough that tapping the mic and stepping
// away does not quietly upload a minute of silence. The Stop button ends
// it earlier; this is only the backstop.
const MAX_RECORD_MS = 15000;

// Tried in order; the first one this browser's MediaRecorder actually
// supports wins. Chrome, Edge and Firefox support webm/opus; Safari does
// not, and falls through to mp4/aac. If NONE of these are supported (rare),
// MediaRecorder is created with no mimeType at all and the browser picks
// its own default - still readable, since the upload also sends whatever
// type the resulting Blob reports.
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  return RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

// FileReader's data: URL, minus the "data:audio/webm;base64," prefix - the
// same base64-JSON convention BillScanner.jsx already uses for a photo (see
// backend/routes/voice.py's /transcribe docstring on why this app sends
// binary data up this way rather than as multipart form data).
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
}

export default function VoiceLogger({ onExtracted }) {
  const { prefersReducedMotion } = useTheme();
  const [available, setAvailable] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // The getUserMedia round trip BEFORE recording ever starts - a real,
  // visible native browser prompt appears before anything says
  // "Recording…", so a new user is asked, in the ordinary way, before the
  // app ever tries to hear them.
  const [requestingMic, setRequestingMic] = useState(false);
  const [recording, setRecording] = useState(false);
  // Covers both the upload and the backend's transcribe-then-extract work -
  // from the user's side this is one wait, not two.
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimeoutRef = useRef(null);

  const clearRecordTimeout = () => {
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  // Stop recording on unmount too - navigating away mid-recording should
  // not leave the browser's mic indicator on or a stray upload firing later
  // against a component that is no longer there to show its result.
  useEffect(() => {
    return () => {
      clearRecordTimeout();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      stopStream();
    };
  }, []);

  useEffect(() => {
    if (!MEDIA_RECORDING_SUPPORTED) return;
    voiceApi
      .getStatus()
      .then((data) => setAvailable(Boolean(data.available)))
      .catch(() => setAvailable(false));
  }, []);

  const closePanel = () => {
    clearRecordTimeout();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    stopStream();
    recorderRef.current = null;
    chunksRef.current = [];
    setPanelOpen(false);
    setRequestingMic(false);
    setRecording(false);
    setTranscribing(false);
    setTranscript('');
    setResult(null);
    setError(null);
  };

  // Called once MediaRecorder has finished assembling the clip (either the
  // Stop button, or MAX_RECORD_MS below).
  const handleRecordingStopped = async (mimeType) => {
    stopStream();
    const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
    chunksRef.current = [];

    if (blob.size === 0) {
      setRecording(false);
      setError("Didn't catch anything - try again and speak right after tapping the mic.");
      return;
    }

    setRecording(false);
    setTranscribing(true);
    try {
      const audioBase64 = await blobToBase64(blob);
      const data = await voiceApi.transcribe(audioBase64, blob.type);
      setTranscript(data.transcript || '');
      setResult(data);
      if (data.parseError || !data.category || !data.quantity) {
        setError(
          data.transcript
            ? "Couldn't make out a clear activity from that - try again, more directly (\"drove 8 kilometers\"), or enter it manually."
            : "Didn't catch anything usable - try again, closer to the microphone."
        );
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not process that recording.'));
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    closePanel();
    setPanelOpen(true);

    // ASK FOR MICROPHONE ACCESS FIRST, VISIBLY - see the module docstring
    // on why a genuine native prompt has to appear before anything on
    // screen says "Recording…".
    setRequestingMic(true);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (mediaError) {
      setRequestingMic(false);
      if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
        setError(
          'Microphone access is blocked for this site. Click the lock/site-info icon next to the ' +
          'address bar, set Microphone to "Allow", then try again.'
        );
      } else if (mediaError.name === 'NotFoundError' || mediaError.name === 'DevicesNotFoundError') {
        setError('No microphone was found on this device.');
      } else {
        setError('Could not access the microphone. Please try again or enter it manually.');
      }
      return;
    }
    setRequestingMic(false);
    streamRef.current = stream;

    const mimeType = pickRecorderMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stopStream();
      setError('This browser could not start recording. Please try again or enter it manually.');
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      clearRecordTimeout();
      handleRecordingStopped(recorder.mimeType || mimeType);
    };
    recorder.onerror = () => {
      clearRecordTimeout();
      stopStream();
      setRecording(false);
      setError('Something went wrong while recording. Please try again or enter it manually.');
    };

    recorderRef.current = recorder;
    setRecording(true);
    // A short timeslice keeps ondataavailable firing regularly rather than
    // only once at the very end, so even a recording cut short by an error
    // still has whatever audio was captured up to that point.
    recorder.start(1000);

    recordTimeoutRef.current = setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    }, MAX_RECORD_MS);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const handleUse = () => {
    if (!result) return;
    // onExtracted (Calculator.jsx's handleVoiceExtracted) now saves this
    // directly rather than only pre-filling the form - it shows its own
    // "Logged X kg CO2" toast once that finishes, so nothing is shown here
    // that would say something different a moment before that one lands.
    onExtracted({ category: result.category, subType: result.subType, quantity: result.quantity, unit: result.unit });
    closePanel();
  };

  if (!MEDIA_RECORDING_SUPPORTED || !available) return null;

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
          onClick={startRecording}
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
            {/* Its own, distinct state - see startRecording's own comment
                on why the microphone permission request happens BEFORE
                anything says "Recording…", not implicitly inside it. */}
            {requestingMic && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '1.4rem 0', fontSize: '0.9rem' }}>
                <Sparkles size={15} style={{ animation: 'eco-spin 1.4s linear infinite' }} />
                Requesting microphone access…
              </div>
            )}

            {recording && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem', padding: '1.4rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <motion.div
                    animate={prefersReducedMotion ? {} : { scale: [1, 1.25, 1] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--eco-danger)' }}
                  />
                  <span style={{ fontSize: '0.9rem' }}>Recording…</span>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="eco-btn eco-btn-ghost"
                    style={{ padding: '0.3rem 0.6rem' }}
                    aria-label="Stop recording"
                  >
                    <Square size={13} />
                  </button>
                </div>
                <span className="eco-text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Say one sentence, then tap stop.
                </span>
              </div>
            )}

            {transcript && !recording && !transcribing && (
              <p style={{ fontSize: '0.88rem', fontStyle: 'italic', margin: '0 0 1rem', color: 'var(--eco-text-muted)' }}>
                "{transcript}"
              </p>
            )}

            {transcribing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--eco-text-muted)' }}>
                <Sparkles size={14} style={{ animation: 'eco-spin 1.4s linear infinite' }} /> Listening back and working out what that means…
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

                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
                  <button type="button" className="eco-btn eco-btn-primary" onClick={handleUse} disabled={!result.category || !result.quantity}>
                    <Check size={15} /> Log this
                  </button>
                  <button type="button" className="eco-btn eco-btn-ghost" onClick={closePanel}>
                    <X size={15} /> Try again
                  </button>
                </div>
              </motion.div>
            )}

            {!requestingMic && !recording && !transcribing && !result && !error && (
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
