// EcoTrack/frontend/src/components/ReadAloudButton.jsx
// Reads the current page's main content aloud using the browser's built-in
// SpeechSynthesis API - a text-to-speech counterpart to VoiceLogger.jsx's
// speech-to-text, for anyone who finds listening easier than reading (low
// vision, dyslexia, or just a tired pair of eyes). Entirely client-side,
// same as VoiceLogger: nothing is sent to any server for this.
//
// HIDE, DON'T HALF-WORK
// Renders null outright on a browser with no speechSynthesis support,
// rather than showing a button that does nothing when tapped - the same
// gating rule VoiceLogger and AiPlanCard already follow.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ear, Square } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

const SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

// SpeechSynthesis wants a full BCP-47 tag (e.g. "hi-IN"), not just the
// two-letter i18next code this app otherwise uses everywhere - the browser
// picks a much better-matched installed voice with the full tag.
const SPEECH_LOCALE = {
  en: 'en-US',
  hi: 'hi-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  ar: 'ar-SA',
  zh: 'zh-CN',
  pt: 'pt-BR',
  de: 'de-DE',
  ja: 'ja-JP',
  ru: 'ru-RU',
};

export default function ReadAloudButton({ size = 44 }) {
  const { i18n, t } = useTranslation();
  const { prefersReducedMotion } = useTheme();
  const location = useLocation();

  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  // Stop reading the old page the instant a new one arrives - otherwise the
  // Dashboard's numbers keep narrating over the top of whatever page was
  // just navigated to.
  useEffect(() => {
    if (SUPPORTED) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (SUPPORTED) window.speechSynthesis.cancel();
    };
  }, []);

  if (!SUPPORTED) return null;

  const stop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const start = () => {
    const main = document.getElementById('main-content');
    const text = (main?.innerText || '').trim();
    if (!text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LOCALE[i18n.language] || 'en-US';
    utterance.rate = 0.98;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;

    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      type="button"
      onClick={speaking ? stop : start}
      aria-label={speaking ? t('a11y.stopReading', 'Stop reading this page') : t('a11y.readAloud', 'Read this page aloud')}
      title={speaking ? t('a11y.stopReading', 'Stop reading this page') : t('a11y.readAloud', 'Read this page aloud')}
      aria-pressed={speaking}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1px solid ${speaking ? 'var(--eco-primary)' : 'var(--eco-border)'}`,
        background: speaking ? 'rgba(var(--eco-primary-rgb), 0.14)' : 'var(--eco-glass-bg)',
        backdropFilter: 'blur(10px)',
        color: speaking ? 'var(--eco-primary)' : 'var(--eco-text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        transition: prefersReducedMotion ? 'none' : 'color var(--eco-transition), border-color var(--eco-transition), background-color var(--eco-transition)',
      }}
    >
      {speaking ? <Square size={16} /> : <Ear size={18} />}
    </button>
  );
}
