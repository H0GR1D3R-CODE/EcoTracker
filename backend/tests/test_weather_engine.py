# EcoTrack/backend/tests/test_weather_engine.py
"""
Unit tests for weather_engine.py - pure functions, no Firestore, no network,
same reasoning as test_insights_engine.py's own docstring.
"""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from weather_engine import (  # noqa: E402
    daily_cooling_degree_days,
    monthly_cdd_totals,
    monthly_mean_temp,
    weather_adjusted_electricity,
    weather_context,
)


def test_cdd_floors_at_zero_below_base_temp():
    series = [(date(2026, 8, 1), 20.0), (date(2026, 8, 2), 30.0)]
    result = daily_cooling_degree_days(series, base_temp_c=24.0)
    assert result[0] == (date(2026, 8, 1), 0.0)  # below base -> zero, not negative
    assert result[1] == (date(2026, 8, 2), 6.0)


def test_monthly_cdd_totals_groups_by_calendar_month():
    daily_cdd = [
        (date(2026, 7, 30), 5.0),
        (date(2026, 7, 31), 5.0),
        (date(2026, 8, 1), 3.0),
        (date(2026, 8, 2), 3.0),
    ]
    totals = monthly_cdd_totals(daily_cdd)
    assert totals == {"2026-07": 10.0, "2026-08": 6.0}


def test_monthly_mean_temp_averages_correctly():
    series = [(date(2026, 8, 1), 20.0), (date(2026, 8, 2), 24.0)]
    assert monthly_mean_temp(series) == {"2026-08": 22.0}


def test_weather_context_computes_percent_change_between_months():
    context = weather_context(
        electricity_by_month={"2026-08": 40.0, "2026-07": 30.0},
        cdd_by_month={"2026-08": 60.0, "2026-07": 40.0},
        temp_by_month={"2026-08": 27.0, "2026-07": 25.0},
        this_month="2026-08",
        previous_month="2026-07",
    )
    assert context["cddDeltaPercent"] == 50.0  # 60 vs 40 -> +50%
    assert context["thisMonth"]["electricityKg"] == 40.0
    assert context["previousMonth"]["cdd"] == 40.0


def test_weather_context_returns_none_without_both_months_of_weather():
    context = weather_context(
        electricity_by_month={"2026-08": 40.0},
        cdd_by_month={"2026-08": 60.0},  # previous month never fetched
        temp_by_month={"2026-08": 27.0},
        this_month="2026-08",
        previous_month="2026-07",
    )
    assert context is None


def test_weather_context_handles_zero_previous_cdd_without_dividing_by_zero():
    context = weather_context(
        electricity_by_month={"2026-08": 40.0, "2026-01": 5.0},
        cdd_by_month={"2026-08": 60.0, "2026-01": 0.0},
        temp_by_month={"2026-08": 27.0, "2026-01": 18.0},
        this_month="2026-08",
        previous_month="2026-01",
    )
    assert context["cddDeltaPercent"] is None  # undefined, not a fake number


def test_weather_adjusted_electricity_needs_minimum_months():
    result = weather_adjusted_electricity(
        electricity_by_month={"2026-07": 30.0, "2026-08": 40.0},
        cdd_by_month={"2026-07": 40.0, "2026-08": 60.0},
    )
    assert result is None  # only 2 months, MIN_MONTHS_FOR_REGRESSION is 3


def test_weather_adjusted_electricity_needs_real_cdd_spread():
    # Three months, but the weather barely varied - a fit here would be noise
    result = weather_adjusted_electricity(
        electricity_by_month={"2026-06": 30.0, "2026-07": 31.0, "2026-08": 29.0},
        cdd_by_month={"2026-06": 50.0, "2026-07": 51.0, "2026-08": 49.0},
    )
    assert result is None


def test_weather_adjusted_electricity_fits_a_clean_linear_relationship():
    # Constructed so electricity_kg = 2*cdd + 5 exactly - a perfect fit
    # should recover slope=2, intercept=5, r2=1.0
    cdd_by_month = {"2026-05": 10.0, "2026-06": 30.0, "2026-07": 50.0, "2026-08": 70.0}
    electricity_by_month = {m: 2 * cdd + 5 for m, cdd in cdd_by_month.items()}

    result = weather_adjusted_electricity(electricity_by_month, cdd_by_month)

    assert result is not None
    assert result["slope"] == 2.0
    assert result["intercept"] == 5.0
    assert result["r2"] == 1.0
    assert result["months"] == ["2026-05", "2026-06", "2026-07", "2026-08"]


def test_weather_adjusted_electricity_only_uses_months_present_in_both():
    # January has electricity but no fetched weather; September has weather
    # but the user logged no electricity that month - neither should count
    electricity_by_month = {
        "2026-01": 999.0,  # no matching weather - must be excluded
        "2026-05": 15.0,
        "2026-06": 35.0,
        "2026-07": 55.0,
    }
    cdd_by_month = {
        "2026-05": 10.0,
        "2026-06": 30.0,
        "2026-07": 50.0,
        "2026-09": 999.0,  # no matching electricity - must be excluded
    }

    result = weather_adjusted_electricity(electricity_by_month, cdd_by_month)

    assert result is not None
    assert result["months"] == ["2026-05", "2026-06", "2026-07"]
