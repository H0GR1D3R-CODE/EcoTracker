# EcoTrack/backend/tests/test_assistant_plan.py
"""
Unit tests for the pure reduction-percent maths behind POST /api/assistant/
plan (routes/assistant.py). _reduction_percent_for is the only piece of that
route's number-crunching that touches no Firestore - the route itself, and
_plan_candidates around it, need real credentials and are exercised through
manual/integration testing instead, the same split test_engagement.py and
test_wrapped.py already use for their own Firestore-backed routes.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.assistant import (  # noqa: E402
    MIN_REDUCTION_PERCENT,
    PLAN_REDUCTION_CAP_PERCENT,
    _reduction_percent_for,
)


def test_reduction_percent_matches_the_real_achievable_saving():
    # 10 kg achievable out of a 50 kg baseline is a genuine 20% cut
    assert _reduction_percent_for(10.0, 50.0) == 20


def test_reduction_percent_never_goes_below_the_floor():
    # A tiny real saving still must not round down to 0% - goals.py itself
    # rejects a reduction below MIN_REDUCTION_PERCENT.
    assert _reduction_percent_for(0.1, 100.0) == MIN_REDUCTION_PERCENT


def test_reduction_percent_never_exceeds_the_ambition_cap():
    # An achievable saving bigger than the whole baseline must still cap at
    # PLAN_REDUCTION_CAP_PERCENT, not suggest "eliminate this category".
    assert _reduction_percent_for(80.0, 50.0) == PLAN_REDUCTION_CAP_PERCENT


def test_reduction_percent_handles_a_zero_baseline_without_dividing_by_zero():
    assert _reduction_percent_for(5.0, 0.0) == MIN_REDUCTION_PERCENT
