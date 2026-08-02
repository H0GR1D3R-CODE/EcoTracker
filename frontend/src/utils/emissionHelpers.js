// EcoTrack/frontend/src/utils/emissionHelpers.js
// Everything the UI needs to describe an emission: the live preview number,
// the severity colour, the "that is like driving X km" context lines, and the
// icon and colour for each of the seven categories.
//
// IMPORTANT: the numbers saved to the database are always calculated by the
// BACKEND, using factors read from Firestore. The calculation in this file is
// only for the live preview that updates as the user types, so they see a
// result before pressing submit. The two use the same factor value, so they
// always agree - but the backend is the one that counts.

// ---------------------------------------------------------------------------
// CATEGORY METADATA
// Icon names match lucide-react exports, so a component can do:
//   import * as Icons from 'lucide-react';
//   const Icon = Icons[CATEGORY_META[category].icon];
// ---------------------------------------------------------------------------

export const CATEGORY_META = {
  transport: {
    label: 'Transport',
    icon: 'Car',
    color: '#4fbe80', // leaf green
    description: 'Cars, buses, trains and flights',
    quantityLabel: 'Distance travelled',
  },
  electricity: {
    label: 'Electricity',
    icon: 'Zap',
    color: '#e0a23f', // warm amber
    description: 'Grid power and solar generation',
    quantityLabel: 'Energy used',
  },
  fuel: {
    label: 'Fuel',
    icon: 'Flame',
    color: '#d9694e', // terracotta
    description: 'LPG cylinders and generators',
    quantityLabel: 'Fuel consumed',
  },
  diet: {
    label: 'Diet',
    icon: 'UtensilsCrossed',
    color: '#a4739e', // muted berry
    description: 'Meals by dietary type',
    quantityLabel: 'Number of meals',
  },
  waste: {
    label: 'Waste',
    icon: 'Trash2',
    color: '#8f9a86', // sage grey-green
    description: 'Landfill and recycled waste',
    quantityLabel: 'Weight of waste',
  },
  water: {
    label: 'Water',
    icon: 'Droplets',
    color: '#4a9dc4', // natural water blue
    description: 'Municipal water supply',
    quantityLabel: 'Water used',
  },
  consumption: {
    label: 'Consumption',
    icon: 'ShoppingBag',
    color: '#cf7d95', // dusty rose
    description: 'Clothing and electronics bought',
    quantityLabel: 'Items purchased',
  },
};

// The fixed order categories appear in - matches Config.CATEGORIES in the backend
export const CATEGORY_ORDER = [
  'transport',
  'electricity',
  'fuel',
  'diet',
  'waste',
  'water',
  'consumption',
];

// Chart.js colours, in the same order as CATEGORY_ORDER
export const CHART_COLORS = CATEGORY_ORDER.map((category) => CATEGORY_META[category].color);

// ---------------------------------------------------------------------------
// LIVE CALCULATION
// ---------------------------------------------------------------------------

/**
 * The live preview shown while the user types.
 *
 * @param {number|string} quantity     what the user typed
 * @param {number}        factorValue  from GET /api/factors
 * @returns {number} kg of CO2, or 0 when the input is not usable yet
 */
export function calculateEmission(quantity, factorValue) {
  const amount = parseFloat(quantity);
  const factor = parseFloat(factorValue);

  // While someone is mid-typing, quantity can be "" or "." - show 0, not NaN
  if (!Number.isFinite(amount) || !Number.isFinite(factor) || amount <= 0) {
    return 0;
  }

  // Rounded to 3 decimals to match how the backend stores it, so the preview
  // never disagrees with the saved value
  return Math.round(amount * factor * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// SEVERITY
// These thresholds are the same ones used in backend/routes/carbon.py
// ---------------------------------------------------------------------------

export const SEVERITY_LOW_MAX = 5;
export const SEVERITY_MEDIUM_MAX = 20;

/**
 * Which colour band an emission falls into, for the result badge.
 */
export function getSeverity(emission) {
  const value = Number(emission) || 0;

  if (value < SEVERITY_LOW_MAX) {
    return {
      level: 'low',
      label: 'Low impact',
      color: 'var(--eco-primary)',
      className: 'eco-badge-low',
    };
  }

  if (value <= SEVERITY_MEDIUM_MAX) {
    return {
      level: 'medium',
      label: 'Moderate impact',
      color: 'var(--eco-orange)',
      className: 'eco-badge-medium',
    };
  }

  return {
    level: 'high',
    label: 'High impact',
    color: 'var(--eco-danger)',
    className: 'eco-badge-high',
  };
}

// ---------------------------------------------------------------------------
// REAL-WORLD EQUIVALENTS
//
// A number like "4.23 kg CO2" means nothing to most people. These comparisons
// turn it into something imaginable, which is the whole point of the app.
// ---------------------------------------------------------------------------

// A mature tree absorbs roughly 21 kg of CO2 per year (US Forest Service)
const CO2_ABSORBED_PER_TREE_PER_YEAR = 21;

// Charging a smartphone once is roughly 0.005 kg CO2
const CO2_PER_PHONE_CHARGE = 0.005;

// Used only for the "same as driving X km" line. The real transport
// calculation always uses the factor from Firestore, never this constant.
const FALLBACK_PETROL_CAR_FACTOR = 0.141;

/**
 * Human-readable comparisons for an emission value.
 *
 * @param {number} emission          kg of CO2
 * @param {number} petrolCarFactor   optional, pass the live value from
 *                                   GET /api/factors so the comparison stays
 *                                   accurate if an admin updates the factor
 * @returns {Array<{icon, text, value}>}
 */
export function getEquivalents(emission, petrolCarFactor = FALLBACK_PETROL_CAR_FACTOR) {
  const value = Number(emission) || 0;
  if (value <= 0) return [];

  const equivalents = [];

  // --- driving distance ---
  const factor = Number(petrolCarFactor) || FALLBACK_PETROL_CAR_FACTOR;
  const km = value / factor;
  equivalents.push({
    icon: 'Car',
    value: km,
    text: `the same as driving ${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-IN')} km in a petrol car`,
  });

  // --- trees needed ---
  const treeYears = value / CO2_ABSORBED_PER_TREE_PER_YEAR;
  if (treeYears >= 0.01) {
    const treeText =
      treeYears < 1
        ? `it would take one tree ${Math.round(treeYears * 365)} days to absorb this`
        : `it would take ${Math.ceil(treeYears)} tree${Math.ceil(treeYears) > 1 ? 's' : ''} a full year to absorb this`;
    equivalents.push({ icon: 'TreePine', value: treeYears, text: treeText });
  }

  // --- phone charges ---
  const charges = value / CO2_PER_PHONE_CHARGE;
  equivalents.push({
    icon: 'Smartphone',
    value: charges,
    text: `equal to charging a phone ${Math.round(charges).toLocaleString('en-IN')} times`,
  });

  return equivalents;
}

// ---------------------------------------------------------------------------
// FORM VALIDATION
// Shared so the Calculator and Goals forms reject the same things.
// ---------------------------------------------------------------------------

export const MAX_QUANTITY = 1000000; // matches MAX_QUANTITY in backend/routes/carbon.py

/**
 * Validate a quantity input.
 * @returns {string|null} an error message, or null when the value is fine
 */
export function validateQuantity(value) {
  if (value === '' || value === null || value === undefined) {
    return 'Please enter a quantity.';
  }

  const amount = parseFloat(value);

  if (!Number.isFinite(amount)) return 'Quantity must be a number.';
  if (amount <= 0) return 'Quantity must be greater than zero.';
  if (amount > MAX_QUANTITY) {
    return `That looks too large. Please enter a value under ${MAX_QUANTITY.toLocaleString('en-IN')}.`;
  }

  return null;
}

/**
 * Validate a "YYYY-MM-DD" date that is not allowed to be in the future.
 * @returns {string|null} an error message, or null when the value is fine
 */
export function validateRecordDate(dateString) {
  if (!dateString) return 'Please choose a date.';

  const chosen = new Date(dateString);
  if (Number.isNaN(chosen.getTime())) return 'Please choose a valid date.';

  // Compare date-only values by zeroing the time on today's date
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (chosen > today) return 'You cannot log emissions for a future date.';

  return null;
}
