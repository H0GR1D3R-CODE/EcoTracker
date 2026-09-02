// EcoTrack/frontend/src/i18n/index.js
// Translation setup - i18next initialised directly with bundled resource
// files rather than i18next-http-backend or a CDN fetch, since this app's
// whole translation surface is small enough to ship in the main bundle
// outright; a runtime fetch would only add a network round trip and a
// loading flash for no real benefit at this size.
//
// COVERAGE, STATED HONESTLY
// The navbar, the Home page's hero, both auth pages (Login, Register),
// Dashboard's STATIC chrome (headings, labels, buttons, empty/error states),
// and now Calculator's own static chrome (the page subtitle, the date field,
// the submit button's three states, the data-quality confirmation banner,
// and the result card's static copy) are translated - fully, in every
// language, for the first group; Calculator's own `calculator` namespace so
// far exists in full ONLY in en.json and hi.json (the flagged-priority
// language), not mechanically stamped into the other eight locale files
// with unverified translations - fallbackLng: 'en' below means every other
// language quietly shows the English string for those keys rather than a
// raw "calculator.subtitle" placeholder, which is the same honest fallback
// this file already relies on for any missing key. Extending Calculator's
// own namespace to the rest, and covering the next page, are both the same
// bounded mechanism: add keys to a locale file, swap a literal string for
// t('namespace.key').
//
// TWO THINGS DELIBERATELY STAY ENGLISH EVERYWHERE, NOT JUST ON DASHBOARD:
//   1. Category/sub-type names (formatCategory/formatSubType in
//      utils/formatters.js) - these are plain capitalisation helpers with no
//      locale awareness, called from dozens of files across the app. Making
//      them translatable is a real, bounded next step (7 categories, ~25
//      sub-types) but a structural one - formatCategory is a plain function,
//      not a hook, so it cannot call t() itself without either threading a
//      translate function through every call site or reading i18next's
//      singleton directly. Worth doing as its own pass, not folded into a
//      page-by-page translation pass.
//   2. Dashboard's buildInsights() output and the SDG-13 context paragraph -
//      both interpolate real numbers AND category names into English prose
//      at render time. Translating them properly needs (1) to be solved
//      first, so category names inside a translated sentence do not read as
//      an English word dropped into another language.
// Register.jsx's REGIONS list (Indian state names) is deliberately left
// untranslated too - place names in a region picker are conventionally kept
// as-is, and 20 names × 10 languages was out of scope regardless.
//
// English is always the fallback: an untranslated key never renders as a
// raw "nav.dashboard" placeholder, it silently shows the English string.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import pt from './locales/pt.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import ru from './locales/ru.json';

const STORAGE_KEY = 'ecotrack-language';

// The single source of truth for "which languages exist" - LanguageToggle.jsx
// reads this same list to build its menu, rather than keeping its own copy
// that could quietly drift out of sync with what is actually registered
// below. `name` is the language's own endonym (what a speaker of it calls
// it), not its English name - the convention every major app's language
// picker uses, since a reader looking for their own language scans for how
// it is spelled in itself, not for its English label.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'zh', name: '中文', dir: 'ltr' },
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
];

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));

function storedLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_CODES.has(saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}

// Keeps <html lang="..."> and <html dir="..."> in step with whatever is
// actually on screen. lang is what lets a screen reader switch its speech
// synthesis voice/pronunciation rules correctly instead of reading Hindi or
// Arabic text with English phonetics; dir="rtl" for Arabic is what makes the
// browser lay text out and position the caret right-to-left. Neither of
// these is optional polish - a screen reader with the wrong lang attribute
// mispronounces every single word on the page.
function syncDocumentAttributes(lang) {
  const meta = SUPPORTED_LANGUAGES.find((language) => language.code === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = meta?.dir || 'ltr';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    es: { translation: es },
    fr: { translation: fr },
    ar: { translation: ar },
    zh: { translation: zh },
    pt: { translation: pt },
    de: { translation: de },
    ja: { translation: ja },
    ru: { translation: ru },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes - double-escaping would corrupt punctuation like "—"
});

syncDocumentAttributes(storedLanguage());
i18n.on('languageChanged', syncDocumentAttributes);

export function setLanguage(lang) {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private browsing / storage disabled - the choice just will not
    // survive a reload, same graceful degradation ThemeContext accepts.
  }
}

export default i18n;
