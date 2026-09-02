// EcoTrack/frontend/src/utils/carbonBudget.js
// The JS mirror of backend/carbon_budget.py's glidepath - see that file's
// own module docstring for the full reasoning (a straight-line
// interpolation from a 2,000 kg CO2/year "2-tonne lifestyle" present-day
// benchmark down to a 1,500 kg CO2/year milestone by 2030, held flat
// outside that five-year window).
//
// Kept as the ONE place every page that shows a "climate-safe budget"
// figure (Calculator, Insights, Estimate) computes it, instead of each
// page carrying its own hardcoded copy - which is exactly the duplication
// that used to exist here (three separate flat 2000/12 constants) before
// this file.

export const BUDGET_START_YEAR = 2025;
export const BUDGET_START_ANNUAL_KG = 2000;

export const BUDGET_END_YEAR = 2030;
export const BUDGET_END_ANNUAL_KG = 1500;

export function annualBudgetKgForYear(year) {
  if (year <= BUDGET_START_YEAR) return BUDGET_START_ANNUAL_KG;
  if (year >= BUDGET_END_YEAR) return BUDGET_END_ANNUAL_KG;

  const spanYears = BUDGET_END_YEAR - BUDGET_START_YEAR;
  const progress = (year - BUDGET_START_YEAR) / spanYears;
  return BUDGET_START_ANNUAL_KG + (BUDGET_END_ANNUAL_KG - BUDGET_START_ANNUAL_KG) * progress;
}

export function currentAnnualBudgetKg() {
  return annualBudgetKgForYear(new Date().getFullYear());
}

export function currentMonthlyBudgetKg() {
  return currentAnnualBudgetKg() / 12;
}
