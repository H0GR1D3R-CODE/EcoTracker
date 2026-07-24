// EcoTrack/frontend/src/utils/formatters.js
// Small functions that turn raw values into text for the screen.
//
// These live in one file so that "2450.5" is displayed as "2,450.5 kg" in
// exactly the same way on every single page.

import { format, parseISO, differenceInDays, isValid } from 'date-fns';

/**
 * Add thousand separators to a number: 2450.5 -> "2,450.5"
 */
export function formatNumber(value, decimals = 1) {
  const number = Number(value);
  // Number() turns undefined and "" into NaN, so check before formatting
  if (!Number.isFinite(number)) return '0';

  return number.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format an emission value with its unit: 2450.5 -> "2,450.5 kg CO2"
 *
 * Values of a tonne or more switch units automatically, because
 * "1,240,000 kg" is much harder to read than "1,240 t".
 */
export function formatEmission(value, { showUnit = true, compact = false } = {}) {
  const number = Number(value) || 0;

  if (compact && Math.abs(number) >= 1000) {
    const tonnes = number / 1000;
    return `${formatNumber(tonnes, 2)}${showUnit ? ' t CO₂' : ''}`;
  }

  // Small values need more decimal places or water would always show as "0.0"
  const decimals = Math.abs(number) < 1 && number !== 0 ? 3 : 1;
  return `${formatNumber(number, decimals)}${showUnit ? ' kg CO₂' : ''}`;
}

/**
 * Turn a stored subType into something readable:
 * "petrol_car" -> "Petrol Car"
 */
export function formatSubType(subType) {
  if (!subType) return '';
  return subType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Capitalise a category name: "transport" -> "Transport"
 */
export function formatCategory(category) {
  if (!category) return '';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * "2026-07-24" -> "24 Jul 2026"
 */
export function formatDate(dateString, pattern = 'dd MMM yyyy') {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return dateString; // show the raw value rather than "Invalid Date"
    return format(date, pattern);
  } catch {
    return dateString;
  }
}

/**
 * "2026-07-24" -> "Today", "Yesterday", or "24 Jul 2026"
 *
 * Relative wording only helps for the last few days; past that, an exact date
 * is clearer than "43 days ago".
 */
export function formatRelativeDate(dateString) {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return dateString;

    const daysAgo = differenceInDays(new Date(), date);
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
    if (daysAgo > 1 && daysAgo < 7) return `${daysAgo} days ago`;

    return format(date, 'dd MMM yyyy');
  } catch {
    return dateString;
  }
}

/**
 * Today as "YYYY-MM-DD" - the format every backend route expects.
 */
export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * The current month as "YYYY-MM", for the ?month= query parameter.
 */
export function currentMonthISO() {
  return format(new Date(), 'yyyy-MM');
}

/**
 * Format a percentage with an explicit sign: -25 -> "-25%", 12.5 -> "+12.5%"
 *
 * Returns "—" for null, which is what the backend sends when there is no
 * previous month to compare against.
 */
export function formatPercent(value, { showSign = true } = {}) {
  if (value === null || value === undefined) return '—';

  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  const sign = showSign && number > 0 ? '+' : '';
  return `${sign}${formatNumber(number, 1)}%`;
}

/**
 * Shorten long text for table cells: "Something very long" -> "Something ve..."
 */
export function truncate(text, maxLength = 30) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * First letters of a name, for the avatar circle: "Aadi Santhosh" -> "AS"
 */
export function getInitials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)      // split on any run of whitespace
    .slice(0, 2)       // first two words only
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
