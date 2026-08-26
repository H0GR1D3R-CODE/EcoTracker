// EcoTrack/frontend/src/components/LanguageToggle.jsx
// The language switcher - a small circular trigger (same family as
// ThemeToggle.jsx) that opens a floating list of every language registered
// in src/i18n/index.js. See that file for what is and is not translated yet
// (currently: the navbar + Home page's hero, in every language below).
//
// Grew from a plain two-way EN/HI toggle button into this dropdown once a
// third language arrived - a binary "tap to switch" control has nowhere to
// go once there is a choice to make rather than a single opposite to jump
// to. The list itself follows the same ARIA combobox/listbox pattern
// SelectField.jsx already uses for every dropdown elsewhere in the app
// (click-outside-to-close, Escape, arrow-key navigation) so this reads as
// the same kind of control, not a one-off.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

import { setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { useTheme } from '../context/ThemeContext';

// 44, not 38 - see ThemeToggle.jsx's own comment: Apple's HIG minimum
// comfortable tap target, with no text label to widen the hit area.
export default function LanguageToggle({ size = 44 }) {
  const { i18n, t } = useTranslation();
  const { prefersReducedMotion } = useTheme();

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const listRef = useRef(null);

  const currentIndex = SUPPORTED_LANGUAGES.findIndex((language) => language.code === i18n.language);
  const current = currentIndex >= 0 ? SUPPORTED_LANGUAGES[currentIndex] : SUPPORTED_LANGUAGES[0];

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
    if (!open || highlightedIndex < 0 || !listRef.current) return;
    const optionElement = listRef.current.children[highlightedIndex];
    if (optionElement) optionElement.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  const selectLanguage = (language) => {
    setLanguage(language.code);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setHighlightedIndex((current) => Math.min(current + 1, SUPPORTED_LANGUAGES.length - 1));
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (open) setHighlightedIndex((current) => Math.max(current - 1, 0));
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open && SUPPORTED_LANGUAGES[highlightedIndex]) {
          selectLanguage(SUPPORTED_LANGUAGES[highlightedIndex]);
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
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
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
          role="listbox"
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
            minWidth: 168,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {SUPPORTED_LANGUAGES.map((language, index) => {
            const isSelected = language.code === current.code;
            const isHighlighted = index === highlightedIndex;

            return (
              <li
                key={language.code}
                role="option"
                aria-selected={isSelected}
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
