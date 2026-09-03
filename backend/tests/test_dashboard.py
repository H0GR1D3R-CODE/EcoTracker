# EcoTrack/backend/tests/test_dashboard.py
"""
Unit tests for the pure piece of routes/dashboard.py's summary: _best_category.
The route itself (summary) touches Firestore via fetch_user_records and is
exercised through manual/integration testing instead, the same split every
other Firestore-backed route in this backend uses - see test_household.py's
own docstring for the same reasoning.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.dashboard import _best_category  # noqa: E402


def _totals(**kwargs):
    """group_by_category always returns all seven categories - a helper to
    build that shape without repeating every category name in each test."""
    base = {"transport": 0.0, "electricity": 0.0, "fuel": 0.0, "diet": 0.0,
            "waste": 0.0, "water": 0.0, "consumption": 0.0}
    base.update(kwargs)
    return base


def test_nothing_logged_returns_none():
    assert _best_category(_totals(), _totals(), set()) is None


def test_a_genuine_zero_emission_category_still_wins_on_lowest_emissions():
    # Caught live 2026-09-03: a bicycle ride (transport, 0.0 kg CO2, real
    # and logged) used to lose Rule 2 to a 6.6 kg diet entry, because the
    # old filter (this_month_totals value > 0) could not tell "genuinely
    # zero emissions" apart from "nothing logged in this category at all" -
    # both look like 0.0 in the totals dict. categories_logged is what
    # actually distinguishes them.
    result = _best_category(
        _totals(transport=0.0, diet=6.6),
        _totals(),
        {"transport", "diet"},
    )
    assert result["category"] == "transport"
    assert result["reason"] == "lowest_emissions"
    assert result["thisMonth"] == 0.0


def test_an_untouched_category_is_never_picked_even_though_its_total_is_zero():
    # electricity was never logged this month (0.0 is the group_by_category
    # default, not a real reading) - only diet, which really was logged,
    # should ever be a candidate.
    result = _best_category(
        _totals(diet=6.6),
        _totals(),
        {"diet"},
    )
    assert result["category"] == "diet"


def test_rule_1_the_largest_reduction_beats_rule_2_lowest_emissions():
    result = _best_category(
        _totals(transport=5.0, diet=6.6),
        _totals(transport=20.0, diet=7.0),
        {"transport", "diet"},
    )
    # transport dropped 75% (20 -> 5), diet only ~5.7% (7 -> 6.6) - transport wins
    assert result["category"] == "transport"
    assert result["reason"] == "largest_reduction"
    assert result["changePercent"] == -75.0


def test_a_category_that_rose_is_never_picked_as_the_biggest_drop():
    result = _best_category(
        _totals(transport=10.0, diet=6.6),
        _totals(transport=5.0, diet=7.0),
        {"transport", "diet"},
    )
    # transport went UP (5 -> 10), so only diet's real drop counts
    assert result["category"] == "diet"
    assert result["reason"] == "largest_reduction"


def test_lowest_emissions_among_several_real_candidates():
    result = _best_category(
        _totals(transport=12.0, diet=6.6, electricity=71.0),
        _totals(),
        {"transport", "diet", "electricity"},
    )
    assert result["category"] == "diet"
    assert result["thisMonth"] == 6.6
