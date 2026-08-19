// EcoTrack/frontend/src/utils/scenarioMath.js
// The what-if sandbox's slider arithmetic, mirrored from
// backend/insights_engine.py (generate_swaps' saving formula and
// simulate_scenario's per-origin cap) - the same "backend is authoritative,
// frontend mirrors for an instant preview" pattern documented at
// frontend/src/utils/emissionHelpers.js:5-10 for the Calculator's live
// preview. POST /api/insights/simulate is what actually gets trusted for
// any figure that matters beyond "what does dragging this slider look like
// right now" - see ScenarioSandbox.jsx.
//
// backend/tests/test_parity.py runs this file under Node and the Python
// engine side by side on the same fixtures and asserts they agree, which is
// what backs the reproducibility claim: the sandbox never lies to a user
// about what accepting a swap would actually do.

/**
 * The saving from adopting one swap at a given quantity shift.
 *
 * saving (kgCO2) = quantityShifted x (factorFrom - factorTo)
 *
 * Mirrors insights_engine.generate_swaps: saving_kg = quantity_shifted *
 * (from_factor - to_factor), where quantity_shifted = monthlyQuantity *
 * feasibility.
 */
export function computeSwapSaving({ monthlyQuantity, feasibility, factorFrom, factorTo }) {
  const quantityShifted = monthlyQuantity * feasibility;
  const savingPerUnit = factorFrom - factorTo;
  return Math.round(quantityShifted * savingPerUnit * 100) / 100;
}

/**
 * Rescale one swap's saving to an arbitrary slider fraction (0-1), instead
 * of its default suggested feasibility.
 *
 * Mirrors insights_engine.simulate_scenario's per-swap rescale:
 *   savingAtFullSwap = savingKg / feasibility
 *   saving            = savingAtFullSwap x appliedFraction
 */
export function computeSliderSaving(swap, fraction) {
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0));
  if (!swap.feasibility) return 0;
  const savingAtFullSwap = swap.savingKg / swap.feasibility;
  return Math.round(savingAtFullSwap * clamped * 100) / 100;
}

/**
 * Apply a full set of slider positions to a baseline month total.
 *
 * Mirrors insights_engine.simulate_scenario: multiple swaps can share the
 * same origin (category, subType) - e.g. two substitutes for petrol_car -
 * so the fraction shifted OUT of any one origin is capped at 1.0 in total
 * across every swap that targets it. Sliders are applied in the order given
 * (matching the object's own key order, same as the array a sandbox
 * component would naturally iterate), so which swap "wins" the shared
 * capacity when both are pushed past what the origin has left is
 * deterministic and matches whatever order the backend receives the same
 * sliders object in.
 *
 * @param {number} baselineTotal   this month's total kgCO2 before any swap
 * @param {Array}  swaps           the ranked swaps from GET /insights/swaps
 * @param {Object} sliderPositions {swapId: fraction 0-1}
 * @returns {{projectedTotal: number, totalSavingKg: number, applied: Array}}
 */
export function applySlidersToBaseline(baselineTotal, swaps, sliderPositions) {
  const swapsById = new Map(swaps.map((swap) => [swap.id, swap]));
  const originFractionUsed = new Map();
  let totalSaving = 0;
  const applied = [];

  for (const [swapId, rawFraction] of Object.entries(sliderPositions || {})) {
    const swap = swapsById.get(swapId);
    if (!swap) continue;

    const fraction = Math.max(0, Math.min(1, Number(rawFraction) || 0));
    if (fraction <= 0) continue;

    const originKey = `${swap.category}::${swap.fromSubType}`;
    const alreadyUsed = originFractionUsed.get(originKey) || 0;
    const available = Math.max(0, 1 - alreadyUsed);
    const appliedFraction = Math.min(fraction, available);
    if (appliedFraction <= 0) continue;
    originFractionUsed.set(originKey, alreadyUsed + appliedFraction);

    const savingKg = computeSliderSaving(swap, appliedFraction);
    totalSaving += savingKg;
    applied.push({ ...swap, appliedFraction: Math.round(appliedFraction * 1000) / 1000, appliedSavingKg: savingKg });
  }

  const projectedTotal = Math.max(0, Math.round((baselineTotal - totalSaving) * 100) / 100);

  return {
    projectedTotal,
    totalSavingKg: Math.round(totalSaving * 100) / 100,
    annualSavingKg: Math.round(totalSaving * 12 * 100) / 100,
    applied,
  };
}
