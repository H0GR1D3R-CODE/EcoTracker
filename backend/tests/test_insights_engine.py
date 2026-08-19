# EcoTrack/backend/tests/test_insights_engine.py
"""
Unit tests for insights_engine.py.

These import the engine directly and never touch Flask or Firestore - that
is the entire point of insights_engine.py being framework-free (see its
module docstring). Run with:

    cd backend && python -m pytest tests/ -v
"""

import sys
from datetime import date, timedelta
from pathlib import Path

# Make "insights_engine" importable when pytest is run from backend/ or repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from insights_engine import (  # noqa: E402
    cohort_deciles,
    cohort_percentile,
    forecast_month,
    generate_swaps,
    macc_curve,
    simulate_scenario,
)

CATEGORIES = ["transport", "electricity", "fuel", "diet", "waste", "water", "consumption"]

FACTORS = {
    ("transport", "petrol_car"): {"factorValue": 0.141, "unit": "km", "source": "DEFRA 2023"},
    ("transport", "bus"): {"factorValue": 0.082, "unit": "km", "source": "DEFRA 2023"},
    ("transport", "bicycle"): {"factorValue": 0.0, "unit": "km", "source": "DEFRA 2023"},
    ("fuel", "lpg"): {"factorValue": 2.983, "unit": "kg", "source": "IPCC 2006"},
    ("diet", "non_vegetarian"): {"factorValue": 3.3, "unit": "meal", "source": "Our World in Data"},
    ("diet", "vegetarian"): {"factorValue": 1.7, "unit": "meal", "source": "Our World in Data"},
}


def make_record(category, sub_type, quantity, factor_value, recorded_date, unit="km"):
    return {
        "category": category,
        "subType": sub_type,
        "quantity": quantity,
        "unit": unit,
        "emissionKgco2": round(quantity * factor_value, 3),
        "recordedDate": recorded_date,
    }


# ---------------------------------------------------------------------------
# forecast_month
# ---------------------------------------------------------------------------

def test_forecast_reports_no_data_with_empty_history():
    result = forecast_month([], date(2026, 8, 15), CATEGORIES)
    assert result["status"] == "no_data"
    assert result["projected"] is None


def test_forecast_reports_insufficient_history_under_one_month():
    today = date(2026, 8, 15)
    records = [
        make_record("transport", "petrol_car", 20, 0.141, (today - timedelta(days=i)).isoformat())
        for i in range(5)
    ]
    result = forecast_month(records, today, CATEGORIES)
    assert result["status"] == "insufficient_history"
    assert result["lower"] is None and result["upper"] is None
    # actualToDate must still be honest even without a confident cone
    assert result["actualToDate"] > 0


def test_forecast_projects_steady_daily_habit_close_to_actual_pace():
    """
    A user who logs an identical 2.82 kg (20km petrol car) every single day
    for 60 days, then stops - the forecast for a 30-day month at day 15
    should land close to 30 * 2.82, since the daily rate is constant and
    there is no weekday/weekend variation to speak of.
    """
    today = date(2026, 6, 15)  # June has 30 days
    records = []
    for i in range(60):
        day = today - timedelta(days=i)
        records.append(make_record("transport", "petrol_car", 20, 0.141, day.isoformat()))

    result = forecast_month(records, today, CATEGORIES)
    assert result["status"] == "ok"

    expected = round(30 * 20 * 0.141, 1)
    assert abs(result["projected"] - expected) < expected * 0.05  # within 5%


def test_forecast_walk_forward_never_uses_future_records():
    """
    The forecast for "today" must be identical whether or not records dated
    AFTER today exist in the input list - proving the function is safe to
    reuse for backtesting (evaluate_forecast.py's whole premise).
    """
    today = date(2026, 6, 15)
    history = [
        make_record("transport", "petrol_car", 20, 0.141, (today - timedelta(days=i)).isoformat())
        for i in range(45)
    ]
    future_leak = [
        make_record("transport", "petrol_car", 999, 0.141, (today + timedelta(days=i)).isoformat())
        for i in range(1, 10)
    ]

    without_future = forecast_month(history, today, CATEGORIES)
    with_future = forecast_month(history + future_leak, today, CATEGORIES)

    assert without_future == with_future


def test_forecast_days_until_budget_exhausted_when_already_over():
    today = date(2026, 6, 15)
    # Log something every day, well above budget, for 45 days
    records = [
        make_record("consumption", "electronics_item", 1, 300, (today - timedelta(days=i)).isoformat(), unit="item")
        for i in range(45)
    ]
    result = forecast_month(records, today, CATEGORIES, budget_kg=167)
    assert result["daysUntilBudgetExhausted"] == 0


# ---------------------------------------------------------------------------
# generate_swaps - the unit guard is the load-bearing test here
# ---------------------------------------------------------------------------

def test_generate_swaps_proposes_lower_factor_substitute():
    today = date(2026, 6, 15)
    records = [make_record("transport", "petrol_car", 300, 0.141, today.isoformat())]
    swaps = generate_swaps(records, FACTORS, today.year, today.month)

    assert len(swaps) > 0
    bus_swap = next(s for s in swaps if s["toSubType"] == "bus")
    assert bus_swap["factorFrom"] == 0.141
    assert bus_swap["factorTo"] == 0.082
    assert bus_swap["savingKg"] > 0
    # citations must travel with the number
    assert bus_swap["factorFromSource"] == "DEFRA 2023"
    assert bus_swap["factorToSource"] == "DEFRA 2023"


def test_generate_swaps_never_crosses_incompatible_units():
    """
    THE UNIT GUARD. If a substitute's factor were ever defined in a different
    unit (a real risk if someone edits SWAP_TABLE carelessly later), it must
    be silently skipped, never proposed - mirrors the same check in
    routes/carbon.py:203-209.
    """
    today = date(2026, 6, 15)
    records = [make_record("fuel", "lpg", 10, 2.983, today.isoformat(), unit="kg")]

    factors_with_mismatch = dict(FACTORS)
    # A deliberately bogus substitute for lpg with an incompatible unit
    factors_with_mismatch[("fuel", "petrol_generator")] = {
        "factorValue": 0.01,  # artificially tiny, so it WOULD win on savings alone
        "unit": "liter",  # but the unit does not match lpg's "kg"
        "source": "test fixture",
    }
    from insights_engine import SWAP_TABLE

    original = SWAP_TABLE.get(("fuel", "lpg"))
    SWAP_TABLE[("fuel", "lpg")] = [{"to": "petrol_generator", "feasibility": 0.5, "effort": 1}]
    try:
        swaps = generate_swaps(records, factors_with_mismatch, today.year, today.month)
    finally:
        if original is None:
            SWAP_TABLE.pop(("fuel", "lpg"), None)
        else:
            SWAP_TABLE[("fuel", "lpg")] = original

    assert swaps == []  # the mismatched-unit swap must never appear


def test_generate_swaps_ignores_higher_or_equal_factor_substitutes():
    today = date(2026, 6, 15)
    records = [make_record("diet", "vegetarian", 90, 1.7, today.isoformat(), unit="meal")]
    # vegetarian -> vegan is a real improvement (1.7 -> 1.1); the reverse never appears
    swaps = generate_swaps(records, FACTORS, today.year, today.month)
    for swap in swaps:
        assert swap["factorTo"] < swap["factorFrom"]


def test_macc_curve_is_effort_ordered_with_cumulative_total():
    today = date(2026, 6, 15)
    records = [make_record("transport", "petrol_car", 300, 0.141, today.isoformat())]
    swaps = generate_swaps(records, FACTORS, today.year, today.month)
    curve = macc_curve(swaps)

    efforts = [c["effort"] for c in curve]
    assert efforts == sorted(efforts)
    assert curve[-1]["cumulativeSavingKg"] == round(sum(s["savingKg"] for s in swaps), 2)


def test_simulate_scenario_caps_combined_fraction_at_full_origin():
    """
    Two swaps sharing the same origin (petrol_car -> bus, petrol_car ->
    bicycle) must never let the sandbox claim more than 100% of that
    month's petrol_car quantity was shifted, even if both sliders are
    pushed to 1.0 at once.
    """
    today = date(2026, 6, 15)
    records = [make_record("transport", "petrol_car", 300, 0.141, today.isoformat())]
    swaps = generate_swaps(records, FACTORS, today.year, today.month)
    swap_ids = [s["id"] for s in swaps if s["category"] == "transport"]

    result = simulate_scenario(
        records, FACTORS, today.year, today.month, {sid: 1.0 for sid in swap_ids}
    )
    # Total emission can never go negative, and the saving can never exceed
    # the full baseline (that would mean "swapping" produced negative emissions)
    assert result["projectedTotal"] >= 0
    assert result["totalSavingKg"] <= result["baselineTotal"]


# ---------------------------------------------------------------------------
# cohort k-anonymity
# ---------------------------------------------------------------------------

def test_cohort_deciles_suppressed_below_k_anonymity_floor():
    values = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0]  # n=9, below floor of 10
    assert cohort_deciles(values) is None


def test_cohort_deciles_present_at_k_anonymity_floor():
    values = list(range(1, 11))  # n=10, exactly at the floor
    aggregate = cohort_deciles(values)
    assert aggregate is not None
    assert aggregate["n"] == 10
    assert len(aggregate["deciles"]) == 9  # 10th through 90th percentile


def test_cohort_percentile_matches_expected_bucket():
    aggregate = cohort_deciles(list(range(1, 101)))  # 1..100, deciles land on round numbers
    assert cohort_percentile(5, aggregate["deciles"]) == 10
    assert cohort_percentile(100, aggregate["deciles"]) == 100
