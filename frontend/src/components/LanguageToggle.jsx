// EcoTrack/frontend/src/components/LanguageToggle.jsx
// English/Hindi switch - see src/i18n/index.js for what is and is not
// translated yet. Same circular-button shape as ThemeToggle.jsx, sitting
// right beside it, so the two toggles read as one family of controls.

import { useTranslation } from 'react-i18next';

import { setLanguage } from '../i18n';
import { useTheme } from '../context/ThemeContext';

// 44, not 38 - see ThemeToggle.jsx's own comment: Apple's HIG minimum
// comfortable tap target, with no text label to widen the hit area.
export default function LanguageToggle({ size = 44 }) {
  const { i18n, t } = useTranslation();
  const { prefersReducedMotion } = useTheme();
  const isHindi = i18n.language === 'hi';

  return (
    <button
      type="button"
      onClick={() => setLanguage(isHindi ? 'en' : 'hi')}
      aria-label={isHindi ? t('language.switchToEnglish') : t('language.switchToHindi')}
      title={isHindi ? t('language.switchToEnglish') : t('language.switchToHindi')}
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
        fontSize: size * 0.32,
        fontWeight: 700,
        letterSpacing: '0.02em',
        transition: prefersReducedMotion ? 'none' : 'color var(--eco-transition), border-color var(--eco-transition)',
      }}
    >
      {/* The button shows the language it would SWITCH TO, the same
          convention ThemeToggle's sun/moon already follows (a dark-mode
          user sees a sun, the thing tapping gives them). */}
      {isHindi ? 'EN' : 'हि'}
    </button>
  );
}
