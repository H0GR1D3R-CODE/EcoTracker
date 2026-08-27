# EcoTrack/backend/routes/achievements.py
"""
A trophy wall over data this backend already tracks - not a new reward
system of its own. Every badge here reads from a signal that ALREADY has a
real, honest source elsewhere (rewardPoints from engagement.py, streaks from
the same, learnCompletedModules from learn.py, goal status from goals.py,
householdId from household.py, a real Razorpay-verified row in
payments.py's donations collection) rather than inventing new state to
track. That is a deliberate constraint: a badge that could be unlocked by
writing to Firestore directly (bypassing the real action it claims to
represent) would be worth nothing.

WHY THIS IS ITS OWN FILE RATHER THAN FOLDED INTO engagement.py
engagement.py already owns points, streaks and challenges - the systems a
badge here reads FROM. Keeping the read-only rollup in its own file makes it
obvious this route never writes anything back to those systems; it only
observes them.

Mounted at /api/achievements
"""

from datetime import date, timedelta

from flask import Blueprint, g
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_success, fetch_user_records, require_auth
from routes.engagement import STREAK_LOOKBACK_DAYS, _compute_streak, _tree_progress

achievements_bp = Blueprint("achievements", __name__, url_prefix="/api/achievements")

VALID_LEARN_MODULES = {"transport", "electricity", "diet", "consumption"}


def _badge(key, label, description, unlocked, progress_text=None):
    """One badge's shape, kept identical across every entry below so the
    frontend never has to special-case one badge's fields against another's."""
    return {
        "key": key,
        "label": label,
        "description": description,
        "unlocked": unlocked,
        "progressText": progress_text,
    }


def compute_achievements(uid):
    """
    The actual badge computation, factored out of the route below so
    routes/community.py's public journey page can reuse the identical
    logic for an arbitrary (opted-in) uid rather than a second, driftable
    copy of it. Not decorated, not gated - the CALLER decides who is
    allowed to ask for which uid's badges; this function just computes them.
    """
    db = get_db()

    # --- logging volume ---
    window_start = (date.today() - timedelta(days=STREAK_LOOKBACK_DAYS)).isoformat()
    records = fetch_user_records(uid, start_date=window_start)
    # fetch_user_records only looks back STREAK_LOOKBACK_DAYS (120 days) -
    # fine for the streak maths it was built for, but "how many entries has
    # this account EVER logged" needs the full, unbounded history, so this
    # one query is separate rather than reusing the windowed fetch above.
    total_records = sum(
        1
        for _ in db.collection(Config.COLLECTION_CARBON_RECORDS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .stream()
    )

    streak_info = _compute_streak(records, date.today())
    longest_streak = streak_info["longestStreak"]

    # --- points / tree ---
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    user_data = user_doc.to_dict() if user_doc.exists else {}
    tree = _tree_progress(user_data.get("rewardPoints", 0))

    # --- learn modules ---
    completed_modules = set(user_data.get("learnCompletedModules", [])) & VALID_LEARN_MODULES

    # --- household ---
    in_household = bool(user_data.get("householdId"))

    # --- goals ---
    goals_achieved = sum(
        1
        for doc in db.collection(Config.COLLECTION_GOALS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .stream()
        if doc.to_dict().get("status") == "achieved"
    )

    # --- donations ---
    # "donations", not a Config.COLLECTION_* constant - payments.py defines
    # this collection name locally (COLLECTION_DONATIONS) rather than in
    # config.py, so this matches that string directly.
    has_donated = any(
        True
        for _ in db.collection("donations")
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .limit(1)
        .stream()
    )

    badges = [
        _badge(
            "first_log", "First step", "Log your first activity",
            total_records >= 1,
        ),
        _badge(
            "century_club", "Century club", "Log 100 activities",
            total_records >= 100,
            f"{min(total_records, 100)}/100 logged",
        ),
        _badge(
            "week_warrior", "Week warrior", "Reach a 7-day logging streak",
            longest_streak >= 7,
            f"Best streak: {longest_streak} day{'s' if longest_streak != 1 else ''}",
        ),
        _badge(
            "month_master", "Month master", "Reach a 30-day logging streak",
            longest_streak >= 30,
            f"Best streak: {longest_streak} day{'s' if longest_streak != 1 else ''}",
        ),
        _badge(
            "first_tree", "First tree grown", "Earn enough points to grow a full tree",
            tree["treesGrown"] >= 1 or tree["isFullyGrown"],
            f"{tree['currentTreePoints']}/{tree['pointsPerTree']} points",
        ),
        _badge(
            "climate_literate", "Climate literate", "Complete every Learn module",
            len(completed_modules) == len(VALID_LEARN_MODULES),
            f"{len(completed_modules)}/{len(VALID_LEARN_MODULES)} modules",
        ),
        _badge(
            "team_player", "Team player", "Join or start a household",
            in_household,
        ),
        _badge(
            "goal_getter", "Goal getter", "Achieve a personal reduction goal",
            goals_achieved >= 1,
            f"{goals_achieved} achieved" if goals_achieved else None,
        ),
        _badge(
            "supporter", "Supporter", "Make a donation through EcoTrack",
            has_donated,
        ),
    ]

    unlocked_count = sum(1 for b in badges if b["unlocked"])

    return {
        "badges": badges,
        "unlockedCount": unlocked_count,
        "totalCount": len(badges),
        # Returned for callers that need it too (routes/community.py's
        # journey page shows streak/tree/entry stats alongside badges) so
        # they do not have to recompute _tree_progress/_compute_streak a
        # second time for the same uid.
        "longestStreak": longest_streak,
        "totalRecords": total_records,
        "tree": tree,
    }


@achievements_bp.route("", methods=["GET"])
@require_auth
def get_achievements():
    return api_success(compute_achievements(g.uid))
