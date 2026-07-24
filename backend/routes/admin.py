# EcoTrack/backend/routes/admin.py
"""
Admin routes - user management and platform-wide statistics.

ROLE-BASED ACCESS CONTROL
-------------------------
Every route here uses @require_admin, which does two checks in order:
    1. Is the Firebase ID token valid?              (are you who you say you are)
    2. Does a document exist at admins/{uid}?       (are you allowed in here)

Admins are stored in their own collection rather than as an isAdmin flag on the
user document. That separation means a normal user cannot promote themselves by
editing their own profile - the admins collection is written only from the
Firebase console, never by the API.

TO CREATE YOUR FIRST ADMIN
--------------------------
There is deliberately no "make me an admin" route - that would be a security
hole. Do it by hand once:
    1. Register normally through the app
    2. Firebase Console > Authentication > copy your User UID
    3. Firestore > create collection "admins" > document id = that UID
    4. Add fields: name (string), email (string), createdAt (timestamp)

Mounted at /api/admin
"""

from datetime import date

from flask import Blueprint, g, request
from firebase_admin import auth as firebase_auth
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import (
    api_error,
    api_success,
    month_bounds,
    month_key_of,
    require_admin,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

# Firestore allows at most 500 operations in one batch
BATCH_LIMIT = 400


# ---------------------------------------------------------------------------
# Helpers used only inside this file
# ---------------------------------------------------------------------------

def _all_admin_uids():
    """The set of user ids that have admin rights."""
    db = get_db()
    return {doc.id for doc in db.collection(Config.COLLECTION_ADMINS).stream()}


def _delete_documents_where(collection_name, field, value):
    """
    Delete every document in a collection where a field matches a value.

    Used to clean up a deleted user's records, goals and reports. Deletes are
    sent in batches because Firestore rejects a batch larger than 500 writes,
    and one batch of 400 is far faster than 400 separate delete calls.

    Returns how many documents were removed.
    """
    db = get_db()
    documents = list(
        db.collection(collection_name)
        .where(filter=gcloud_firestore.FieldFilter(field, "==", value))
        .stream()
    )

    deleted = 0
    # range(start, stop, step) walks the list 400 items at a time
    for index in range(0, len(documents), BATCH_LIMIT):
        batch = db.batch()
        for doc in documents[index:index + BATCH_LIMIT]:
            batch.delete(doc.reference)
            deleted += 1
        batch.commit()  # nothing is actually deleted until this line runs

    return deleted


# ---------------------------------------------------------------------------
# GET /api/admin/users
# ---------------------------------------------------------------------------

@admin_bp.route("/users", methods=["GET"])
@require_admin
def list_users():
    """
    Every registered user, with their activity totals, for the admin table.

    Optional query parameter: ?search=aadi  (matches name or email)

    NOTE ON EFFICIENCY: this reads the carbonRecords collection once and totals
    per user in Python. The obvious alternative - one count query per user -
    would be N+1 queries and would get slower with every new signup.
    """
    search = (request.args.get("search") or "").strip().lower()

    db = get_db()
    admin_uids = _all_admin_uids()

    # One pass over all records, building per-user totals as we go
    record_counts = {}
    emission_totals = {}
    for doc in db.collection(Config.COLLECTION_CARBON_RECORDS).stream():
        data = doc.to_dict()
        uid = data.get("userId", "")
        record_counts[uid] = record_counts.get(uid, 0) + 1
        emission_totals[uid] = emission_totals.get(uid, 0.0) + float(data.get("emissionKgco2", 0))

    users = []
    for doc in db.collection(Config.COLLECTION_USERS).stream():
        data = doc.to_dict()
        name = data.get("name", "")
        email = data.get("email", "")

        # Skip anyone who does not match the search box
        if search and search not in name.lower() and search not in email.lower():
            continue

        created_at = data.get("createdAt")
        users.append({
            "uid": doc.id,
            "name": name,
            "email": email,
            "region": data.get("region", ""),
            "createdAt": created_at.isoformat() if created_at else None,
            "isAdmin": doc.id in admin_uids,
            "recordCount": record_counts.get(doc.id, 0),
            "totalEmission": round(emission_totals.get(doc.id, 0.0), 2),
        })

    # Most active users first, so the admin sees real accounts before empty ones
    users.sort(key=lambda item: item["recordCount"], reverse=True)

    return api_success({"users": users, "count": len(users)})


# ---------------------------------------------------------------------------
# GET /api/admin/stats
# ---------------------------------------------------------------------------

@admin_bp.route("/stats", methods=["GET"])
@require_admin
def platform_stats():
    """Platform-wide totals for the admin dashboard cards and charts."""
    db = get_db()
    today = date.today()
    month_start, month_end = month_bounds(today.year, today.month)
    current_month_key = f"{today.year}-{today.month:02d}"

    # --- users ---
    total_users = 0
    new_users_this_month = 0
    for doc in db.collection(Config.COLLECTION_USERS).stream():
        total_users += 1
        created_at = doc.to_dict().get("createdAt")
        # createdAt is a Firestore timestamp, so compare it as a real date
        if created_at and month_start <= created_at.date().isoformat() <= month_end:
            new_users_this_month += 1

    # --- records ---
    total_records = 0
    total_emission = 0.0
    emission_this_month = 0.0
    category_totals = {category: 0.0 for category in Config.CATEGORIES}

    for doc in db.collection(Config.COLLECTION_CARBON_RECORDS).stream():
        data = doc.to_dict()
        emission = float(data.get("emissionKgco2", 0))
        category = data.get("category", "")

        total_records += 1
        total_emission += emission
        category_totals[category] = category_totals.get(category, 0.0) + emission

        if month_key_of(data.get("recordedDate", "")) == current_month_key:
            emission_this_month += emission

    # --- goals ---
    total_goals = 0
    active_goals = 0
    achieved_goals = 0
    for doc in db.collection(Config.COLLECTION_GOALS).stream():
        total_goals += 1
        status = doc.to_dict().get("status", "")
        if status == "active":
            active_goals += 1
        elif status == "achieved":
            achieved_goals += 1

    # --- reports ---
    total_reports = sum(1 for _ in db.collection(Config.COLLECTION_REPORTS).stream())

    # The category the whole platform emits most in
    active_categories = {c: v for c, v in category_totals.items() if v > 0}
    most_common_category = (
        max(active_categories, key=lambda category: active_categories[category])
        if active_categories else None
    )

    return api_success({
        "totalUsers": total_users,
        "newUsersThisMonth": new_users_this_month,
        "totalRecords": total_records,
        "totalEmission": round(total_emission, 2),
        "emissionThisMonth": round(emission_this_month, 2),
        # Guard against dividing by zero on a brand new deployment
        "averageEmissionPerUser": (
            round(total_emission / total_users, 2) if total_users else 0.0
        ),
        "averageRecordsPerUser": (
            round(total_records / total_users, 1) if total_users else 0.0
        ),
        "totalGoals": total_goals,
        "activeGoals": active_goals,
        "achievedGoals": achieved_goals,
        # What share of finished goals were actually met
        "goalSuccessRate": (
            round((achieved_goals / total_goals) * 100, 1) if total_goals else 0.0
        ),
        "totalReports": total_reports,
        "categoryTotals": {c: round(v, 2) for c, v in category_totals.items()},
        "mostCommonCategory": most_common_category,
        "generatedAt": today.isoformat(),
    })


# ---------------------------------------------------------------------------
# DELETE /api/admin/users/<user_id>
# ---------------------------------------------------------------------------

@admin_bp.route("/users/<user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id):
    """
    Delete a user and everything belonging to them.

    This is the most destructive route in the API, so it has three guards
    before anything is removed, and it cleans up in a careful order.
    """
    # GUARD 1 - an admin deleting themselves would lock everyone out of the
    # admin dashboard if they were the only admin
    if user_id == g.uid:
        return api_error(
            "You cannot delete your own admin account.",
            400,
            code="cannot_delete_self",
        )

    # GUARD 2 - admins cannot delete each other. Removing an admin is a
    # deliberate act that should happen in the Firebase console, not from a
    # button in a web page.
    if user_id in _all_admin_uids():
        return api_error(
            "Admin accounts cannot be deleted through the API. "
            "Remove them from the admins collection in the Firebase console first.",
            403,
            code="cannot_delete_admin",
        )

    db = get_db()
    user_ref = db.collection(Config.COLLECTION_USERS).document(user_id)

    # GUARD 3 - the user has to actually exist
    if not user_ref.get().exists:
        return api_error("User not found.", 404, code="user_not_found")

    # Delete the owned data FIRST. If this failed after the profile was already
    # gone, the records would be orphaned with no way to find their owner.
    deleted_records = _delete_documents_where(
        Config.COLLECTION_CARBON_RECORDS, "userId", user_id
    )
    deleted_goals = _delete_documents_where(Config.COLLECTION_GOALS, "userId", user_id)
    deleted_reports = _delete_documents_where(Config.COLLECTION_REPORTS, "userId", user_id)

    # Then the profile document
    user_ref.delete()

    # Finally the Firebase Authentication account, so the email can be reused
    auth_deleted = True
    try:
        firebase_auth.delete_user(user_id)
    except firebase_auth.UserNotFoundError:
        # The Auth account was already gone - the Firestore data is still
        # cleaned up, so this is not a failure worth reporting as an error
        auth_deleted = False

    return api_success(
        {
            "uid": user_id,
            "deletedRecords": deleted_records,
            "deletedGoals": deleted_goals,
            "deletedReports": deleted_reports,
            "authAccountDeleted": auth_deleted,
        },
        message="User and all associated data deleted successfully.",
    )
