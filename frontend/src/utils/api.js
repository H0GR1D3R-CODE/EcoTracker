// EcoTrack/frontend/src/utils/api.js
// The single place where this app talks to the Flask backend.
//
// No component anywhere should call fetch() or axios directly. Routing every
// request through this file means the Firebase token is attached automatically,
// errors are handled the same way everywhere, and the loading bar at the top of
// the page always starts and stops correctly.
//
// HOW A REQUEST FLOWS
//   component  ->  carbonApi.calculate(...)
//               ->  request interceptor  (adds the token, starts the progress bar)
//               ->  Flask
//               ->  response interceptor (stops the bar, handles 401/403/500)
//               ->  back to the component

import axios from 'axios';
import toast from 'react-hot-toast';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

import { auth } from '../firebase';

// The spinner is hidden by CSS; only the top bar shows
NProgress.configure({ showSpinner: false, trickleSpeed: 120, minimum: 0.15 });

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  // Render puts free services to sleep, so the first request after a quiet
  // period can take 30+ seconds while the server wakes up
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

// Counts requests in flight. Without it, two overlapping requests would let the
// first one to finish switch the progress bar off while the second is still running.
let activeRequests = 0;

function startLoading() {
  activeRequests += 1;
  if (activeRequests === 1) NProgress.start();
}

function stopLoading() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) NProgress.done();
}

// ---------------------------------------------------------------------------
// REQUEST INTERCEPTOR - runs before every request leaves the browser
// ---------------------------------------------------------------------------

api.interceptors.request.use(
  async (config) => {
    startLoading();

    const user = auth.currentUser;
    if (user) {
      // getIdToken() returns the cached token, and silently fetches a fresh one
      // if it is close to expiring. Firebase tokens last one hour.
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    stopLoading();
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// RESPONSE INTERCEPTOR - runs on every reply, successful or not
// ---------------------------------------------------------------------------

api.interceptors.response.use(
  (response) => {
    stopLoading();
    return response;
  },
  async (error) => {
    stopLoading();

    // No response at all means the request never reached the server
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        toast.error('The server took too long to respond. Please try again.');
      } else {
        toast.error('Cannot reach the server. Check your internet connection.');
      }
      return Promise.reject(error);
    }

    const { status, data } = error.response;
    const message = data?.error || 'Something went wrong.';

    if (status === 401) {
      // The token is missing, expired or invalid. Sign out locally so the app
      // stops believing the user is logged in, then send them to the login page.
      const onAuthPage = ['/login', '/register'].includes(window.location.pathname);

      if (!onAuthPage) {
        toast.error('Your session has expired. Please log in again.');
        try {
          await auth.signOut();
        } catch {
          // Signing out can fail offline; the redirect below still protects the UI
        }
        // A full page load is used deliberately here: it clears every piece of
        // React state, so no stale data from the old session can linger.
        window.location.assign('/login');
      }
    } else if (status === 403) {
      // Logged in, but not allowed. Usually a non-admin opening an admin page.
      toast.error(message);
      if (window.location.pathname.startsWith('/admin')) {
        window.location.assign('/dashboard');
      }
    } else if (status >= 500) {
      // Never crash the app on a server error - show a toast and let the
      // component decide what to render instead
      toast.error('Server error. Please try again in a moment.');
    }
    // 400 and 404 are deliberately NOT toasted here. They are usually validation
    // problems that belong next to the specific form field that caused them,
    // so the calling component handles those itself.

    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Pull the payload out of the backend's {success, data, message} envelope.
 */
function unwrap(response) {
  return response.data?.data ?? response.data;
}

/**
 * Turn any thrown error into a plain message string a component can display.
 * Use this inside catch blocks instead of digging through error.response.
 */
export function getErrorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.error || error?.message || fallback;
}

/**
 * The backend's short machine-readable code, e.g. "email_exists".
 * Checking this is safer than comparing English error text.
 */
export function getErrorCode(error) {
  return error?.response?.data?.code || null;
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

export const authApi = {
  // Public route - creates the Firebase Auth account and the Firestore profile
  register: (payload) => api.post('/api/auth/register', payload).then(unwrap),

  // Exchanges a Firebase ID token for the user's profile
  login: (idToken) => api.post('/api/auth/login', { idToken }).then(unwrap),

  getProfile: () => api.get('/api/auth/profile').then(unwrap),

  updateProfile: (payload) => api.put('/api/auth/profile', payload).then(unwrap),
};

// ---------------------------------------------------------------------------
// EMISSION FACTORS (public - no login needed)
// ---------------------------------------------------------------------------

export const factorsApi = {
  getAll: () => api.get('/api/factors').then(unwrap),

  getByCategory: (category) =>
    api.get('/api/factors', { params: { category } }).then(unwrap),

  getOne: (category, subType) =>
    api.get(`/api/factors/${category}/${subType}`).then(unwrap),
};

// ---------------------------------------------------------------------------
// CARBON RECORDS
// ---------------------------------------------------------------------------

export const carbonApi = {
  // {category, subType, quantity, unit, recordedDate}
  calculate: (payload) => api.post('/api/carbon/calculate', payload).then(unwrap),

  // params is {month: "2026-07"} or {year: "2026"}
  getRecords: (params = {}) =>
    api.get('/api/carbon/records', { params }).then(unwrap),

  deleteRecord: (recordId) =>
    api.delete(`/api/carbon/records/${recordId}`).then(unwrap),
};

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------

export const dashboardApi = {
  getSummary: () => api.get('/api/dashboard/summary').then(unwrap),

  getMonthlyChart: (months = 6) =>
    api.get('/api/dashboard/chart/monthly', { params: { months } }).then(unwrap),

  getCategoryChart: (month) =>
    api.get('/api/dashboard/chart/category', { params: month ? { month } : {} }).then(unwrap),
};

// ---------------------------------------------------------------------------
// GOALS
// ---------------------------------------------------------------------------

export const goalsApi = {
  // {category, baselineEmission, targetReductionPercent, targetDate}
  create: (payload) => api.post('/api/goals', payload).then(unwrap),

  getAll: (status) =>
    api.get('/api/goals', { params: status ? { status } : {} }).then(unwrap),

  updateStatus: (goalId, status) =>
    api.put(`/api/goals/${goalId}`, { status }).then(unwrap),

  remove: (goalId) => api.delete(`/api/goals/${goalId}`).then(unwrap),
};

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------

export const reportsApi = {
  // {reportType, periodStart, periodEnd}
  generate: (payload) => api.post('/api/reports/generate', payload).then(unwrap),

  getAll: () => api.get('/api/reports').then(unwrap),

  getOne: (reportId) => api.get(`/api/reports/${reportId}`).then(unwrap),

  remove: (reportId) => api.delete(`/api/reports/${reportId}`).then(unwrap),
};

// ---------------------------------------------------------------------------
// ADMIN (every route here returns 403 unless the user is in the admins collection)
// ---------------------------------------------------------------------------

export const adminApi = {
  getUsers: (search) =>
    api.get('/api/admin/users', { params: search ? { search } : {} }).then(unwrap),

  getStats: () => api.get('/api/admin/stats').then(unwrap),

  deleteUser: (userId) => api.delete(`/api/admin/users/${userId}`).then(unwrap),
};

// ---------------------------------------------------------------------------
// ASSISTANT
//
// The Anthropic API key lives only on the Flask server. The browser never
// holds it and never calls Anthropic directly - every request below goes to
// our own backend, which verifies the Firebase token before spending anything.
// ---------------------------------------------------------------------------

export const assistantApi = {
  // Called once on load so the UI can hide the assistant entirely when the
  // server has no API key configured
  getStatus: () => api.get('/api/assistant/status').then(unwrap),

  // history is [{role: 'user'|'assistant', content: string}]
  chat: (message, history = []) =>
    api.post('/api/assistant/chat', { message, history }).then(unwrap),

  summarise: (periodStart, periodEnd) =>
    api.post('/api/assistant/summary', { periodStart, periodEnd }).then(unwrap),
};

// ---------------------------------------------------------------------------
// HEALTH (public - used to check whether the backend is awake)
// ---------------------------------------------------------------------------

export const healthApi = {
  check: () => api.get('/api/health').then((response) => response.data),
};

export default api;
