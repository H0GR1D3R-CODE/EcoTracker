# EcoTrack/backend/routes/community.py
"""
The public collective-impact page: aggregate totals across every EcoTrack
user, with nothing that could identify a single one of them.

WHAT MAKES THIS SAFE TO BE PUBLIC
Every figure here is a SUM or a COUNT across the whole platform - never a
single user's record, never a list of names, never anything keyed by uid.
This is the same k-anonymity spirit routes/insights.py's cohort comparison
already applies (COHORT_MIN_SIZE, never showing a lone figure) taken to its
simplest form: the denominator here is the entire user base, not a small
regional group, so there is no threshold to enforce - the aggregate itself
is the only thing ever returned.

WHY CACHED
A full scan of carbonRecords and interventions is the same cost as
routes/admin.py's own platform_stats - fine for an admin console gated
behind a login, not fine to re-run on every anonymous page load of a public
page. Cached in Firestore for COMMUNITY_CACHE_HOURS, refreshed lazily by
whichever request happens to find it stale - the same "Firestore as shared
cache" pattern routes/insights.py's cohort stats already use.

Mounted at /api/community
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_success

community_bp = Blueprint("community", __name__, url_prefix="/api/community")

COMMUNITY_CACHE_HOURS = 6
LEADERBOARD_CACHE_HOURS = 1
LEADERBOARD_SIZE = 50

# US Forest Service: a mature tree absorbs roughly 21 kg CO2 per year - the
# same figure frontend/src/components/ImpactEquivalents.jsx and
# frontend/src/utils/emissionHelpers.js already use, kept in sync by value
# rather than a shared import, the same way MONTHLY_BUDGET_KG and the CEA
# electricity factor are independently defined in both languages elsewhere
# in this codebase.
TREE_KG_ABSORBED_PER_YEAR = 21.0

COMMUNITY_STATS_DOC_ID = "global"


def _compute_community_stats():
    db = get_db()

    total_users = sum(1 for _ in db.collection(Config.COLLECTION_USERS).stream())

    total_entries = 0
    total_emission_kg = 0.0
    category_totals = {category: 0.0 for category in Config.CATEGORIES}
    for doc in db.collection(Config.COLLECTION_CARBON_RECORDS).stream():
        data = doc.to_dict()
        emission = float(data.get("emissionKgco2", 0) or 0)
        category = data.get("category", "")
        total_entries += 1
        total_emission_kg += emission
        if category in category_totals:
            category_totals[category] += emission

    # A real, already-logged number - not a projection dressed up as a
    # result. Only interventions someone actually accepted count, the same
    # "accepted" action engagement.py's own PATCH /interventions/<id> records.
    accepted_count = 0
    total_saved_kg = 0.0
    for doc in db.collection(Config.COLLECTION_INTERVENTIONS).stream():
        data = doc.to_dict()
        if data.get("action") != "accepted":
            continue
        accepted_count += 1
        saving = data.get("projectedSavingKg")
        if isinstance(saving, (int, float)):
            total_saved_kg += saving

    stats = {
        "totalUsers": total_users,
        "totalEntriesLogged": total_entries,
        "totalEmissionKg": round(total_emission_kg, 1),
        "categoryBreakdownKg": {k: round(v, 1) for k, v in category_totals.items()},
        "recommendationsAccepted": accepted_count,
        "totalPotentialSavingKg": round(total_saved_kg, 1),
        "treeYearsEquivalent": round(total_emission_kg / TREE_KG_ABSORBED_PER_YEAR, 0),
        "computedAt": datetime.now(timezone.utc),
    }

    db.collection("communityStats").document(COMMUNITY_STATS_DOC_ID).set(stats)
    return stats


@community_bp.route("/impact", methods=["GET"])
def get_impact():
    """Public - no @require_auth. See module docstring for why this is safe."""
    db = get_db()
    doc = db.collection("communityStats").document(COMMUNITY_STATS_DOC_ID).get()
    stats = doc.to_dict() if doc.exists else None

    stale = True
    if stats:
        computed_at = stats.get("computedAt")
        stale = (not computed_at) or (
            datetime.now(timezone.utc) - computed_at > timedelta(hours=COMMUNITY_CACHE_HOURS)
        )

    if stats is None or stale:
        stats = _compute_community_stats()

    stats = {k: v for k, v in stats.items() if k != "computedAt"}
    return api_success(stats)


# ---------------------------------------------------------------------------
# GET /api/community/leaderboard        (PUBLIC - opt-in only, no token required)
# ---------------------------------------------------------------------------

LEADERBOARD_DOC_ID = "leaderboard"


def _display_name(user_data):
    """
    An opted-in alias if one was set, otherwise a first-name-plus-initial
    fallback built from the real name - never the full name unmasked. See
    routes/auth.py's update_profile for where leaderboardAlias is set: it is
    a SEPARATE opt-in from leaderboardOptIn itself, so leaving it blank must
    not fall back to publishing a full real name to a logged-out visitor.
    """
    alias = (user_data.get("leaderboardAlias") or "").strip()
    if alias:
        return alias

    name = (user_data.get("name") or "").strip()
    if not name:
        return "EcoTrack member"

    parts = name.split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


def _compute_leaderboard():
    db = get_db()
    # Imported here rather than at module load time to match the existing
    # convention (household.py imports the same helper from engagement.py
    # at its own top level; kept local here only because community.py and
    # engagement.py have no other reason to know about each other).
    from routes.engagement import _tree_progress

    entries = []
    total_opted_in = 0
    for doc in (
        db.collection(Config.COLLECTION_USERS)
        .where(filter=gcloud_firestore.FieldFilter("leaderboardOptIn", "==", True))
        .stream()
    ):
        data = doc.to_dict() or {}
        total_opted_in += 1
        points = data.get("rewardPoints", 0)
        # Someone who opted in but has never earned a point yet would only
        # ever sit at the bottom of a long tie, so they are left off the
        # RANKED list (though still counted in totalOptedIn above) rather
        # than padding entries with zero-point rows - the same reasoning
        # community.py's own aggregate stats keep to real, already-happened
        # activity rather than potential activity.
        if not points:
            continue
        entries.append({
            "displayName": _display_name(data),
            "rewardPoints": points,
            "stageLabel": _tree_progress(points)["stageLabel"],
        })

    entries.sort(key=lambda entry: entry["rewardPoints"], reverse=True)
    top = entries[:LEADERBOARD_SIZE]

    result = {
        "entries": top,
        "totalOptedIn": total_opted_in,
        "computedAt": datetime.now(timezone.utc),
    }
    db.collection("communityStats").document(LEADERBOARD_DOC_ID).set(result)
    return result


@community_bp.route("/leaderboard", methods=["GET"])
def get_leaderboard():
    """Public - no @require_auth. Only ever shows users who explicitly set
    leaderboardOptIn (see routes/auth.py's update_profile), and only their
    alias (or a masked first-name-plus-initial) and lifetime points - never
    an email, region, or anything else from their profile."""
    db = get_db()
    doc = db.collection("communityStats").document(LEADERBOARD_DOC_ID).get()
    result = doc.to_dict() if doc.exists else None

    stale = True
    if result:
        computed_at = result.get("computedAt")
        stale = (not computed_at) or (
            datetime.now(timezone.utc) - computed_at > timedelta(hours=LEADERBOARD_CACHE_HOURS)
        )

    if result is None or stale:
        result = _compute_leaderboard()

    result = {k: v for k, v in result.items() if k != "computedAt"}
    return api_success(result)


# ---------------------------------------------------------------------------
# GET /api/community/journey/<uid>        (PUBLIC - opt-in only, no token required)
# ---------------------------------------------------------------------------

@community_bp.route("/journey/<uid>", methods=["GET"])
def get_journey(uid):
    """
    A shareable "my climate journey" page - one user's badges, streak and
    tree stage, at a stable URL anyone can open without signing in. A
    separate opt-in from the leaderboard (routes/auth.py's
    publicProfileOptIn), so someone can have one without the other.

    404, NOT 403, WHEN NOT OPTED IN
    Returning "forbidden" for a real uid that has not opted in would still
    confirm that uid belongs to a real account - the same reasoning
    routes/auth.py's forgot-password route already applies to email
    enumeration. A uid that does not exist and a uid that exists but is
    private both get the identical "not found" response.
    """
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()

    if not user_doc.exists or not user_doc.to_dict().get("publicProfileOptIn"):
        return api_error("This journey page does not exist or is not public.", 404, code="journey_not_found")

    user_data = user_doc.to_dict()

    # Imported here for the same reason _compute_leaderboard imports
    # _tree_progress locally above - no other reason for this file to know
    # about engagement.py or achievements.py at module load time.
    from routes.achievements import compute_achievements

    achievements = compute_achievements(uid)
    created_at = user_data.get("createdAt")

    return api_success({
        "displayName": _display_name(user_data),
        # Year and month only, never the exact day - a stable, low-
        # resolution "how long they have been tracking" fact rather than a
        # precise timestamp a stranger has no reason to see.
        "memberSince": created_at.strftime("%Y-%m") if created_at else None,
        "stageLabel": achievements["tree"]["stageLabel"],
        "stageIndex": achievements["tree"]["stageIndex"],
        "treesGrown": achievements["tree"]["treesGrown"],
        "currentTreePoints": achievements["tree"]["currentTreePoints"],
        "pointsPerTree": achievements["tree"]["pointsPerTree"],
        "longestStreak": achievements["longestStreak"],
        "totalEntriesLogged": achievements["totalRecords"],
        "badges": achievements["badges"],
        "unlockedCount": achievements["unlockedCount"],
        "totalCount": achievements["totalCount"],
    })
