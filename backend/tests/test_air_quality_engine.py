# EcoTrack/backend/tests/test_air_quality_engine.py
"""
Unit tests for air_quality_engine.py - framework-free, same rationale as
test_grid_engine.py (no Firestore/HTTP call is made from this module
itself; routes/insights.py owns fetching the reading, this module only
ever classifies a number already in hand).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from air_quality_engine import (  # noqa: E402
    AQI_NUDGE_THRESHOLD,
    air_quality_advice,
    classify_aqi,
)


def test_classify_aqi_bands_match_the_epa_breakpoints():
    assert classify_aqi(0) == ("good", "Good")
    assert classify_aqi(50) == ("good", "Good")
    assert classify_aqi(51) == ("moderate", "Moderate")
    assert classify_aqi(100) == ("moderate", "Moderate")
    assert classify_aqi(101) == ("unhealthy_sensitive", "Unhealthy for sensitive groups")
    assert classify_aqi(151) == ("unhealthy", "Unhealthy")
    assert classify_aqi(201) == ("very_unhealthy", "Very unhealthy")
    assert classify_aqi(301) == ("hazardous", "Hazardous")


def test_classify_aqi_above_the_scale_still_returns_hazardous_not_an_error():
    assert classify_aqi(650) == ("hazardous", "Hazardous")


def test_advice_below_the_nudge_threshold_says_nothing_to_change():
    result = air_quality_advice(AQI_NUDGE_THRESHOLD - 1, 12.0)
    assert result["worthANudge"] is False
    assert result["category"] == "moderate"


def test_advice_at_and_above_the_nudge_threshold_is_worth_a_nudge():
    result = air_quality_advice(AQI_NUDGE_THRESHOLD, 40.0)
    assert result["worthANudge"] is True
    assert result["category"] == "unhealthy_sensitive"
    assert result["advice"]  # non-empty, real copy


def test_advice_carries_the_raw_reading_through_unchanged():
    result = air_quality_advice(180, 65.4)
    assert result["aqi"] == 180
    assert result["pm25"] == 65.4
