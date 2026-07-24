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
