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

// How long to give the recognition engine to fire its own onstart before
// concluding this browser cannot run it at all (see startListening's own
// comment on Opera/Brave/Vivaldi inheriting the constructor but not the
// working backend) - short, because onstart on a browser that DOES support
// this fires close to immediately; this is not competing with real speech
// latency the way LISTEN_TIMEOUT_MS is.
const ENGINE_CHECK_MS = 4000;

export default function VoiceLogger({ onExtracted }) {
  const { prefersReducedMotion } = useTheme();
  const [available, setAvailable] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Distinct from `listening`: this is the getUserMedia round trip BEFORE
  // SpeechRecognition ever starts - see startListening's own comment on why
  // that ordering matters (a new user is asked, visibly, before the app
  // ever tries to hear them, not implicitly by whatever SpeechRecognition
  // itself would have done).
  const [requestingMic, setRequestingMic] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);
  const engineCheckRef = useRef(null);
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

  const clearEngineCheckTimeout = () => {
    if (engineCheckRef.current) {
      clearTimeout(engineCheckRef.current);
      engineCheckRef.current = null;
    }
  };

  // Stop listening on unmount too - navigating away mid-listen should not
  // leave the browser's mic indicator on or a stray timeout firing later
  // against a component that is no longer there to update.
  useEffect(() => {
    return () => {
      clearListenTimeout();
      clearEngineCheckTimeout();
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
    clearEngineCheckTimeout();
    setPanelOpen(false);
    setRequestingMic(false);
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

  const startListening = async () => {
    closePanel();
    setPanelOpen(true);

    // STEP 1: ASK FOR MICROPHONE ACCESS OURSELVES, FIRST - VIA getUserMedia,
    // NOT BY LETTING recognition.start() TRIGGER IT IMPLICITLY
    // getUserMedia is the standard, broadly-supported permission surface
    // (every real browser implements it) - unlike SpeechRecognition itself,
    // which is a much narrower Chrome-specific API (see the module docstring).
    // Requesting through it first means: a genuine, visible native browser
    // prompt appears before anything says "Listening…" (so a new user is
    // asked, in the ordinary way, before the app ever tries to hear them),
    // and a real Promise rejection to build an ACCURATE message from -
    // "denied" vs "no microphone at all" are different problems with
    // different fixes, and this is the only reliable way to tell them apart
    // BEFORE ever touching SpeechRecognition.
    setRequestingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Only needed to trigger/confirm the permission grant - the actual
      // capture for recognition is managed entirely inside SpeechRecognition
      // itself, so this stream is stopped immediately rather than held open.
      stream.getTracks().forEach((track) => track.stop());
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

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-IN';
    // Live partial guesses as speech comes in - see the module docstring on
    // why this is what actually fixes "nothing shows up while I'm talking".
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // STEP 2: DID THE RECOGNITION ENGINE ITSELF EVEN START?
    // A permission grant (step 1) proves the microphone works - it says
    // nothing about whether THIS BROWSER's SpeechRecognition can actually
    // reach a working speech-to-text backend at all. Chrome's own
    // implementation streams audio to Google's speech servers using an API
    // key that ships only in Google-branded Chrome; other Chromium-based
    // browsers (Opera, Brave, Vivaldi...) inherit the same `window.
    // webkitSpeechRecognition` constructor - so SpeechRecognitionCtor above
    // is truthy and this whole card renders - but silently cannot complete a
    // real recognition session: no onstart, no onresult, no onerror, ever.
    // That is a materially different, unfixable-by-the-user failure from
    // "listening fine, just hasn't heard you yet", so it gets caught fast
    // and named honestly instead of eventually hitting the same generic
    // "didn't hear anything" message LISTEN_TIMEOUT_MS gives a real hang.
    let engineStarted = false;
    recognition.onstart = () => {
      engineStarted = true;
      clearEngineCheckTimeout();
    };

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
      clearEngineCheckTimeout();
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
      clearEngineCheckTimeout();
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
      if (!engineStarted) {
        // onstart never fired even once in the full 12s - the engine-check
        // timeout below should have already caught this sooner in the
        // normal case, but this is the fallback if that one somehow did not.
        setError(
          "This browser's speech engine never responded - voice logging needs Google Chrome " +
          "(or another browser built on it that ships Chrome's own speech service). " +
          'Try Chrome, or enter this one manually.'
        );
      } else {
        setError(
          transcriptRef.current
            ? "Didn't finish making that out - try again, a little slower."
            : "Didn't hear anything usable - check your internet connection, or enter it manually."
        );
      }
    }, LISTEN_TIMEOUT_MS);

    // The FAST version of the same check above, specifically for the
    // "this browser's engine cannot run at all" case - onstart on a working
    // engine fires close to immediately, so ENGINE_CHECK_MS gives a real
    // hang in a supported browser plenty of margin while still catching an
    // unsupported one (Opera and kin) far sooner than the full 12s backstop.
    engineCheckRef.current = setTimeout(() => {
      if (engineStarted) return;
      recognition.stop();
      clearListenTimeout();
      setListening(false);
      setError(
        "This browser's speech engine never responded - voice logging needs Google Chrome " +
        "(or another browser built on it that ships Chrome's own speech service). " +
        'Try Chrome, or enter this one manually.'
      );
    }, ENGINE_CHECK_MS);
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
            {/* Its own, distinct state - see startListening's own comment on
                why the microphone permission request happens BEFORE
                anything says "Listening…", not implicitly inside it. */}
            {requestingMic && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '1.4rem 0', fontSize: '0.9rem' }}>
                <Sparkles size={15} style={{ animation: 'eco-spin 1.4s linear infinite' }} />
                Requesting microphone access…
              </div>
            )}

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

            {!requestingMic && !listening && !parsing && !result && !error && (
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
