// EcoTrack/frontend/src/components/EmissionChart.jsx
// Every Chart.js chart in the app is created here, so they all share one look.
//
// WHY A WRAPPER RATHER THAN CHARTS INSIDE EACH PAGE
// Chart.js needs a lot of configuration to stop looking like a default chart:
// grid colours, tick colours, tooltip styling, animation easing. Doing that in
// each page would mean four copies of the same forty lines, and they would
// drift apart the first time one got tweaked.
//
// Chart.js also has to be told which parts of itself to load. That registration
// happens once, at the bottom of the imports, and applies app-wide.

import { useMemo } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

import { useTheme } from '../context/ThemeContext';

// Chart.js v4 ships nothing by default - each piece must be registered.
// Filler is what makes the shaded area under a line chart possible.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

/**
 * Read a CSS custom property at runtime.
 * Chart.js draws onto a canvas, and a canvas cannot understand "var(--eco-primary)"
 * the way normal CSS can - it needs a real colour value like "#00ff87".
 */
function readCssVariable(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Resolve a colour that might be a raw `var(--x)` reference into the actual
 * value the browser has computed for it.
 *
 * CATEGORY_META's colours (utils/emissionHelpers.js) are `'var(--cat-transport)'`
 * strings rather than hexes, precisely so a plain DOM style like
 * `color: meta.color` swaps themes for free. That works everywhere EXCEPT a
 * canvas: Chart.js hands whatever string it is given straight to
 * `ctx.fillStyle`, and the 2D canvas API has no idea what a CSS custom
 * property is. An unresolved `var(...)` is an invalid fillStyle, and an
 * invalid fillStyle silently becomes opaque black - which is exactly why the
 * category doughnut rendered as one solid black disc instead of coloured
 * segments. Every consumer of CATEGORY_META colours inside a Chart.js dataset
 * has to run its colours through this first.
 */
function resolveColor(value, fallback = '#8888aa') {
  if (typeof value !== 'string') return value;
  const match = value.match(/^var\((--[\w-]+)\)$/);
  if (!match) return value; // already a literal colour (hex, rgb, etc.)
  return readCssVariable(match[1], fallback);
}

/**
 * Build the vertical gradient that fades beneath a line.
 *
 * This has to be a function rather than a fixed colour because the gradient
 * needs the canvas's height, and that does not exist until Chart.js has
 * measured the chart area. On the very first paint chartArea is undefined,
 * which is why the guard below matters - without it the chart throws.
 */
function makeAreaGradient(context, colour) {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return 'transparent';

  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  gradient.addColorStop(0, `${colour}00`); // fully transparent at the bottom
  gradient.addColorStop(0.55, `${colour}33`);
  gradient.addColorStop(1, `color-mix(in srgb, ${colour} 40%, transparent)`); // ~40% opaque at the top
  return gradient;
}

/**
 * Shared options every chart starts from.
 */
function useBaseOptions() {
  const { theme, prefersReducedMotion } = useTheme();

  // Recalculated whenever the theme changes, so charts restyle on the toggle
  return useMemo(() => {
    const textMuted = readCssVariable('--eco-text-muted', '#93a58c');
    const cardColour = readCssVariable('--eco-card', '#171e14');
    const textColour = readCssVariable('--eco-text', '#edf1e6');
    const gridColour =
      theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,15,0.07)';

    return {
      responsive: true,
      maintainAspectRatio: false, // lets the parent div control the height
      // The spec asks for 1000ms easeInOutQuart. Users who asked for reduced
      // motion get the finished chart immediately instead.
      animation: prefersReducedMotion
        ? false
        : { duration: 1000, easing: 'easeInOutQuart' },
      interaction: {
        // "index" highlights every dataset at that x position at once, which is
        // what you want when comparing this month against last month
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false }, // custom legends are rendered in JSX instead
        tooltip: {
          backgroundColor: cardColour,
          titleColor: textColour,
          bodyColor: textMuted,
          borderColor: gridColour,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
          boxPadding: 4,
          titleFont: { family: "'Bricolage Grotesque', system-ui, sans-serif", size: 13, weight: '600' },
          bodyFont: { family: 'Inter, sans-serif', size: 12 },
          callbacks: {
            // Without this the tooltip just shows a bare number
            label: (item) => ` ${item.dataset.label}: ${item.parsed.y ?? item.parsed} kg CO₂`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: textMuted, font: { family: 'Inter, sans-serif', size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColour, drawBorder: false },
          ticks: {
            color: textMuted,
            font: { family: 'Inter, sans-serif', size: 11 },
            // Keeps the axis readable when totals run into the thousands
            callback: (value) => (value >= 1000 ? `${value / 1000}k` : value),
          },
        },
      },
    };
  }, [theme, prefersReducedMotion]);
}

// ---------------------------------------------------------------------------
// LINE CHART - six months of totals, with the gradient fill underneath
// ---------------------------------------------------------------------------

export function TrendLineChart({ labels = [], data = [], height = 300 }) {
  const baseOptions = useBaseOptions();
  const { theme } = useTheme();

  const chartData = useMemo(() => {
    const primary = readCssVariable('--eco-primary', '#4fbe80');

    return {
      labels,
      datasets: [
        {
          label: 'Emissions',
          data,
          borderColor: primary,
          borderWidth: 2.5,
          // The function form is what allows a gradient rather than a flat colour
          backgroundColor: (context) => makeAreaGradient(context, primary),
          fill: true,
          // A little tension turns the straight segments into a smooth curve
          tension: 0.38,
          pointBackgroundColor: primary,
          pointBorderColor: readCssVariable('--eco-bg', '#0b0f0a'),
          pointBorderWidth: 2,
          pointRadius: 4,
          // Points grow on hover so it is obvious which one the tooltip means
          pointHoverRadius: 7,
          pointHoverBorderWidth: 3,
        },
      ],
    };
  }, [labels, data, theme]);

  return (
    <div style={{ height }}>
      <Line data={chartData} options={baseOptions} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOUGHNUT CHART - which categories the footprint is made of
// ---------------------------------------------------------------------------

export function CategoryDoughnutChart({ labels = [], data = [], colors = [], height = 300 }) {
  const { theme, prefersReducedMotion } = useTheme();

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data,
          // Resolved, not passed straight through - see resolveColor's own
          // comment for why an unresolved var(--cat-x) rendered as black.
          backgroundColor: colors.map((color) => resolveColor(color)),
          // A border in the page background colour separates the segments
          borderColor: readCssVariable('--eco-bg', '#0b0f0a'),
          borderWidth: 3,
          hoverOffset: 10, // the hovered slice pulls out slightly
          hoverBorderColor: readCssVariable('--eco-text', '#edf1e6'),
        },
      ],
    }),
    // theme is a dependency even though it is never read directly: it is what
    // changes while colors (an array of var() strings) stays referentially
    // identical, and resolveColor's output depends on which theme is active
    [labels, data, colors, theme]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // 62% leaves a generous hole in the middle - a thin ring reads as more
      // modern than a solid pie, and the space is useful
      cutout: '62%',
      animation: prefersReducedMotion
        ? false
        : { duration: 1000, easing: 'easeInOutQuart', animateRotate: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: readCssVariable('--eco-card', '#171e14'),
          titleColor: readCssVariable('--eco-text', '#edf1e6'),
          bodyColor: readCssVariable('--eco-text-muted', '#93a58c'),
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (item) => {
              // Show the share as well as the number - "22 kg" means little on
              // its own, "22 kg (34%)" tells you where to focus
              const total = item.dataset.data.reduce((sum, value) => sum + value, 0);
              const percent = total > 0 ? ((item.parsed / total) * 100).toFixed(1) : 0;
              return ` ${item.label}: ${item.parsed} kg CO₂ (${percent}%)`;
            },
          },
        },
      },
    }),
    [theme, prefersReducedMotion]
  );

  return (
    <div style={{ height }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BAR CHART - this month against last month, category by category
// ---------------------------------------------------------------------------

export function ComparisonBarChart({
  labels = [],
  currentData = [],
  previousData = [],
  height = 320,
}) {
  const baseOptions = useBaseOptions();
  const { theme } = useTheme();

  const chartData = useMemo(() => {
    const primary = readCssVariable('--eco-primary', '#4fbe80');
    const purple = readCssVariable('--eco-purple', '#3fb0a8');

    return {
      labels,
      datasets: [
        {
          label: 'Last month',
          data: previousData,
          backgroundColor: `color-mix(in srgb, ${purple} 40%, transparent)`,
          borderColor: purple,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false, // rounds the bottom of the bar too
        },
        {
          label: 'This month',
          data: currentData,
          backgroundColor: `${primary}99`,
          borderColor: primary,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    };
  }, [labels, currentData, previousData, theme]);

  // Horizontal bars, because seven category names will not fit side by side
  // across the bottom of a chart on a phone
  const options = useMemo(
    () => ({
      ...baseOptions,
      indexAxis: 'y',
      scales: {
        ...baseOptions.scales,
        x: { ...baseOptions.scales.y },
        y: { ...baseOptions.scales.x },
      },
      plugins: {
        ...baseOptions.plugins,
        tooltip: {
          ...baseOptions.plugins.tooltip,
          callbacks: {
            label: (item) => ` ${item.dataset.label}: ${item.parsed.x} kg CO₂`,
          },
        },
      },
    }),
    [baseOptions]
  );

  return (
    <div style={{ height }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADOPTION RATE BAR CHART - the admin Research tab's headline chart: what
// share of each actionable recommendation type gets accepted. Percentages,
// not kg CO2, so it needs its own tooltip/axis formatting rather than
// reusing ComparisonBarChart's.
// ---------------------------------------------------------------------------

export function AdoptionRateBarChart({ labels = [], data = [], height = 260 }) {
  const baseOptions = useBaseOptions();
  const { theme } = useTheme();

  const chartData = useMemo(() => {
    const primary = readCssVariable('--eco-primary', '#4fbe80');
    return {
      labels,
      datasets: [
        {
          label: 'Adoption rate',
          data,
          backgroundColor: `${primary}99`,
          borderColor: primary,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    };
  }, [labels, data, theme]);

  const options = useMemo(
    () => ({
      ...baseOptions,
      indexAxis: 'y',
      scales: {
        ...baseOptions.scales,
        x: { ...baseOptions.scales.y, max: 100, ticks: { ...baseOptions.scales.y.ticks, callback: (v) => `${v}%` } },
        y: { ...baseOptions.scales.x },
      },
      plugins: {
        ...baseOptions.plugins,
        tooltip: {
          ...baseOptions.plugins.tooltip,
          callbacks: { label: (item) => ` ${item.parsed.x}% accepted` },
        },
      },
    }),
    [baseOptions]
  );

  return (
    <div style={{ height }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// INTERVENTION TREND CHART - shown vs. accepted, per day, over the trend
// window - two lines rather than TrendLineChart's one, and counts rather
// than kg CO2.
// ---------------------------------------------------------------------------

export function InterventionTrendChart({ labels = [], shown = [], accepted = [], height = 260 }) {
  const baseOptions = useBaseOptions();
  const { theme } = useTheme();

  const chartData = useMemo(() => {
    const muted = readCssVariable('--eco-text-muted', '#93a58c');
    const primary = readCssVariable('--eco-primary', '#4fbe80');
    return {
      labels,
      datasets: [
        {
          label: 'Shown',
          data: shown,
          borderColor: muted,
          borderWidth: 2,
          borderDash: [4, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: 'Accepted',
          data: accepted,
          borderColor: primary,
          borderWidth: 2.5,
          backgroundColor: (context) => makeAreaGradient(context, primary),
          fill: true,
          tension: 0.3,
          pointBackgroundColor: primary,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
      ],
    };
  }, [labels, shown, accepted, theme]);

  const options = useMemo(
    () => ({
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, color: readCssVariable('--eco-text-muted', '#93a58c'), font: { family: 'Inter, sans-serif', size: 11 } } },
        tooltip: {
          ...baseOptions.plugins.tooltip,
          callbacks: { label: (item) => ` ${item.dataset.label}: ${item.parsed.y}` },
        },
      },
      scales: {
        ...baseOptions.scales,
        y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, precision: 0 } },
      },
    }),
    [baseOptions]
  );

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

export default TrendLineChart;
