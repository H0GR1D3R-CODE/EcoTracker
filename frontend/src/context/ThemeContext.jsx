// EcoTrack/frontend/src/context/ThemeContext.jsx
// Holds the dark/light theme choice and the user's motion preference, and
// makes both available to every component in the app.
//
// Dark is the default. The choice is saved to localStorage so it survives a
// refresh, and index.html reads that value before the first paint so there is
// no flash of the wrong theme while React starts.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'ecotrack-theme';

/**
 * Read the saved theme, falling back to dark.
 * Wrapped in try/catch because localStorage throws in some private browsing modes.
 */
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore and use the default below
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // Whether the user has asked their operating system to reduce animation.
  // Every animated component checks this before moving anything - it is an
  // accessibility requirement, not a nice-to-have.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  // Apply the theme by setting data-theme on <html>. Every CSS variable in
  // index.css keys off that attribute, so one line restyles the whole app.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    // Keep the mobile browser chrome in step with the page background
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', theme === 'dark' ? '#0a0a0f' : '#f4f6f9');
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Saving failed - the theme still works for this session
    }
  }, [theme]);

  // Watch for the user changing their motion setting while the app is open
  useEffect(() => {
    if (!window.matchMedia) return undefined;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setPrefersReducedMotion(event.matches);

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
    }),
    [theme, prefersReducedMotion]
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
