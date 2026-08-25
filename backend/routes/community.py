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

from config import Config, get_db
from routes import api_success

community_bp = Blueprint("community", __name__, url_prefix="/api/community")

COMMUNITY_CACHE_HOURS = 6

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
