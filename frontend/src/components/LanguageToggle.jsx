// EcoTrack/frontend/src/components/LanguageToggle.jsx
// One combined menu for language AND "read this page aloud" - previously
// two separate circular buttons (this one, plus ReadAloudButton.jsx) sitting
// side by side in the navbar. Merged after the pair pushed the signed-in
// navbar's right-side icon cluster past what fits at common laptop widths
// (~1366-1440px), clipping the Logout button off-screen with no way to
// reach it (a plain flex row, nowrap; the page clips overflow-x rather than
// scrolling to it). Rather than add a scroll affordance to a NAVBAR - an
// unusual, easily-missed interaction this app has deliberately avoided
// elsewhere (see the removed "scroll-rail" element) - the two rarely-used-
// together controls now share one trigger and one panel, reclaiming a full
// icon button's worth of width (44px + its gap) for good.
//
// The trigger still shows the current language code, same as before - that
// "EN" badge already worked as an at-a-glance language indicator, so
// keeping it is better than swapping in a generic icon that loses that.
// "Read this page aloud" is simply the first row inside the same panel,
// above a divider, ahead of the language list.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, Ear, Square } from 'lucide-react';

import { setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { useTheme } from '../context/ThemeContext';

const SPEECH_SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

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

// 44, not 38 - see ThemeToggle.jsx's own comment: Apple's HIG minimum
// comfortable tap target, with no text label to widen the hit area.
export default function LanguageToggle({ size = 44 }) {
  const { i18n, t } = useTranslation();
  const { prefersReducedMotion } = useTheme();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  // -1 = the read-aloud row, 0..N-1 = SUPPORTED_LANGUAGES - one flat list so
  // arrow-key navigation moves through both sections without a special case
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [speaking, setSpeaking] = useState(false);

  const containerRef = useRef(null);
  const listRef = useRef(null);

  const currentIndex = SUPPORTED_LANGUAGES.findIndex((language) => language.code === i18n.language);
  const current = currentIndex >= 0 ? SUPPORTED_LANGUAGES[currentIndex] : SUPPORTED_LANGUAGES[0];

  // Stop reading the old page the instant a new one arrives - otherwise the
  // Dashboard's numbers keep narrating over the top of whatever page was
  // just navigated to.
  useEffect(() => {
    if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    // "mousedown" rather than "click" so the list closes on press, before the
    // click has a chance to land on whatever is underneath
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [open, currentIndex]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    // +1: the read-aloud row (index -1) is the list's first DOM child
    const rowIndex = highlightedIndex + 1;
    const optionElement = listRef.current.children[rowIndex];
    if (optionElement) optionElement.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  const selectLanguage = (language) => {
    setLanguage(language.code);
    setOpen(false);
  };

  const stopReading = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const startReading = () => {
    const main = document.getElementById('main-content');
    const text = (main?.innerText || '').trim();
    if (!text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LOCALE[i18n.language] || 'en-US';
    utterance.rate = 0.98;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const toggleReading = () => (speaking ? stopReading() : startReading());

  // The item at the currently highlighted position - -1 is "read aloud",
  // 0..N-1 index into SUPPORTED_LANGUAGES
  const activateHighlighted = () => {
    if (highlightedIndex === -1) {
      if (SPEECH_SUPPORTED) toggleReading();
    } else if (SUPPORTED_LANGUAGES[highlightedIndex]) {
      selectLanguage(SUPPORTED_LANGUAGES[highlightedIndex]);
    }
  };

  const minIndex = SPEECH_SUPPORTED ? -1 : 0;

  const handleKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setHighlightedIndex((value) => Math.min(value + 1, SUPPORTED_LANGUAGES.length - 1));
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (open) setHighlightedIndex((value) => Math.max(value - 1, minIndex));
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) {
          activateHighlighted();
        } else {
          setOpen(true);
        }
        break;

      case 'Escape':
        setOpen(false);
        break;

      default:
        break;
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('language.currentLanguage', { language: current.name })}
        title={t('language.selectLanguage')}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: '1px solid var(--eco-border)',
          background: 'var(--eco-glass-bg)',
          backdropFilter: 'blur(10px)',
          color: 'var(--eco-text)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          fontSize: size * 0.26,
          fontWeight: 700,
          letterSpacing: '0.02em',
          transition: prefersReducedMotion ? 'none' : 'color var(--eco-transition), border-color var(--eco-transition)',
        }}
      >
        {current.code.toUpperCase()}
      </button>

      {open && (
        <motion.ul
          ref={listRef}
          role="menu"
          aria-label={t('language.selectLanguage')}
          initial={prefersReducedMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 1000,
            margin: 0,
            padding: '0.35rem',
            listStyle: 'none',
            background: 'var(--eco-card)',
            border: '1px solid var(--eco-glass-border)',
            borderRadius: 'var(--eco-radius-sm)',
            boxShadow: 'var(--eco-shadow)',
            minWidth: 200,
            maxHeight: 380,
            overflowY: 'auto',
          }}
        >
          {SPEECH_SUPPORTED && (
            <>
              <li
                role="menuitemcheckbox"
                aria-checked={speaking}
                onClick={toggleReading}
                onMouseEnter={() => setHighlightedIndex(-1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  padding: '0.55rem 0.7rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.92rem',
                  fontWeight: speaking ? 600 : 400,
                  background: highlightedIndex === -1 ? 'rgba(var(--eco-primary-rgb), 0.12)' : 'transparent',
                  color: speaking ? 'var(--eco-primary)' : 'var(--eco-text)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {speaking ? <Square size={15} /> : <Ear size={15} />}
                <span style={{ flex: 1 }}>
                  {speaking
                    ? t('a11y.stopReading', 'Stop reading this page')
                    : t('a11y.readAloud', 'Read this page aloud')}
                </span>
              </li>

              <li
                role="separator"
                style={{ height: 1, background: 'var(--eco-border)', margin: '0.3rem 0.2rem' }}
              />
            </>
          )}

          {SUPPORTED_LANGUAGES.map((language, index) => {
            const isSelected = language.code === current.code;
            const isHighlighted = index === highlightedIndex;

            return (
              <li
                key={language.code}
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => selectLanguage(language)}
                onMouseEnter={() => setHighlightedIndex(index)}
                dir={language.dir}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.6rem',
                  padding: '0.55rem 0.7rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.92rem',
                  fontWeight: isSelected ? 600 : 400,
                  background: isHighlighted ? 'rgba(var(--eco-primary-rgb), 0.12)' : 'transparent',
                  color: isSelected ? 'var(--eco-primary)' : 'var(--eco-text)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <span>{language.name}</span>
                {isSelected && <Check size={15} style={{ flexShrink: 0 }} />}
              </li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );
}
