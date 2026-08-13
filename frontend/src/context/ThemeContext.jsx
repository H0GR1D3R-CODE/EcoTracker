// EcoTrack/frontend/src/context/ThemeContext.jsx
// Holds the dark/light theme choice and the user's motion preference, and
// makes both available to every component in the app.
//
// Light is the default. The choice is saved to localStorage so it survives a
// refresh, and index.html reads that value before the first paint so there is
// no flash of the wrong theme while React starts.
//
// Three places have to agree on the default or the page visibly flips theme
// during load: the data-theme attribute on <html>, the inline script in
// index.html, and getInitialTheme below.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';

import { isNativeApp } from '../utils/platform';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'ecotrack-theme';
const MOTION_STORAGE_KEY = 'ecotrack-reduce-motion';

/**
 * Read the saved theme, falling back to light.
 * Wrapped in try/catch because localStorage throws in some private browsing modes.
 */
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore and use the default below
  }
  return 'light';
}

/**
 * Read the saved manual reduce-motion override, defaulting to off.
 * Wrapped in try/catch for the same reason getInitialTheme is.
 */
function getInitialManualReduceMotion() {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // Whether the operating system asks for reduced animation. This alone used
  // to be the whole story, which left reduced motion unreachable to anyone
  // who did not know their OS had a setting for it - a real barrier, since
  // that setting is buried a few menus deep on every platform.
  const [osReducedMotion, setOsReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  // A manual override a person can set from Profile, independent of the OS.
  // It can only ever ADD reduced motion, never remove it - there is no
  // override for "my OS says reduce motion, but I want it anyway", because
  // overriding someone's own accessibility setting against their OS is not
  // this app's call to make.
  const [manualReduceMotion, setManualReduceMotion] = useState(getInitialManualReduceMotion);

  const prefersReducedMotion = osReducedMotion || manualReduceMotion;

  const setReduceMotionPreference = (value) => {
    setManualReduceMotion(value);
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, String(value));
    } catch {
      // Saving failed - the preference still holds for this session
    }
  };

  // Apply the theme by setting data-theme on <html>. Every CSS variable in
  // index.css keys off that attribute, so one line restyles the whole app.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    // Keep the mobile browser chrome in step with the page background
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      // These must match --eco-bg for each theme in index.css. They were
      // #0a0a0f / #f4f6f9, neither of which the app has used for some time,
      // so the phone's chrome sat a shade off the page it framed.
      themeColorMeta.setAttribute('content', theme === 'dark' ? '#0c100b' : '#efede4');
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Saving failed - the theme still works for this session
    }
  }, [theme]);

  // The native-app equivalent of the theme-color meta tag above. Without
  // this, the OS status bar was set once in capacitor.config.json (a stale
  // colour, and a style that never changes) and never touched again - so
  // switching to dark theme inside the app left the status bar's dark-text
  // style sitting over a now near-black background, unreadable. The plugin
  // is a no-op on web (isNativeApp() guards it), so this is safe to run
  // unconditionally on every theme change.
  useEffect(() => {
    if (!isNativeApp()) return;

    const backgroundColor = theme === 'dark' ? '#0c100b' : '#efede4';
    // Capacitor's naming mirrors iOS's own UIStatusBarStyle: Dark = dark
    // text/icons, for a light background; Light = light text/icons, for a
    // dark background.
    const style = theme === 'dark' ? Style.Light : Style.Dark;

    StatusBar.setBackgroundColor({ color: backgroundColor }).catch(() => {
      // Some Android versions/edge-to-edge configs reject this - harmless,
      // the style call below still fixes icon legibility either way.
    });
    StatusBar.setStyle({ style }).catch(() => {});
  }, [theme]);

  // Watch for the user changing their OS motion setting while the app is open
  useEffect(() => {
    if (!window.matchMedia) return undefined;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setOsReducedMotion(event.matches);

    query.addEventListener('change', handleChange);
    // Removing the listener when the component unmounts prevents a memory leak
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  // useMemo stops this object being rebuilt on every render, which would make
  // every component that uses the theme re-render unnecessarily
  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      toggleTheme,
      prefersReducedMotion,
      // Exposed separately from the combined flag above so Profile can show
      // and control ONLY the part it is allowed to change - it must never
      // imply it can turn off a system-level accessibility setting.
      osReducedMotion,
      manualReduceMotion,
      setReduceMotionPreference,
    }),
    [theme, prefersReducedMotion, osReducedMotion, manualReduceMotion]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Use the theme anywhere:  const { isDark, toggleTheme } = useTheme();
 */
export function useTheme() {
  const context = useContext(ThemeContext);

  // A clear error beats "cannot read property of null" if someone forgets
  // to wrap the app in <ThemeProvider>
  if (!context) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }

  return context;
}

export default ThemeContext;
