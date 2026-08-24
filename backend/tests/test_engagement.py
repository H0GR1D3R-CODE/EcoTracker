# EcoTrack/backend/tests/test_engagement.py
"""
Unit tests for the pure streak-calculation and tree-reward logic in
routes/engagement.py.

_compute_streak, _longest_streak and _tree_progress take plain values and do
no Firestore or Flask-request work themselves - only require_auth's
decorator (never invoked here) and the route functions that call get_db()
need real credentials. Importing the module and calling these functions
directly is therefore safe without any Firebase setup.
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.engagement import (  # noqa: E402
    POINTS_PER_TREE,
    _compute_streak,
    _longest_streak,
    _tree_progress,
)


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


# ---------------------------------------------------------------------------
# _tree_progress - the points/tree-growth reward, see engagement.py's own
# module docstring for why this is a growing tree and not a wallet.
# ---------------------------------------------------------------------------

def test_tree_progress_starts_at_seed():
    result = _tree_progress(0)
    assert result["stageKey"] == "seed"
    assert result["treesGrown"] == 0
    assert result["pointsToNextStage"] == 50  # sprout's threshold


def test_tree_progress_one_claim_reaches_sprout():
    result = _tree_progress(50)
    assert result["stageKey"] == "sprout"
    assert result["isFullyGrown"] is False


def test_tree_progress_reaches_full_banyan_at_exactly_the_threshold():
    result = _tree_progress(POINTS_PER_TREE)
    assert result["stageKey"] == "banyan"
    assert result["isFullyGrown"] is True
    assert result["pointsToNextStage"] == 0
    # Shown AS the completed banyan, not reset to an empty new seed - see
    # _tree_progress's own docstring for the bug this caught live. Nothing
    # is "behind" this tree yet - it IS the current one, fully grown.
    assert result["treesGrown"] == 0
    assert result["currentTreePoints"] == POINTS_PER_TREE


def test_tree_progress_wraps_into_a_second_tree_rather_than_capping():
    result = _tree_progress(POINTS_PER_TREE + 50)
    assert result["treesGrown"] == 1
    assert result["stageKey"] == "sprout"  # the second tree's own growth, from its own seed
    assert result["currentTreePoints"] == 50


def test_tree_progress_between_stages_reports_the_lower_one():
    # 200 points sits between sapling's 150 and young_tree's 300
    result = _tree_progress(200)
    assert result["stageKey"] == "sapling"
    assert result["nextStageLabel"] == "Young tree"
    assert result["pointsToNextStage"] == 100
