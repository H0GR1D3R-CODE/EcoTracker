# EcoTrack/backend/tests/test_grid_engine.py
"""
Unit tests for grid_engine.py - framework-free, so these run with no
Firestore or Flask setup, same rationale as test_weather_engine.py if one
exists, or insights_engine's own tests otherwise.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from grid_engine import (  # noqa: E402
    HIGH_SOLAR_MULTIPLIERS,
    OTHER_MULTIPLIERS,
    day_part_for_hour,
    grid_intensity_now,
    multipliers_for_region,
)


def test_day_part_boundaries():
    assert day_part_for_hour(6) == "night"
    assert day_part_for_hour(7) == "day"
    assert day_part_for_hour(16) == "day"
    assert day_part_for_hour(17) == "eveningPeak"
    assert day_part_for_hour(21) == "eveningPeak"
    assert day_part_for_hour(22) == "night"
    assert day_part_for_hour(23) == "night"
    assert day_part_for_hour(0) == "night"


def test_multipliers_by_region_tier():
    assert multipliers_for_region("Karnataka") == HIGH_SOLAR_MULTIPLIERS
    assert multipliers_for_region("Bihar") == OTHER_MULTIPLIERS
    assert multipliers_for_region("India") == OTHER_MULTIPLIERS
    assert multipliers_for_region("Some Unknown Region") == OTHER_MULTIPLIERS


def test_grid_intensity_during_evening_peak_flags_a_real_saving():
    result = grid_intensity_now("Karnataka", 19)  # 7pm - evening peak
    assert result["currentPart"] == "eveningPeak"
    assert result["cleanestPart"] == "day"
    assert result["isCurrentlyCleanest"] is False
    assert result["potentialSavingPercent"] > 0


def test_grid_intensity_during_the_cleanest_part_flags_nothing_to_change():
    result = grid_intensity_now("Karnataka", 12)  # midday - the cleanest band
    assert result["currentPart"] == "day"
    assert result["isCurrentlyCleanest"] is True
    assert result["potentialSavingPercent"] == 0


def test_effective_factor_is_the_base_factor_scaled_by_the_multiplier():
    result = grid_intensity_now("Bihar", 19)
    expected = round(0.710 * OTHER_MULTIPLIERS["eveningPeak"], 3)
    assert result["effectiveFactorKgPerKwh"] == expected
