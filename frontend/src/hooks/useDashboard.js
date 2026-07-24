// EcoTrack/frontend/src/hooks/useDashboard.js
// Fetches everything the dashboard needs and keeps it fresh.
//
// TWO KINDS OF LOADING, AND WHY THE DIFFERENCE MATTERS
//   loading    - true only on the very first fetch. Skeletons are shown.
//   refreshing - true on the silent 60-second refresh. Nothing is shown.
//
// If the background refresh also flipped `loading`, the whole dashboard would
// collapse into skeletons every minute while the user was reading it. The
// numbers should just quietly become more correct.

import { useCallback, useEffect, useRef, useState } from 'react';

import { dashboardApi, getErrorMessage } from '../utils/api';

// How often the dashboard silently re-fetches, in milliseconds
const REFRESH_INTERVAL_MS = 60000;

export function useDashboard() {
  const [summary, setSummary] = useState(null);
  const [monthlyChart, setMonthlyChart] = useState(null);
  const [categoryChart, setCategoryChart] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // React can try to update state after the component has been removed from the
  // screen - for example if the user navigates away mid-request. This ref lets
  // the fetch check whether that has happened before calling setState.
  const isMountedRef = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Promise.all runs all three requests at once rather than one after
      // another. Three sequential requests to a sleeping Render server would
      // take three times as long.
      const [summaryData, monthlyData, categoryData] = await Promise.all([
        dashboardApi.getSummary(),
        dashboardApi.getMonthlyChart(6),
        dashboardApi.getCategoryChart(),
      ]);

      if (!isMountedRef.current) return;

      setSummary(summaryData);
      setMonthlyChart(monthlyData);
      setCategoryChart(categoryData);
      setError(null);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (!isMountedRef.current) return;

      // A failed silent refresh is deliberately not surfaced. The user is
      // reading data that is at most a minute old; replacing it with an error
      // screen because one background poll failed would be worse than useless.
      if (!silent) {
        setError(getErrorMessage(requestError, 'Could not load your dashboard.'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // First load
  useEffect(() => {
    isMountedRef.current = true;
    load();

    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  // The silent 60-second refresh
  useEffect(() => {
    const timer = setInterval(() => {
      // Skip the poll when the tab is in the background. There is no point
      // spending Firestore reads refreshing a dashboard nobody is looking at,
      // and it means the data is fresh the moment the user returns anyway.
      if (document.visibilityState === 'visible') {
        load({ silent: true });
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [load]);

  // Refresh immediately when the user comes back to the tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        load({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [load]);

  return {
    summary,
    monthlyChart,
    categoryChart,
    loading,
    refreshing,
    error,
    lastUpdated,
    // Exposed so a "try again" button can force a visible reload
    reload: () => load({ silent: false }),
  };
}

export default useDashboard;
