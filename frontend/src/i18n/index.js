// EcoTrack/frontend/src/i18n/index.js
// Translation setup - i18next initialised directly with the two bundled
// resource files rather than i18next-http-backend or a CDN fetch, since
// this app's whole translation surface is small enough to ship in the main
// bundle outright; a runtime fetch would only add a network round trip and
// a loading flash for no real benefit at this size.
//
// PHASE 1, STATED HONESTLY
// Only the navbar (present on every page) and the Home page's hero are
// translated so far - see locales/hi.json. Every other page still reads in
// English regardless of the toggle. Extending coverage means adding more
// keys to both locale files and swapping the relevant component's literal
// strings for t('namespace.key') calls - the same pattern Navbar.jsx and
// Home.jsx already use, not a new mechanism.
//
// English is always the fallback: an untranslated key never renders as a
// raw "nav.dashboard" placeholder, it silently shows the English string.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';

const STORAGE_KEY = 'ecotrack-language';

function storedLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes - double-escaping would corrupt punctuation like "—"
});

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
