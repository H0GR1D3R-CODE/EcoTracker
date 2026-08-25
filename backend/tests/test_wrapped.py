# EcoTrack/backend/tests/test_wrapped.py
"""
Unit tests for the pure calculation helpers in routes/wrapped.py.

Every function under test here takes plain dicts/lists and does no
Firestore or Flask-request work itself - only get_wrapped() (never invoked
here) needs real credentials. See test_engagement.py for the same rationale.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.wrapped import (  # noqa: E402
    _best_day,
    _change_percent,
    _most_improved_category,
    _period_bounds,
    _previous_period,
    _top_category,
)


def _record(category, kg, recorded_date):
    return {"category": category, "emissionKgco2": kg, "recordedDate": recorded_date}


def test_change_percent_none_when_nothing_to_compare_against():
    assert _change_percent(42.0, 0) is None


def test_change_percent_negative_is_an_improvement():
    assert _change_percent(80.0, 100.0) == -20.0


def test_top_category_picks_the_biggest_and_ignores_zeros():
    totals = {"transport": 40.0, "diet": 12.0, "waste": 0.0}
    assert _top_category(totals) == {"category": "transport", "totalKg": 40.0}


def test_top_category_none_when_nothing_logged():
    assert _top_category({"transport": 0.0, "diet": 0.0}) is None


def test_most_improved_category_requires_data_in_both_periods():
    # "waste" only exists this period - nothing to compare it against, so it
    # must never be reported as a 100% improvement over missing data.
    current = {"transport": 30.0, "diet": 10.0, "waste": 5.0}
    previous = {"transport": 50.0, "diet": 10.0}
    result = _most_improved_category(current, previous)
    assert result["category"] == "transport"
    assert result["dropPercent"] == 40.0


def test_most_improved_category_none_when_everything_got_worse():
    current = {"transport": 60.0}
    previous = {"transport": 50.0}
    assert _most_improved_category(current, previous) is None


def test_best_day_picks_the_lowest_total_not_the_lowest_single_record():
    records = [
        _record("transport", 5.0, "2026-08-01"),
        _record("diet", 1.0, "2026-08-02"),
        _record("waste", 0.5, "2026-08-02"),  # 2026-08-02 totals 1.5, still lower than 08-01
    ]
    assert _best_day(records) == {"date": "2026-08-02", "totalKg": 1.5}


def test_best_day_none_when_no_records():
    assert _best_day([]) is None


def test_period_bounds_month():
    assert _period_bounds("month", 2026, 8) == ("2026-08-01", "2026-08-31")


def test_period_bounds_year():
    assert _period_bounds("year", 2026, 8) == ("2026-01-01", "2026-12-31")


def test_previous_period_month_rolls_back_a_year_in_january():
    assert _previous_period("month", 2026, 1) == (2025, 12)


def test_previous_period_month_normal_case():
    assert _previous_period("month", 2026, 8) == (2026, 7)


def test_previous_period_year():
    assert _previous_period("year", 2026, 8) == (2025, 8)
