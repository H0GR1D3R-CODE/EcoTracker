# EcoTrack/backend/tests/test_community.py
"""
Unit tests for the pure pieces of routes/community.py. The Firestore-backed
routes themselves (get_impact, get_leaderboard) are exercised through
manual/integration testing instead, the same split every other Firestore-
backed route in this backend uses - see test_household.py's own docstring
for the same reasoning.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.community import _display_name  # noqa: E402


def test_display_name_prefers_the_alias_when_set():
    assert _display_name({"leaderboardAlias": "EcoWarrior", "name": "Aadi Sharma"}) == "EcoWarrior"


def test_display_name_falls_back_to_first_name_plus_initial():
    assert _display_name({"name": "Aadi Sharma"}) == "Aadi S."


def test_display_name_handles_a_single_word_name():
    assert _display_name({"name": "Aadi"}) == "Aadi"


def test_display_name_handles_a_middle_name_by_using_the_last_word():
    assert _display_name({"name": "Aadi Kumar Sharma"}) == "Aadi S."


def test_display_name_never_returns_blank():
    assert _display_name({}) == "EcoTrack member"
    assert _display_name({"name": "   "}) == "EcoTrack member"


def test_display_name_trims_whitespace_around_the_alias():
    assert _display_name({"leaderboardAlias": "  EcoWarrior  "}) == "EcoWarrior"
