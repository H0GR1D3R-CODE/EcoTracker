# EcoTrack/backend/insights_engine.py
"""
The closed-loop engine: forecasting and counterfactual recommendation.

WHY THIS FILE IS FRAMEWORK-FREE
--------------------------------
Every other calculation in this app (carbon.py, dashboard.py, goals.py) mixes
its maths directly into Flask route functions. That is fine for a single
aggregation, but this file's functions need to be called from THREE places
that must all agree:
    1. routes/insights.py       - the live API a signed-in user hits
    2. evaluate_forecast.py     - a walk-forward backtest across historical
                                   months, run from the command line, that
                                   produces the MAE/MAPE table for the paper
    3. tests/test_insights_engine.py - unit tests on fixed fixtures

None of those should re-implement the maths, and only one of them (routes)
should ever import Flask or touch Firestore. So this module takes plain
Python data in (lists of record dicts, a factor lookup dict, a "today") and
returns plain Python data out - no g, no request, no db.

A JavaScript mirror of the swap arithmetic (not the forecast - the sandbox
sliders only need substitution maths, not the EWMA) lives at
frontend/src/utils/scenarioMath.js, for the same reason the Calculator's
live preview mirrors carbon.py: instant feedback while dragging a slider,
with THIS file remaining the authoritative source once a value is saved.
backend/tests/test_parity.py checks the two agree on a fixture set.
"""

import math
from datetime import date, timedelta

from carbon_budget import CURRENT_MONTHLY_BUDGET_KG

# The personal carbon budget consistent with 1.5C of warming - a glidepath,
# not a flat 2 tonnes/year forever. See carbon_budget.py's own module
# docstring for the full reasoning; routes/assistant.py imports the same
# two names from there too, so this stays the one other place (alongside
# assistant.py) this figure is sourced from, matching frontend/src/utils/
# carbonBudget.js's own JS mirror of the identical glidepath. Kept as its
# own name here (not just imported and used inline) because this module is
# deliberately framework-free (see this file's own module docstring) and
# forecast_month's signature below already takes budget_kg as a named
# default parameter - callers like evaluate_forecast.py can still pass a
# different figure explicitly for a historical backtest year if they want to.
MONTHLY_BUDGET_KG = CURRENT_MONTHLY_BUDGET_KG

# --- forecast tuning ---------------------------------------------------------

# How far back the EWMA looks for a category/day-type's typical daily rate.
# 90 days gives enough weekday AND weekend observations per category without
# reaching back into a different season of behaviour.
FORECAST_WINDOW_DAYS = 90

# Exponential half-life, in days, of how much a past day's emissions still
# count towards today's estimated rate. 14 days means something logged two
# weeks ago carries half the weight of something logged today - recent
# behaviour dominates, but a single unusual day cannot swing the forecast.
EWMA_HALFLIFE_DAYS = 14

# Below this many days of history, a forecast is more noise than signal.
# The route returns status="insufficient_history" rather than a fabricated
# cone - see the module docstring in routes/insights.py.
MIN_HISTORY_DAYS_FOR_FORECAST = 30

# z-score for an (approximately) 80% two-sided prediction interval.
FORECAST_Z_SCORE = 1.28


def _days_in_month(year, month):
    if month == 12:
        next_first = date(year + 1, 1, 1)
    else:
        next_first = date(year, month + 1, 1)
    return (next_first - date(year, month, 1)).days


def _is_weekend(day):
    """Saturday/Sunday, matching the everyday sense of "weekend" in India."""
    return day.weekday() >= 5


def _daily_totals_by_category(records, start_date, end_date):
    """
    {(category, "YYYY-MM-DD"): kgCO2} for every record in [start_date, end_date].

    A plain dict rather than a per-day/per-category matrix, because most
    category/day combinations in a real user's history are simply absent
    (nobody logs fuel every day) - a sparse structure avoids building and
    zero-filling a grid nobody asked for.
    """
    totals = {}
    start_str = start_date.isoformat()
    end_str = end_date.isoformat()
    for record in records:
        recorded = record.get("recordedDate", "")
        if not (start_str <= recorded <= end_str):
            continue
        key = (record.get("category", ""), recorded)
        totals[key] = totals.get(key, 0.0) + float(record.get("emissionKgco2", 0) or 0)
    return totals


def _weighted_daily_rate(day_values, reference_date, halflife_days=EWMA_HALFLIFE_DAYS):
    """
    An exponentially-weighted average of (date -> kgCO2) observations.

    IMPLEMENTATION NOTE (worth defending in the viva): this is the closed-form
    equivalent of a recursive EWMA, not the recursive update itself. A
    recursive EWMA (rate = alpha*value + (1-alpha)*rate_prev) assumes
    observations arrive on a regular clock; splitting by weekday/weekend
    means the sequence for e.g. "weekend transport" skips five days out of
    seven, which would distort a naive recursive update's effective
    half-life. Weighting each observation directly by its calendar distance
    from `reference_date` -
        weight = 0.5 ** (days_ago / halflife_days)
        rate   = sum(weight * value) / sum(weight)
    - gives the same "recent counts more" behaviour without depending on the
    spacing between observations.

    Returns None when there are no observations at all, so the caller can
    fall back rather than silently reporting a rate of zero.
    """
    if not day_values:
        return None

    weighted_sum = 0.0
    weight_total = 0.0
    for day, value in day_values:
        days_ago = (reference_date - day).days
        weight = 0.5 ** (days_ago / halflife_days)
        weighted_sum += weight * value
        weight_total += weight

    if weight_total <= 0:
        return None
    return weighted_sum / weight_total


def _category_day_type_rates(records, today, categories):
    """
    {category: {"weekday": rate_or_None, "weekend": rate_or_None}}

    Zero-emission days are included for categories the user HAS logged
    before (so a category that dropped off recently correctly pulls the
    rate down), but a category never logged at all stays None rather than 0
    - "no data" and "confirmed zero" are different claims about a user's
    behaviour, and the forecast should not pretend to know the difference
    without being told.
    """
    window_start = today - timedelta(days=FORECAST_WINDOW_DAYS)
    totals = _daily_totals_by_category(records, window_start, today)

    categories_with_history = {category for category, _ in totals.keys()}

    rates = {}
    for category in categories:
        if category not in categories_with_history:
            rates[category] = {"weekday": None, "weekend": None}
            continue

        weekday_points = []
        weekend_points = []
        cursor = window_start
        while cursor <= today:
            value = totals.get((category, cursor.isoformat()), 0.0)
            (weekend_points if _is_weekend(cursor) else weekday_points).append((cursor, value))
            cursor += timedelta(days=1)

        weekday_rate = _weighted_daily_rate(weekday_points, today)
        weekend_rate = _weighted_daily_rate(weekend_points, today)

        # A category with, say, only weekend entries (a Saturday market run)
        # falls back to its own overall rate for the day-type it has no data
        # for, rather than silently contributing zero to weekday projections.
        overall_rate = _weighted_daily_rate(weekday_points + weekend_points, today)
        rates[category] = {
            "weekday": weekday_rate if weekday_rate is not None else overall_rate,
            "weekend": weekend_rate if weekend_rate is not None else overall_rate,
        }

    return rates


def forecast_month(records, today, categories, budget_kg=MONTHLY_BUDGET_KG):
    """
    Project this month's total emissions from a user's history.

    Walk-forward safe by construction: only records with recordedDate <=
    `today` are ever read, and only the window ending at `today` feeds the
    EWMA. That means the SAME function serves the live forecast (today =
    date.today()) and a historical backtest (today = some date in the past,
    called from evaluate_forecast.py) with no duplicated logic and no risk
    of the backtest accidentally peeking at the future.

    Returns a dict:
        status               "ok" | "insufficient_history" | "no_data"
        actualToDate          kgCO2 logged so far this month
        projected             point forecast for the full month
        lower / upper          80% prediction interval (None if insufficient_history)
        budget                the budget_kg passed in, echoed back
        daysElapsed / daysRemaining
        daysUntilBudgetExhausted   int or None (None = won't cross budget this month)
        perCategory           [{category, projectedTotal}], sorted, highest first
        historyDays           how many distinct days of history informed this
        dailySeries           [{day, date, cumulative}] running total for the
                               elapsed part of THIS month - what the burn-down
                               line in ForecastGauge.jsx is actually drawn from
    """
    month_start = date(today.year, today.month, 1)
    days_in_month = _days_in_month(today.year, today.month)
    days_elapsed = (today - month_start).days + 1
    days_remaining = days_in_month - days_elapsed

    month_records = [r for r in records if month_start.isoformat() <= r["recordedDate"] <= today.isoformat()]
    actual_to_date = round(sum(float(r.get("emissionKgco2", 0) or 0) for r in month_records), 2)

    # Day-by-day running total for the elapsed part of the month, so the UI
    # can draw an actual burn-down line rather than just a single point.
    daily_totals = {}
    for record in month_records:
        daily_totals[record["recordedDate"]] = daily_totals.get(record["recordedDate"], 0.0) + float(
            record.get("emissionKgco2", 0) or 0
        )
    daily_series = []
    running = 0.0
    for day_offset in range(days_elapsed):
        day = month_start + timedelta(days=day_offset)
        running += daily_totals.get(day.isoformat(), 0.0)
        daily_series.append({"day": day_offset + 1, "date": day.isoformat(), "cumulative": round(running, 2)})

    # How many distinct days in the trailing window have ANY record - the
    # honesty check. A user who logged sporadically over the last year but
    # has ten scattered entries has ten days of signal, not 90.
    window_start = today - timedelta(days=FORECAST_WINDOW_DAYS)
    history_days = len({
        r["recordedDate"] for r in records
        if window_start.isoformat() <= r["recordedDate"] <= today.isoformat()
    })

    if history_days == 0:
        return {
            "status": "no_data",
            "actualToDate": actual_to_date,
            "projected": None,
            "lower": None,
            "upper": None,
            "budget": budget_kg,
            "daysElapsed": days_elapsed,
            "daysRemaining": days_remaining,
            "daysUntilBudgetExhausted": None,
            "perCategory": [],
            "historyDays": history_days,
            "dailySeries": daily_series,
        }

    rates = _category_day_type_rates(records, today, categories)

    # --- point forecast: actual so far + projected remainder ---
    remaining_weekdays = 0
    remaining_weekend_days = 0
    cursor = today + timedelta(days=1)
    month_end = date(today.year, today.month, days_in_month)
    while cursor <= month_end:
        if _is_weekend(cursor):
            remaining_weekend_days += 1
        else:
            remaining_weekdays += 1
        cursor += timedelta(days=1)

    per_category_projection = {}
    projected_remaining_total = 0.0
    for category in categories:
        weekday_rate = rates[category]["weekday"] or 0.0
        weekend_rate = rates[category]["weekend"] or 0.0
        category_remaining = weekday_rate * remaining_weekdays + weekend_rate * remaining_weekend_days
        category_actual = round(
            sum(
                float(r.get("emissionKgco2", 0) or 0)
                for r in month_records
                if r.get("category") == category
            ),
            2,
        )
        per_category_projection[category] = round(category_actual + category_remaining, 2)
        projected_remaining_total += category_remaining

    projected_total = round(actual_to_date + projected_remaining_total, 2)

    # --- prediction interval ---
    # A fast, closed-form uncertainty proxy for the interactive UI: treat each
    # remaining day's TOTAL emission (all categories combined) as an i.i.d.
    # draw with the same day-to-day standard deviation observed in the
    # trailing window. Variance of a sum of N i.i.d. draws is N times the
    # single-day variance, so the standard deviation of the remaining-days sum
    # scales with sqrt(N). This is a real simplification (it ignores category
    # correlation and the EWMA's own recency weighting) - the walk-forward
    # backtest in evaluate_forecast.py is what validates whether it is a good
    # enough one, not this formula in isolation.
    status = "ok" if history_days >= MIN_HISTORY_DAYS_FOR_FORECAST else "insufficient_history"

    lower = upper = None
    if status == "ok" and days_remaining > 0:
        window_totals = {}
        for record in records:
            recorded = record.get("recordedDate", "")
            if window_start.isoformat() <= recorded <= today.isoformat():
                window_totals[recorded] = window_totals.get(recorded, 0.0) + float(
                    record.get("emissionKgco2", 0) or 0
                )
        daily_values = list(window_totals.values())
        if len(daily_values) >= 2:
            mean_daily = sum(daily_values) / len(daily_values)
            variance = sum((v - mean_daily) ** 2 for v in daily_values) / (len(daily_values) - 1)
            daily_sigma = math.sqrt(variance)
            sigma_remaining = daily_sigma * math.sqrt(days_remaining)
            lower = round(max(actual_to_date, projected_total - FORECAST_Z_SCORE * sigma_remaining), 2)
            upper = round(projected_total + FORECAST_Z_SCORE * sigma_remaining, 2)
    elif status == "ok":
        # No days left to be uncertain about - the "forecast" is just the actual
        lower = upper = projected_total

    # --- days until the budget is exhausted, at the projected pace ---
    days_until_exhausted = None
    if actual_to_date >= budget_kg:
        days_until_exhausted = 0
    elif days_remaining > 0 and projected_remaining_total > 0:
        remaining_daily_rate = projected_remaining_total / days_remaining
        days_needed = (budget_kg - actual_to_date) / remaining_daily_rate
        if days_needed <= days_remaining:
            days_until_exhausted = max(0, round(days_needed))

    per_category_list = sorted(
        [{"category": c, "projectedTotal": v} for c, v in per_category_projection.items()],
        key=lambda item: item["projectedTotal"],
        reverse=True,
    )

    return {
        "status": status,
        "actualToDate": actual_to_date,
        "projected": projected_total,
        "lower": lower,
        "upper": upper,
        "budget": budget_kg,
        "daysElapsed": days_elapsed,
        "daysRemaining": days_remaining,
        "daysUntilBudgetExhausted": days_until_exhausted,
        "perCategory": per_category_list,
        "historyDays": history_days,
        "dailySeries": daily_series,
    }


# =============================================================================
# COUNTERFACTUAL SWAP ENGINE
# =============================================================================

# Every entry says: "someone who did X could realistically shift a FRACTION of
# it to Y, at some personal EFFORT". These are STATED ASSUMPTIONS, not
# measurements - unlike the emission factors (DEFRA/IPCC/CEA, cited per swap
# at the point of use), nobody measured what fraction of car trips a typical
# person can move to a bus. They are deliberately conservative (nobody is
# told to replace 100% of anything) and are the first thing to challenge in a
# review of this feature.
#
# effort is 1 (trivial) to 5 (a real lifestyle change), used to rank the MACC.
SWAP_TABLE = {
    ("transport", "petrol_car"): [
        {"to": "bus", "feasibility": 0.30, "effort": 2},
        {"to": "train", "feasibility": 0.20, "effort": 3},
        {"to": "bicycle", "feasibility": 0.10, "effort": 4},
    ],
    ("transport", "diesel_car"): [
        {"to": "bus", "feasibility": 0.30, "effort": 2},
        {"to": "train", "feasibility": 0.20, "effort": 3},
        {"to": "bicycle", "feasibility": 0.10, "effort": 4},
    ],
    ("transport", "motorbike"): [
        {"to": "bus", "feasibility": 0.25, "effort": 2},
        {"to": "bicycle", "feasibility": 0.15, "effort": 3},
    ],
    ("transport", "flight_domestic"): [
        {"to": "train", "feasibility": 0.15, "effort": 4},
    ],
    ("electricity", "grid_electricity"): [
        {"to": "solar", "feasibility": 0.15, "effort": 5},
    ],
    ("diet", "non_vegetarian"): [
        {"to": "vegetarian", "feasibility": 0.40, "effort": 2},
        {"to": "vegan", "feasibility": 0.15, "effort": 4},
    ],
    ("diet", "vegetarian"): [
        {"to": "vegan", "feasibility": 0.20, "effort": 3},
    ],
    ("waste", "landfill"): [
        {"to": "recycled", "feasibility": 0.50, "effort": 1},
    ],
}

# The smallest saving worth showing someone - below this it is noise, not a
# recommendation.
MIN_SWAP_SAVING_KG = 0.05


def _group_month_records(records, year, month):
    """{(category, subType): {"quantity": total, "unit": unit, "emission": total}}"""
    start = date(year, month, 1).isoformat()
    end = date(year, month, _days_in_month(year, month)).isoformat()
    grouped = {}
    for record in records:
        if not (start <= record.get("recordedDate", "") <= end):
            continue
        key = (record.get("category", ""), record.get("subType", ""))
        bucket = grouped.setdefault(key, {"quantity": 0.0, "unit": record.get("unit", ""), "emission": 0.0})
        bucket["quantity"] += float(record.get("quantity", 0) or 0)
        bucket["emission"] += float(record.get("emissionKgco2", 0) or 0)
    return grouped


def generate_swaps(records, factor_lookup, year, month):
    """
    Ranked, explainable counterfactual swaps for one month of a user's records.

    factor_lookup: {(category, subType): {"factorValue": float, "unit": str,
                     "source": str}} - built from GET /api/factors data by the
    caller (routes/insights.py), so this function never touches Firestore.

    Returns a list of swap dicts, ranked by savingKg descending. Each one
    carries BOTH factor values and both sources, because the citation is the
    whole explainability claim - it must travel with the number, not just
    exist in a log somewhere.
    """
    grouped = _group_month_records(records, year, month)
    swaps = []

    for (category, sub_type), bucket in grouped.items():
        candidates = SWAP_TABLE.get((category, sub_type), [])
        from_factor = factor_lookup.get((category, sub_type))
        if not from_factor or bucket["quantity"] <= 0:
            continue

        for candidate in candidates:
            to_sub_type = candidate["to"]
            to_factor = factor_lookup.get((category, to_sub_type))
            if not to_factor:
                continue

            # UNIT GUARD: never propose a swap between incompatible units.
            # Mirrors the same check in routes/carbon.py:203-209 - a per-km
            # factor must never be applied to a per-litre quantity.
            if str(from_factor["unit"]).lower() != str(to_factor["unit"]).lower():
                continue

            saving_per_unit = from_factor["factorValue"] - to_factor["factorValue"]
            if saving_per_unit <= 0:
                continue  # not actually an improvement - do not propose it

            quantity_shifted = bucket["quantity"] * candidate["feasibility"]
            saving_kg = round(quantity_shifted * saving_per_unit, 2)
            if saving_kg < MIN_SWAP_SAVING_KG:
                continue

            swaps.append({
                "id": f"{category}_{sub_type}_to_{to_sub_type}",
                "category": category,
                "fromSubType": sub_type,
                "toSubType": to_sub_type,
                "unit": from_factor["unit"],
                "monthlyQuantity": round(bucket["quantity"], 2),
                "feasibility": candidate["feasibility"],
                "effort": candidate["effort"],
                "factorFrom": from_factor["factorValue"],
                "factorTo": to_factor["factorValue"],
                "factorFromSource": from_factor["source"],
                "factorToSource": to_factor["source"],
                "savingKg": saving_kg,
                "annualSavingKg": round(saving_kg * 12, 2),
            })

    swaps.sort(key=lambda s: s["savingKg"], reverse=True)
    return swaps


def macc_curve(swaps):
    """
    The same swaps, ordered by EFFORT instead of saving, with a running
    cumulative-abatement total - the shape a marginal abatement cost curve is
    drawn from (effort on x, cumulative kgCO2 avoided on y).
    """
    ordered = sorted(swaps, key=lambda s: (s["effort"], -s["savingKg"]))
    cumulative = 0.0
    curve = []
    for swap in ordered:
        cumulative = round(cumulative + swap["savingKg"], 2)
        curve.append({**swap, "cumulativeSavingKg": cumulative})
    return curve


# =============================================================================
# COHORT STATISTICS (k-anonymity)
# =============================================================================

# A cohort smaller than this is never summarised at all - not even a rounded
# figure. Below ten people, a decile can start to imply something close to a
# single person's own number.
COHORT_MIN_SIZE = 10


def cohort_deciles(values):
    """
    Pure aggregation used by routes/insights.py's cohort endpoint.

    `values` is every user's current-month total in one region. Returns None
    when the cohort is below COHORT_MIN_SIZE - the k-anonymity floor - so the
    route has nothing to accidentally leak even by omission (no "3 people, so
    here is a suspiciously specific decile list" partial answer).

    Otherwise returns {"n", "deciles" (the 10th..90th percentile values),
    "mean"} - deciles only, never a raw list of individual values.
    """
    n = len(values)
    if n < COHORT_MIN_SIZE:
        return None

    ordered = sorted(values)
    deciles = []
    for p in range(10, 100, 10):
        index = min(n - 1, int(round((p / 100) * (n - 1))))
        deciles.append(round(ordered[index], 2))

    return {"n": n, "deciles": deciles, "mean": round(sum(ordered) / n, 2)}


def cohort_percentile(my_total, deciles):
    """Which decile bucket my_total falls into, as a percentile 10-100."""
    for i, threshold in enumerate(deciles):
        if my_total <= threshold:
            return (i + 1) * 10
    return 100


def simulate_scenario(records, factor_lookup, year, month, slider_overrides):
    """
    Recompute the month's projected total with specific swaps adopted at
    specific fractions - the authoritative check behind POST /insights/simulate.

    slider_overrides: {swapId: fraction 0..1} - fraction of that swap's
    origin quantity to shift, overriding its default `feasibility`. A swap
    id not present in slider_overrides is treated as not adopted (0).

    Multiple swaps can share the same origin (category, subType) - for
    example two different substitutes for petrol_car. The fraction shifted
    OUT of one origin is capped at 1.0 in total across every swap that
    targets it, so a sandbox cannot claim to reduce a single logged activity
    by more than the whole of it.
    """
    baseline_swaps = generate_swaps(records, factor_lookup, year, month)
    baseline_by_id = {s["id"]: s for s in baseline_swaps}

    grouped = _group_month_records(records, year, month)
    baseline_total = round(sum(b["emission"] for b in grouped.values()), 2)

    origin_fraction_used = {}
    total_saving = 0.0
    applied = []

    for swap_id, fraction in (slider_overrides or {}).items():
        swap = baseline_by_id.get(swap_id)
        if not swap:
            continue
        fraction = max(0.0, min(1.0, float(fraction)))
        if fraction <= 0:
            continue

        origin_key = (swap["category"], swap["fromSubType"])
        already_used = origin_fraction_used.get(origin_key, 0.0)
        available = max(0.0, 1.0 - already_used)
        applied_fraction = min(fraction, available)
        if applied_fraction <= 0:
            continue
        origin_fraction_used[origin_key] = already_used + applied_fraction

        # Rescale from the swap's default-feasibility saving to this fraction
        saving_at_full_swap = swap["savingKg"] / swap["feasibility"] if swap["feasibility"] else 0
        saving_kg = round(saving_at_full_swap * applied_fraction, 2)
        total_saving += saving_kg

        applied.append({**swap, "appliedFraction": round(applied_fraction, 3), "appliedSavingKg": saving_kg})

    projected_total = round(max(0.0, baseline_total - total_saving), 2)

    return {
        "baselineTotal": baseline_total,
        "projectedTotal": projected_total,
        "totalSavingKg": round(total_saving, 2),
        "annualSavingKg": round(total_saving * 12, 2),
        "applied": applied,
    }
