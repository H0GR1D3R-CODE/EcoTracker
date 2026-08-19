# EcoTrack/backend/tests/test_engagement.py
"""
Unit tests for the pure streak-calculation logic in routes/engagement.py.

_compute_streak and _longest_streak take plain record lists and a date, and
do no Firestore or Flask-request work themselves - only require_auth's
decorator (never invoked here) and the route functions that call get_db()
need real credentials. Importing the module and calling these two functions
directly is therefore safe without any Firebase setup.
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.engagement import _compute_streak, _longest_streak  # noqa: E402


def _records_on(dates):
    return [{"recordedDate": d.isoformat()} for d in dates]


def test_no_history_gives_zero_streak():
    result = _compute_streak([], date(2026, 8, 19))
    assert result["currentStreak"] == 0
    assert result["longestStreak"] == 0


def test_unbroken_run_counts_every_day():
    today = date(2026, 8, 19)
    dates = [today - timedelta(days=i) for i in range(10)]  # today back 9 days, 10 in a row
    result = _compute_streak(_records_on(dates), today)
    assert result["currentStreak"] == 10
    assert result["loggedToday"] is True


def test_today_not_yet_logged_does_not_break_the_streak():
    """A day is not "missed" until it is over - if today has no entry yet,
    the walk starts at yesterday instead of counting today as a gap."""
    today = date(2026, 8, 19)
    dates = [today - timedelta(days=i) for i in range(1, 6)]  # yesterday back 5 days, NOT today
    result = _compute_streak(_records_on(dates), today)
    assert result["currentStreak"] == 5
    assert result["loggedToday"] is False


def test_single_gap_after_seven_logged_days_is_forgiven():
    """
    Logged for 7 straight days, missed exactly one day, then logged again
    today - the earned freeze should bridge that one gap so the streak
    keeps counting through it rather than resetting to 1.
    """
    today = date(2026, 8, 19)
    dates = [today]  # today
    # yesterday is the gap - skip day (today - 1)
    dates += [today - timedelta(days=i) for i in range(2, 9)]  # 7 straight days before the gap
    result = _compute_streak(_records_on(dates), today)
    assert result["currentStreak"] == 8  # today + the 7-day run, gap bridged
    assert result["freezesUsed"] == 1


def test_gap_with_no_earned_freeze_breaks_the_streak():
    """Only 3 logged days before the gap - not enough to earn a freeze - so
    the streak stops counting at the gap."""
    today = date(2026, 8, 19)
    dates = [today]
    dates += [today - timedelta(days=i) for i in range(2, 5)]  # only 3 days before the gap
    result = _compute_streak(_records_on(dates), today)
    assert result["currentStreak"] == 1  # only today counts; the gap stops the walk
    assert result["freezesUsed"] == 0


def test_longest_streak_is_independent_of_current_gap():
    today = date(2026, 8, 19)
    # A long unbroken run far in the past (15 days), then nothing recent
    old_run = [today - timedelta(days=40 + i) for i in range(15)]
    result = _compute_streak(_records_on(old_run), today)
    assert result["longestStreak"] == 15
    assert result["currentStreak"] == 0


def test_longest_streak_helper_directly():
    dates = {"2026-08-01", "2026-08-02", "2026-08-03", "2026-08-05", "2026-08-06"}
    assert _longest_streak(dates) == 3
