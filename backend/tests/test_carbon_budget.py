# EcoTrack/backend/tests/test_carbon_budget.py
"""
Unit tests for carbon_budget.py's glidepath - framework-free, same
rationale as test_grid_engine.py and test_weather_engine.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from carbon_budget import (  # noqa: E402
    BUDGET_END_ANNUAL_KG,
    BUDGET_END_YEAR,
    BUDGET_START_ANNUAL_KG,
    BUDGET_START_YEAR,
    annual_budget_kg_for_year,
)


def test_before_the_start_year_is_held_flat_at_the_start_value():
    assert annual_budget_kg_for_year(2020) == BUDGET_START_ANNUAL_KG
    assert annual_budget_kg_for_year(BUDGET_START_YEAR) == BUDGET_START_ANNUAL_KG


def test_after_the_end_year_is_held_flat_at_the_end_value():
    assert annual_budget_kg_for_year(BUDGET_END_YEAR) == BUDGET_END_ANNUAL_KG
    assert annual_budget_kg_for_year(2040) == BUDGET_END_ANNUAL_KG


def test_a_year_inside_the_window_is_a_straight_line_interpolation():
    span_years = BUDGET_END_YEAR - BUDGET_START_YEAR
    sample_year = BUDGET_START_YEAR + 2  # some year strictly inside the window
    progress = (sample_year - BUDGET_START_YEAR) / span_years
    expected = BUDGET_START_ANNUAL_KG + (BUDGET_END_ANNUAL_KG - BUDGET_START_ANNUAL_KG) * progress
    assert annual_budget_kg_for_year(sample_year) == expected


def test_the_glidepath_only_ever_moves_downward():
    # Never a claim about the exact slope (see this module's own docstring)
    # - just that every later year in the window is never a HARDER-than-
    # false-hope, upward-revised target than the year before it.
    values = [annual_budget_kg_for_year(year) for year in range(BUDGET_START_YEAR, BUDGET_END_YEAR + 1)]
    assert values == sorted(values, reverse=True)


def test_monthly_is_exactly_annual_over_twelve():
    from carbon_budget import CURRENT_ANNUAL_BUDGET_KG, CURRENT_MONTHLY_BUDGET_KG
    assert CURRENT_MONTHLY_BUDGET_KG == CURRENT_ANNUAL_BUDGET_KG / 12
