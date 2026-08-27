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
  // The backend moved from Render to Vercel serverless functions - this
  // comment used to describe Render specifically putting free services to
  // sleep, which is no longer what's actually happening and was stale.
  // Vercel's Python runtime has its own real cold-start cost instead: the
  // whole backend (every route, one bundled function - see backend/vercel.json)
  // has to import firebase-admin's dependency chain (grpc, protobuf,
  // cryptography) and initialise it before ANY request can be answered, even
  // a route that touches no Firebase data at all. Measured directly against
  // the deployed backend: a cold request can take 5-16s; a "warm" one still
  // regularly runs 1-3s, because Vercel's Hobby tier does not keep a Python
  // function warm reliably between requests. This is an architectural cost of
  // one bundled serverless function on a free tier, not something a frontend
  // timeout value fixes - the timeout only decides how long to wait before
  // giving up, so it stays generous.
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
    } else if (status >= 500 && !error.config?.skipErrorToast) {
      // Never crash the app on a server error - show a toast and let the
      // component decide what to render instead. skipErrorToast lets a
      // specific call opt out when its own catch block already shows a more
      // specific message than this generic one - without it, a route like
      // POST /api/admin/invite that fails with a real, useful 502 message
      // ("Resend rejected the request...") shows that AND this generic one
      // stacked on top, which reads as two different errors for one failure.
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

  // Public route - lets Register.jsx show "an account already exists" the
  // moment someone leaves the email field, not just after a full submit.
  checkEmail: (email) => api.post('/api/auth/check-email', { email }).then(unwrap),

  // Every piece of this account's own data, in one JSON response - see
  // backend/routes/auth.py's export_data.
  exportData: () => api.get('/api/auth/export').then(unwrap),

  // Permanently deletes the account and every piece of data tied to it -
  // see backend/routes/auth.py's delete_account for exactly what is
  // removed vs. kept.
  deleteAccount: () => api.delete('/api/auth/account').then(unwrap),

  // Exchanges a Firebase ID token for the user's profile
  login: (idToken) => api.post('/api/auth/login', { idToken }).then(unwrap),

  getProfile: () => api.get('/api/auth/profile').then(unwrap),

  updateProfile: (payload) => api.put('/api/auth/profile', payload).then(unwrap),

  // Public route - tries to send EcoTrack's own branded reset email.
  // Resolves to {sent: false} rather than throwing when that path is simply
  // unavailable (no RESEND_API_KEY on the server); AuthContext.resetPassword()
  // treats that as the cue to fall back to Firebase's own email, not an error.
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }).then(unwrap),

  // Two-step verification - see AuthContext's own comment on how these three
  // fit together with login()'s twoFactorRequired response.
  setTwoFactor: (enabled) => api.put('/api/auth/2fa', { enabled }).then(unwrap),
  resendTwoFactorCode: () => api.post('/api/auth/2fa/resend').then(unwrap),
  verifyTwoFactorCode: (code) => api.post('/api/auth/2fa/verify', { code }).then(unwrap),
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

  // Admin-only - see backend/routes/factors.py's create_factor/update_factor/delete_factor
  create: (payload) => api.post('/api/factors', payload).then(unwrap),
  update: (factorId, payload) => api.put(`/api/factors/${factorId}`, payload).then(unwrap),
  remove: (factorId) => api.delete(`/api/factors/${factorId}`).then(unwrap),
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

  // The Activity Log page's data source - full history, filterable,
  // paginated. params: {category, startDate, endDate, page, pageSize}
  getAllRecords: (params = {}) =>
    api.get('/api/carbon/records/all', { params }).then(unwrap),

  updateRecord: (recordId, payload) =>
    api.put(`/api/carbon/records/${recordId}`, payload).then(unwrap),

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

  // Full profile + every record, goal and report for one user (the drill-down)
  getUserDetail: (userId) => api.get(`/api/admin/users/${userId}`).then(unwrap),

  deleteUser: (userId) => api.delete(`/api/admin/users/${userId}`).then(unwrap),

  getFeedback: () => api.get('/api/admin/feedback').then(unwrap),

  deleteFeedback: (feedbackId) =>
    api.delete(`/api/admin/feedback/${feedbackId}`).then(unwrap),

  // Verified donations only - amounts come back in paise
  getDonations: () => api.get('/api/admin/donations').then(unwrap),

  // Deletes EcoTrack's record of a donation, not the payment itself
  deleteDonation: (donationId) =>
    api.delete(`/api/admin/donations/${donationId}`).then(unwrap),

  // Live status of Firestore, Razorpay, the assistant and the API itself.
  // Returns booleans and the PUBLIC Razorpay key id only - never a secret.
  getSystem: () => api.get('/api/admin/system').then(unwrap),

  // The evaluation-harness data behind the paper's adoption-rate numbers -
  // anonymised, hashed user ids only. Returns {csv, filename, rowCount};
  // the caller builds the download itself (see AdminDashboard.jsx's Research tab).
  getResearchExport: () => api.get('/api/admin/research/export').then(unwrap),

  // The same interventions log, pre-aggregated into adoption rates, impact,
  // and the boomerang-effect variant counts - see backend/routes/admin.py's
  // research_stats() docstring for what this can and cannot claim.
  getResearchStats: () => api.get('/api/admin/research/stats').then(unwrap),

  // Sends the branded admin-invitation email - see routes/admin.py's
  // invite_admin(). Does not itself grant access; that is still a manual
  // Vercel-dashboard step.
  // skipErrorToast: the caller's own form already shows the specific reason
  // (RESEND_API_KEY missing, or Resend's own rejection message) - see
  // AdminDashboard.jsx's invite form.
  inviteAdmin: (email, name) =>
    api.post('/api/admin/invite', { email, name }, { skipErrorToast: true }).then(unwrap),
};

// ---------------------------------------------------------------------------
// ASSISTANT
//
// The Gemini API key lives only on the Flask server. The browser never holds
// it and never calls Google directly - every request below goes to our own
// backend, which verifies the Firebase token before spending anything.
// ---------------------------------------------------------------------------

export const assistantApi = {
  // Called once on load so the UI can hide the assistant entirely when the
  // server has no API key configured
  getStatus: () => api.get('/api/assistant/status').then(unwrap),

  // skipErrorToast on all three Gemini-backed calls below: Assistant.jsx,
  // PublicHelper.jsx and Reports.jsx each already show the specific reason
  // inline (rate-limited, Gemini's own server error, unreachable) - without
  // this, a 5xx from Gemini shows that specific message AND the interceptor's
  // generic "Server error" toast stacked on top for the same one failure.

  // history is [{role: 'user'|'assistant', content: string}]
  chat: (message, history = []) =>
    api.post('/api/assistant/chat', { message, history }, { skipErrorToast: true }).then(unwrap),

  summarise: (periodStart, periodEnd) =>
    api
      .post('/api/assistant/summary', { periodStart, periodEnd }, { skipErrorToast: true })
      .then(unwrap),

  // A single proposed reduction goal, grounded in real data - see
  // routes/assistant.py's POST /api/assistant/plan. Shaped to map straight
  // onto goalsApi.create(): {category, baselineEmission,
  // targetReductionPercent, targetDate}.
  getPlan: () => api.post('/api/assistant/plan', {}, { skipErrorToast: true }).then(unwrap),

  // The signed-out counterparts, called by PublicHelper.jsx. No auth token
  // exists to attach for these - the request interceptor above only adds one
  // when auth.currentUser is set, so these already work unauthenticated with
  // no special handling needed here.
  getPublicStatus: () => api.get('/api/assistant/public-status').then(unwrap),
  publicChat: (message, history = [], recaptchaToken = null) =>
    api
      .post(
        '/api/assistant/public-chat',
        { message, history, recaptchaToken },
        { skipErrorToast: true }
      )
      .then(unwrap),
};

// ---------------------------------------------------------------------------
// FEEDBACK (public - a visitor can send feedback without an account)
// ---------------------------------------------------------------------------

export const feedbackApi = {
  // payload: { name?, email?, message, rating? }
  submit: (payload) => api.post('/api/feedback', payload).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// PAYMENTS (public - a visitor can donate without an account)
//
// The Razorpay KEY_SECRET lives only on the Flask server. The browser never
// holds it: it asks our backend to open an order, hands the result to Razorpay
// Checkout, then sends the signed confirmation BACK to our backend to be
// verified. A donation only counts once that server-side check passes.
// ---------------------------------------------------------------------------

export const paymentsApi = {
  // payload: { amount: <paise int>, currency?: 'INR', receipt?: string }
  // returns: { order_id, amount, currency, key }  (key = the public key_id)
  createOrder: (payload) => api.post('/api/create-order', payload).then(unwrap),

  // payload: the three razorpay_* fields from Checkout, plus optional
  // amount/currency/name/email recorded alongside the verified donation.
  // Returns the whole envelope so the caller can show the server's message.
  verifyPayment: (payload) => api.post('/api/verify-payment', payload).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// INSIGHTS (forecast, counterfactual swaps, the what-if sandbox, cohort)
//
// See backend/insights_engine.py for the maths behind every one of these.
// simulate() is the AUTHORITATIVE recompute behind the sandbox sliders -
// frontend/src/utils/scenarioMath.js mirrors the same arithmetic for an
// instant client-side preview while dragging, exactly the way
// emissionHelpers.js mirrors the Calculator's formula.
// ---------------------------------------------------------------------------

export const insightsApi = {
  getForecast: () => api.get('/api/insights/forecast').then(unwrap),

  getSwaps: (month) =>
    api.get('/api/insights/swaps', { params: month ? { month } : {} }).then(unwrap),

  // sliders: {swapId: fraction 0-1}
  simulate: (sliders, month) =>
    api.post('/api/insights/simulate', { sliders, month }).then(unwrap),

  getCohort: () => api.get('/api/insights/cohort').then(unwrap),

  // Separates "the weather changed" from "behaviour changed" in electricity.
  // See backend/weather_engine.py's module docstring for the full reasoning.
  getWeather: (month) =>
    api.get('/api/insights/weather', { params: month ? { month } : {} }).then(unwrap),

  // Time-of-day grid carbon intensity - see backend/grid_engine.py.
  getGrid: () => api.get('/api/insights/grid').then(unwrap),
};

// ---------------------------------------------------------------------------
// TEMPLATES (quick-log chips + habit-mined suggestions)
// ---------------------------------------------------------------------------

export const templatesApi = {
  getAll: () => api.get('/api/templates').then(unwrap),

  // {label, category, subType, quantity, unit, weekdays: number[], source?}
  create: (payload) => api.post('/api/templates', payload).then(unwrap),

  remove: (templateId) => api.delete(`/api/templates/${templateId}`).then(unwrap),

  // One-tap log from a saved template - goes through the same server-side
  // formula as the Calculator (see backend/routes/carbon.py:save_calculated_record)
  logOne: (templateId, recordedDate) =>
    api.post(`/api/templates/${templateId}/log`, recordedDate ? { recordedDate } : {}).then(unwrap),

  // Habit-mined candidates the user has not yet turned into a template
  getSuggestions: () => api.get('/api/templates/suggestions').then(unwrap),
};

// ---------------------------------------------------------------------------
// ENGAGEMENT (the evaluation-harness intervention log, streaks, challenges)
// ---------------------------------------------------------------------------

export const engagementApi = {
  // Called by useIntervention.js when a client-rendered nudge is shown -
  // server-generated recommendations (forecast/swaps/cohort) log themselves,
  // see insightsApi above, so this is only for things with no API call of
  // their own to piggyback the log onto.
  logIntervention: (payload) => api.post('/api/engagement/interventions', payload).then(unwrap),

  updateIntervention: (interventionId, payload) =>
    api.patch(`/api/engagement/interventions/${interventionId}`, payload).then(unwrap),

  getStreak: () => api.get('/api/engagement/streak').then(unwrap),

  getChallenges: () => api.get('/api/engagement/challenges').then(unwrap),

  claimChallenge: (challengeId) =>
    api.post(`/api/engagement/challenges/${challengeId}/claim`).then(unwrap),

  // Points + tree-growth state - see backend/routes/engagement.py's
  // _tree_progress and components/GrowingTree.jsx.
  getRewards: () => api.get('/api/engagement/rewards').then(unwrap),
};

// ---------------------------------------------------------------------------
// WRAPPED (the shareable period recap - see routes/wrapped.py)
// ---------------------------------------------------------------------------

export const wrappedApi = {
  // period: 'month' | 'year'
  get: (period, year, month) =>
    api.get('/api/wrapped', { params: { period, year, month } }).then(unwrap),
};

// ---------------------------------------------------------------------------
// COMMUNITY (public, aggregate-only - see routes/community.py)
// ---------------------------------------------------------------------------

export const communityApi = {
  getImpact: () => api.get('/api/community/impact').then(unwrap),
  // Public, opt-in only - see routes/community.py's get_leaderboard.
  getLeaderboard: () => api.get('/api/community/leaderboard').then(unwrap),
};

// ---------------------------------------------------------------------------
// LEARN (climate literacy quiz progress - see routes/learn.py)
// ---------------------------------------------------------------------------

export const learnApi = {
  getProgress: () => api.get('/api/learn/progress').then(unwrap),
  completeModule: (module) =>
    api.post('/api/learn/complete-module', { module }).then(unwrap),
};

// ---------------------------------------------------------------------------
// ACHIEVEMENTS (badge unlock rollup - see routes/achievements.py)
// ---------------------------------------------------------------------------

export const achievementsApi = {
  getAll: () => api.get('/api/achievements').then(unwrap),
};

// ---------------------------------------------------------------------------
// ACTIVITY REMINDERS (see routes/reminders.py)
// ---------------------------------------------------------------------------

export const remindersApi = {
  getAll: () => api.get('/api/reminders').then(unwrap),
  create: (payload) => api.post('/api/reminders', payload).then(unwrap),
  remove: (reminderId) => api.delete(`/api/reminders/${reminderId}`).then(unwrap),
};

// ---------------------------------------------------------------------------
// HOUSEHOLD (group mode + leaderboard - see routes/household.py)
// ---------------------------------------------------------------------------

export const householdApi = {
  get: () => api.get('/api/household').then(unwrap),
  create: (name) => api.post('/api/household', { name }).then(unwrap),
  join: (inviteCode) => api.post('/api/household/join', { inviteCode }).then(unwrap),
  leave: () => api.post('/api/household/leave').then(unwrap),
  removeMember: (memberUid) =>
    api.delete(`/api/household/members/${memberUid}`).then(unwrap),

  // Real logged entries from every member, merged - see routes/household.py's
  // GET /activity.
  getActivity: () => api.get('/api/household/activity').then(unwrap),
  toggleCheer: (recordId) =>
    api.post(`/api/household/activity/${recordId}/cheer`).then(unwrap),

  // The shared, combined-emissions weekly challenge.
  getChallenge: () => api.get('/api/household/challenge').then(unwrap),
  claimChallenge: (challengeId) =>
    api.post(`/api/household/challenge/${challengeId}/claim`).then(unwrap),
};

// ---------------------------------------------------------------------------
// INGEST (Gemini bill/receipt photo extraction - see routes/ingest.py)
//
// Nothing here saves a record. The response is a proposed extraction only;
// the caller confirms it and then calls carbonApi.calculate() itself, same
// as any other Calculator entry.
// ---------------------------------------------------------------------------

export const ingestApi = {
  // {imageBase64: string (no "data:" prefix), mimeType: 'image/jpeg' | 'image/png' | 'image/webp'}
  scanBill: (payload) => api.post('/api/ingest/bill', payload).then(unwrap),
};

// ---------------------------------------------------------------------------
// VOICE (speech-to-log extraction - see routes/voice.py)
// ---------------------------------------------------------------------------

export const voiceApi = {
  getStatus: () => api.get('/api/voice/status').then(unwrap),
  parse: (transcript) =>
    api.post('/api/voice/parse', { transcript }, { skipErrorToast: true }).then(unwrap),
};

// ---------------------------------------------------------------------------
// NOTIFICATIONS (FCM push token registration - see utils/pushNotifications.js)
// ---------------------------------------------------------------------------

export const notificationsApi = {
  registerToken: (token) => api.post('/api/notifications/register-token', { token }).then(unwrap),

  removeToken: (token) =>
    api.delete('/api/notifications/register-token', { data: { token } }).then(unwrap),
};

// ---------------------------------------------------------------------------
// HEALTH (public - used to check whether the backend is awake)
// ---------------------------------------------------------------------------

export const healthApi = {
  check: () => api.get('/api/health').then((response) => response.data),
};

export default api;
