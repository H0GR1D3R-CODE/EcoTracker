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

from datetime import date, datetime, timezone

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


# ---------------------------------------------------------------------------
# GET /api/admin/users/<user_id>  - full detail + activity for one user
# ---------------------------------------------------------------------------

@admin_bp.route("/users/<user_id>", methods=["GET"])
@require_admin
def user_detail(user_id):
    """
    Everything EcoTrack knows about one user, for the admin's per-user
    drill-down: their profile, every carbon record they have logged, every
    goal they have set and every report they have generated - plus totals.

    This is READ-ONLY. It changes nothing; it just gathers what already exists
    so an admin can see a member's full activity in one place. It shares the
    /users/<user_id> path with the DELETE route above - Flask routes them apart
    by HTTP method, so GET lands here and DELETE lands on delete_user.
    """
    db = get_db()

    user_doc = db.collection(Config.COLLECTION_USERS).document(user_id).get()
    if not user_doc.exists:
        return api_error("User not found.", 404, code="user_not_found")

    user_data = user_doc.to_dict()
    created_at = user_data.get("createdAt")

    # --- carbon records: the activity the user has actually logged ---
    records = []
    category_totals = {}
    total_emission = 0.0
    for doc in (
        db.collection(Config.COLLECTION_CARBON_RECORDS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", user_id))
        .stream()
    ):
        data = doc.to_dict()
        emission = float(data.get("emissionKgco2", 0))
        category = data.get("category", "")
        total_emission += emission
        category_totals[category] = category_totals.get(category, 0.0) + emission

        record_created = data.get("createdAt")
        records.append({
            "id": doc.id,
            "category": category,
            "subType": data.get("subType", ""),
            "quantity": data.get("quantity", 0),
            "unit": data.get("unit", ""),
            "emissionKgco2": round(emission, 2),
            "recordedDate": data.get("recordedDate", ""),
            "createdAt": record_created.isoformat() if record_created else None,
        })

    # Newest logged day first
    records.sort(key=lambda item: item["recordedDate"] or "", reverse=True)

    # --- goals the user has set ---
    goals = []
    for doc in (
        db.collection(Config.COLLECTION_GOALS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", user_id))
        .stream()
    ):
        data = doc.to_dict()
        baseline = float(data.get("baselineEmission", 0))
        reduction = float(data.get("targetReductionPercent", 0))
        goal_created = data.get("createdAt")
        goals.append({
            "id": doc.id,
            "category": data.get("category", ""),
            "baselineEmission": round(baseline, 2),
            "targetReductionPercent": reduction,
            "targetEmission": round(baseline * (1 - reduction / 100), 2),
            "targetDate": data.get("targetDate", ""),
            "status": data.get("status", "active"),
            "createdAt": goal_created.isoformat() if goal_created else None,
        })

    goals.sort(key=lambda item: item["createdAt"] or "", reverse=True)

    # --- reports the user has generated ---
    reports = []
    for doc in (
        db.collection(Config.COLLECTION_REPORTS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", user_id))
        .stream()
    ):
        data = doc.to_dict()
        report_created = data.get("createdAt")
        reports.append({
            "id": doc.id,
            "reportType": data.get("reportType", ""),
            "periodStart": data.get("periodStart", ""),
            "periodEnd": data.get("periodEnd", ""),
            "createdAt": report_created.isoformat() if report_created else None,
        })

    reports.sort(key=lambda item: item["createdAt"] or "", reverse=True)

    # --- headline figures for the detail header ---
    active_categories = {c: round(v, 2) for c, v in category_totals.items() if v > 0}
    most_common_category = (
        max(active_categories, key=lambda category: active_categories[category])
        if active_categories else None
    )
    recorded_dates = [item["recordedDate"] for item in records if item["recordedDate"]]

    # --- account-level facts straight from Firebase Authentication ---
    # This is the "who is this account" layer: when it was created, when they
    # last signed in, whether the email is verified, and how they sign in.
    def _ms_to_iso(ms):
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat() if ms else None

    account = None
    try:
        user_record = firebase_auth.get_user(user_id)
        meta = user_record.user_metadata
        account = {
            "emailVerified": user_record.email_verified,
            "disabled": user_record.disabled,
            "accountCreated": _ms_to_iso(meta.creation_timestamp),
            "lastSignIn": _ms_to_iso(meta.last_sign_in_timestamp),
            "lastRefresh": _ms_to_iso(meta.last_refresh_timestamp),
            "providers": [p.provider_id for p in (user_record.provider_data or [])],
        }
    except Exception:
        # The Firestore profile can outlive its Auth account; that is not fatal.
        account = None

    # --- any feedback this user has submitted (matched on their email) ---
    user_feedback = []
    user_email = user_data.get("email", "")
    if user_email:
        for doc in (
            db.collection(COLLECTION_FEEDBACK)
            .where(filter=gcloud_firestore.FieldFilter("email", "==", user_email))
            .stream()
        ):
            data = doc.to_dict()
            fb_created = data.get("createdAt")
            user_feedback.append({
                "id": doc.id,
                "message": data.get("message", ""),
                "rating": data.get("rating"),
                "createdAt": fb_created.isoformat() if fb_created else None,
            })
        user_feedback.sort(key=lambda item: item["createdAt"] or "", reverse=True)

    # --- donations this user has made ---
    # Matched on userId first, which is only ever written from a verified token.
    # Email is a fallback: donations made before the link existed, or made while
    # signed out but with this address typed into the form, still belong to them
    # in any sense the admin cares about. Streaming the whole collection and
    # filtering in Python matches how every other query in this file works and
    # avoids needing a composite index for the two-field OR.
    user_donations = []
    donated_paise = 0
    for doc in db.collection(COLLECTION_DONATIONS).stream():
        data = doc.to_dict()
        matches_uid = data.get("userId") == user_doc.id
        matches_email = bool(user_email) and data.get("email", "") == user_email
        if not (matches_uid or matches_email):
            continue

        amount = data.get("amount")
        amount = int(amount) if isinstance(amount, (int, float)) else None
        if amount:
            donated_paise += amount

        don_created = data.get("createdAt")
        user_donations.append({
            "id": doc.id,
            "amount": amount,
            "currency": data.get("currency", "INR"),
            "razorpayPaymentId": data.get("razorpayPaymentId", ""),
            # True when we know it was them, rather than inferred from the email
            "linkedByAccount": matches_uid,
            "createdAt": don_created.isoformat() if don_created else None,
        })

    user_donations.sort(key=lambda item: item["createdAt"] or "", reverse=True)

    return api_success({
        "account": account,
        "feedback": user_feedback,
        "donations": user_donations,
        "profile": {
            "uid": user_doc.id,
            "name": user_data.get("name", ""),
            "email": user_data.get("email", ""),
            "region": user_data.get("region", ""),
            "createdAt": created_at.isoformat() if created_at else None,
            "isAdmin": user_doc.id in _all_admin_uids(),
        },
        "records": records,
        "goals": goals,
        "reports": reports,
        "summary": {
            "totalEmission": round(total_emission, 2),
            "recordCount": len(records),
            "goalCount": len(goals),
            "activeGoals": sum(1 for item in goals if item["status"] == "active"),
            "achievedGoals": sum(1 for item in goals if item["status"] == "achieved"),
            "reportCount": len(reports),
            "categoryTotals": active_categories,
            "mostCommonCategory": most_common_category,
            "firstActivity": min(recorded_dates) if recorded_dates else None,
            "lastActivity": max(recorded_dates) if recorded_dates else None,
            "averagePerEntry": (
                round(total_emission / len(records), 2) if records else 0.0
            ),
            "donationCount": len(user_donations),
            "donatedPaise": donated_paise,
        },
    })


# The collection the public feedback form writes to. Named here rather than
# imported from routes/feedback.py to keep the two route files independent.
COLLECTION_FEEDBACK = "feedback"


# ---------------------------------------------------------------------------
# GET /api/admin/feedback
# ---------------------------------------------------------------------------

@admin_bp.route("/feedback", methods=["GET"])
@require_admin
def list_feedback():
    """
    Every piece of feedback submitted through the public form, newest first.

    Feedback can be sent by anyone (it is a public form), so this is the only
    place it can be read - and only an admin can reach it.
    """
    db = get_db()
    items = []

    for doc in db.collection(COLLECTION_FEEDBACK).stream():
        data = doc.to_dict()
        created_at = data.get("createdAt")
        items.append({
            "id": doc.id,
            "name": data.get("name", "Anonymous"),
            "email": data.get("email", ""),
            "message": data.get("message", ""),
            "rating": data.get("rating"),
            # Firestore timestamps are not JSON-serialisable, so convert to ISO
            "createdAt": created_at.isoformat() if created_at else None,
        })

    # Newest first. Sorting in Python avoids needing a Firestore index on
    # createdAt, the same approach the other admin queries take.
    items.sort(key=lambda item: item["createdAt"] or "", reverse=True)

    # A couple of headline figures for the section summary
    rated = [item["rating"] for item in items if item["rating"]]
    average_rating = round(sum(rated) / len(rated), 1) if rated else None

    return api_success({
        "feedback": items,
        "count": len(items),
        "averageRating": average_rating,
    })


# ---------------------------------------------------------------------------
# DELETE /api/admin/feedback/<feedback_id>
# ---------------------------------------------------------------------------

@admin_bp.route("/feedback/<feedback_id>", methods=["DELETE"])
@require_admin
def delete_feedback(feedback_id):
    """Remove a single piece of feedback (spam, or once it has been actioned)."""
    db = get_db()
    ref = db.collection(COLLECTION_FEEDBACK).document(feedback_id)

    if not ref.get().exists:
        return api_error("Feedback not found.", 404, code="feedback_not_found")

    ref.delete()
    return api_success({"id": feedback_id}, message="Feedback deleted.")


# The collection the verified-donation writer in routes/payments.py appends to.
# Named here rather than imported, for the same reason as COLLECTION_FEEDBACK.
COLLECTION_DONATIONS = "donations"


# ---------------------------------------------------------------------------
# GET /api/admin/donations
# ---------------------------------------------------------------------------

@admin_bp.route("/donations", methods=["GET"])
@require_admin
def list_donations():
    """
    Every donation whose Razorpay signature was verified, newest first.

    Only verified payments ever reach the donations collection (see
    routes/payments.py), so everything listed here is money that genuinely
    arrived - this endpoint does no checking of its own.

    Amounts are stored in paise. They are returned in paise as well, so the
    frontend does the ÷100 once at the point of display and no rounding error
    can creep into the total.
    """
    db = get_db()
    items = []

    for doc in db.collection(COLLECTION_DONATIONS).stream():
        data = doc.to_dict()
        created_at = data.get("createdAt")

        # amount may be None: the paise figure is sent by the browser alongside
        # the signature, and the donation is recorded whether or not it arrives.
        amount = data.get("amount")
        items.append({
            "id": doc.id,
            "name": data.get("name", "") or "Anonymous",
            "email": data.get("email", ""),
            "amount": int(amount) if isinstance(amount, (int, float)) else None,
            "currency": data.get("currency", "INR"),
            "razorpayOrderId": data.get("razorpayOrderId", ""),
            "razorpayPaymentId": data.get("razorpayPaymentId", ""),
            # Set only when the donor was signed in, and only from a verified
            # token. Lets the console link a donation to the account that made it.
            "userId": data.get("userId") or None,
            "createdAt": created_at.isoformat() if created_at else None,
        })

    # Newest first, sorted in Python so no Firestore index is needed - the same
    # approach every other admin query here takes.
    items.sort(key=lambda item: item["createdAt"] or "", reverse=True)

    return api_success({
        "donations": items,
        "count": len(items),
        # Skips the None amounts rather than treating them as zero
        "totalPaise": sum(item["amount"] for item in items if item["amount"]),
    })


# ---------------------------------------------------------------------------
# DELETE /api/admin/donations/<donation_id>
# ---------------------------------------------------------------------------

@admin_bp.route("/donations/<donation_id>", methods=["DELETE"])
@require_admin
def delete_donation(donation_id):
    """
    Remove one donation record (a test payment, or a duplicate).

    This deletes EcoTrack's own record only. It does not refund anything and
    does not touch Razorpay - the payment itself still exists in the Razorpay
    dashboard, which stays the authoritative record.
    """
    db = get_db()
    ref = db.collection(COLLECTION_DONATIONS).document(donation_id)

    if not ref.get().exists:
        return api_error("Donation not found.", 404, code="donation_not_found")

    ref.delete()
    return api_success({"id": donation_id}, message="Donation record deleted.")
