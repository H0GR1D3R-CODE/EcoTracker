// EcoTrack/frontend/src/main.jsx
// The entry point. Vite loads this file first, and it starts React.
//
// THE ORDER OF THE IMPORTS MATTERS
// Bootstrap's stylesheet is imported before index.css so that our own theme
// rules come later in the final CSS file and therefore win any conflict.
//
// THE ORDER OF THE PROVIDERS MATTERS TOO
//   BrowserRouter   - must be outermost, so anything inside can navigate
//     ThemeProvider - AuthProvider's children may read the theme
//       AuthProvider
//         App

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Bootstrap 5 grid and utility classes (container, row, col, d-none, etc.)
import 'bootstrap/dist/css/bootstrap.min.css';
// Our theme - loaded second so it overrides Bootstrap where they disagree
import './index.css';

import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ToastProvider from './components/ToastProvider';

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode runs some code twice in development to surface bugs early.
  // It has no effect on the production build.
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
          {/* Rendered outside App so toasts survive page transitions */}
          <ToastProvider />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Registered after render, not before - the service worker is what makes
// the app shell (and, via src/utils/offlineOutbox.js, logging a new entry)
// work with no connection, but it should never delay or block the first
// paint on the connection the visitor already has right now. Skipped in dev
// (import.meta.env.DEV) so editing public/sw.js does not require a hard
// refresh to see the change - Vite's own dev server already does its own,
// better job of instant reloads.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline-first is a progressive enhancement - a registration failure
      // (an unusual browser, a corporate proxy) should never break the app
      // that already works without it.
    });
  });
}
