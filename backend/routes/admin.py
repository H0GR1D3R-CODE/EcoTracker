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

A SECOND, NARROWER ROLE: RESEARCHER
------------------------------------
research_export and research_stats near the bottom of this file use
@require_researcher instead of @require_admin - it passes an admin through
too, but also anyone with a document in the separate researchers/{uid}
collection, managed by add_researcher/remove_researcher/list_researchers
below. Unlike becoming the first admin, granting this is a normal,
API-driven admin action (a guide or research assistant joining the
project) - see require_researcher's own docstring in routes/__init__.py for
why that split in trust is safe.

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

import csv
import hashlib
import io
import time
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, g, request
from firebase_admin import auth as firebase_auth
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from email_service import send_admin_invite_email
from routes import (
    EMAIL_ERROR,
    api_error,
    api_success,
    is_valid_email,
    month_bounds,
    month_key_of,
    require_admin,
    require_researcher,
)
from routes.announcements import COLLECTION_ANNOUNCEMENTS

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


# ---------------------------------------------------------------------------
# Announcements - the site-wide banner (see routes/announcements.py for the
# signed-in-user-facing read side; every write lives here, admin-only)
# ---------------------------------------------------------------------------

VALID_ANNOUNCEMENT_TONES = {"good", "warning", "neutral"}
MAX_ANNOUNCEMENT_MESSAGE_LENGTH = 240


def _serialize_announcement(doc):
    data = doc.to_dict()
    created_at = data.get("createdAt")
    return {
        "id": doc.id,
        "message": data.get("message", ""),
        "tone": data.get("tone", "neutral"),
        "link": data.get("link"),
        "active": bool(data.get("active", False)),
        "createdAt": created_at.isoformat() if created_at else None,
        "createdBy": data.get("createdBy", ""),
    }


@admin_bp.route("/announcements", methods=["GET"])
@require_admin
def list_announcements():
    """Every announcement ever created, newest first - a history to review,
    not just whatever is live right now."""
    db = get_db()
    docs = list(db.collection(COLLECTION_ANNOUNCEMENTS).stream())
    items = [_serialize_announcement(doc) for doc in docs]
    items.sort(key=lambda item: item["createdAt"] or "", reverse=True)
    return api_success({"announcements": items})


@admin_bp.route("/announcements", methods=["POST"])
@require_admin
def create_announcement():
    """
    Publish a new banner - and retire whichever one was showing before it.

    Body: {"message": "...", "tone": "neutral", "link": {"label": "Learn more", "to": "/learn"}}
    tone is one of VALID_ANNOUNCEMENT_TONES (the exact same good/warning/
    neutral vocabulary Dashboard.jsx's own insights already use). link is
    optional - a plain-text banner with no call to action is a real, valid
    announcement, not an incomplete one.
    """
    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()
    tone = str(body.get("tone", "neutral")).strip()
    link = body.get("link")

    if not message:
        return api_error("A message is required.", 400, code="missing_message")
    if len(message) > MAX_ANNOUNCEMENT_MESSAGE_LENGTH:
        return api_error(
            f"Message must be {MAX_ANNOUNCEMENT_MESSAGE_LENGTH} characters or fewer.",
            400,
            code="message_too_long",
        )
    if tone not in VALID_ANNOUNCEMENT_TONES:
        return api_error("Unrecognised tone.", 400, code="invalid_tone")

    if link is not None:
        if (
            not isinstance(link, dict)
            or not str(link.get("label", "")).strip()
            or not str(link.get("to", "")).strip()
        ):
            return api_error(
                "A link needs both a label and a destination, or leave it out entirely.",
                400,
                code="invalid_link",
            )
        link = {"label": str(link["label"]).strip()[:40], "to": str(link["to"]).strip()}

    db = get_db()
    collection = db.collection(COLLECTION_ANNOUNCEMENTS)

    # Retire the current banner (if any) before publishing the new one - see
    # this module's own comment on why there is only ever one active
    # announcement, never a competing pair.
    for doc in collection.where("active", "==", True).stream():
        doc.reference.update({"active": False})

    new_ref = collection.document()
    new_ref.set({
        "message": message,
        "tone": tone,
        "link": link,
        "active": True,
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
        "createdBy": g.email or g.uid,
    })

    return api_success(_serialize_announcement(new_ref.get()), message="Announcement published.")


@admin_bp.route("/announcements/<announcement_id>", methods=["PATCH"])
@require_admin
def deactivate_announcement(announcement_id):
    """End a banner early, without deleting its record from the history list."""
    db = get_db()
    ref = db.collection(COLLECTION_ANNOUNCEMENTS).document(announcement_id)

    if not ref.get().exists:
        return api_error("Announcement not found.", 404, code="announcement_not_found")

    ref.update({"active": False})
    return api_success(_serialize_announcement(ref.get()), message="Announcement ended.")


@admin_bp.route("/announcements/<announcement_id>", methods=["DELETE"])
@require_admin
def delete_announcement(announcement_id):
    """Remove an announcement from the history list entirely."""
    db = get_db()
    ref = db.collection(COLLECTION_ANNOUNCEMENTS).document(announcement_id)

    if not ref.get().exists:
        return api_error("Announcement not found.", 404, code="announcement_not_found")

    ref.delete()
    return api_success({"id": announcement_id}, message="Announcement deleted.")


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


# ---------------------------------------------------------------------------
# GET /api/admin/system
# ---------------------------------------------------------------------------

@admin_bp.route("/system", methods=["GET"])
@require_admin
def system_health():
    """
    Live status of every external service EcoTrack depends on.

    WHAT THIS DELIBERATELY DOES NOT RETURN
    No secret, or any part of one. Only booleans ("a key is present"), the
    PUBLIC Razorpay key id, and the model name. A health endpoint that echoed
    key material back would be a far worse problem than the outage it was
    built to diagnose - and this route, while admin-gated, is still reachable
    over the network.

    Each check reports one of:
        ok    working, and proven so where a live call was possible
        warn  reachable but not fully configured - a feature is switched off
        down  configured but not responding
    """
    checks = []

    # --- Firestore: timed, because a slow database is a real symptom that a
    # simple up/down check would miss entirely ---
    started = time.perf_counter()
    try:
        db = get_db()
        # Reading one document is the cheapest possible proof of a round trip
        next(db.collection(Config.COLLECTION_USERS).limit(1).stream(), None)
        latency_ms = int((time.perf_counter() - started) * 1000)
        checks.append({
            "id": "firestore",
            "label": "Firestore",
            "status": "ok",
            "detail": f"Connected to {Config.FIREBASE_PROJECT_ID or 'project'}",
            "latencyMs": latency_ms,
        })
    except Exception as error:
        checks.append({
            "id": "firestore",
            "label": "Firestore",
            "status": "down",
            # The class name says what broke without echoing connection strings
            "detail": f"Unreachable ({type(error).__name__})",
            "latencyMs": int((time.perf_counter() - started) * 1000),
        })

    # --- Razorpay: presence of both halves, and which mode the key id implies ---
    key_id = Config.RAZORPAY_KEY_ID
    has_secret = bool(Config.RAZORPAY_KEY_SECRET)
    if key_id and has_secret:
        live = key_id.startswith("rzp_live_")
        checks.append({
            "id": "razorpay",
            "label": "Razorpay",
            "status": "ok",
            "detail": f"{'LIVE' if live else 'Test'} mode · {key_id}",
            "mode": "live" if live else "test",
        })
    else:
        missing = []
        if not key_id:
            missing.append("RAZORPAY_KEY_ID")
        if not has_secret:
            missing.append("RAZORPAY_KEY_SECRET")
        checks.append({
            "id": "razorpay",
            "label": "Razorpay",
            "status": "warn",
            "detail": f"Donations off — missing {' and '.join(missing)}",
        })

    # --- Branded email (Resend) - powers the password-reset and donation
    # thank-you emails; without it both features silently fall back to
    # Firebase's own plain email (reset) or send nothing at all (donation) ---
    if Config.RESEND_API_KEY:
        checks.append({
            "id": "email",
            "label": "Branded email",
            "status": "ok",
            "detail": f"Key set · sending as {Config.RESEND_FROM_EMAIL}",
        })
    else:
        checks.append({
            "id": "email",
            "label": "Branded email",
            "status": "warn",
            "detail": "No RESEND_API_KEY — reset falls back to Firebase's plain email, donation emails are off",
        })

    # --- Assistant ---
    if Config.GROQ_API_KEY:
        checks.append({
            "id": "assistant",
            "label": "AI assistant",
            "status": "ok",
            "detail": f"Key set · {Config.ASSISTANT_MODEL}",
        })
    else:
        checks.append({
            "id": "assistant",
            "label": "AI assistant",
            "status": "warn",
            "detail": "Assistant off — no GROQ_API_KEY",
        })

    # --- Admin access model ---
    if Config.ADMIN_EMAILS:
        checks.append({
            "id": "admin",
            "label": "Admin access",
            "status": "ok",
            "detail": f"{len(Config.ADMIN_EMAILS)} allow-listed address"
                      f"{'' if len(Config.ADMIN_EMAILS) == 1 else 'es'}",
        })
    else:
        checks.append({
            "id": "admin",
            "label": "Admin access",
            "status": "warn",
            "detail": "No ADMIN_EMAILS — falling back to the admins collection",
        })

    # --- The API answering this request, by definition, is up ---
    checks.append({
        "id": "api",
        "label": "API",
        "status": "ok" if not Config.DEBUG else "warn",
        "detail": (
            f"{Config.FLASK_ENV} mode"
            + (" — DEBUG is on, do not ship this" if Config.DEBUG else "")
        ),
    })

    worst = "ok"
    for check in checks:
        if check["status"] == "down":
            worst = "down"
            break
        if check["status"] == "warn":
            worst = "warn"

    return api_success({
        "checks": checks,
        "overall": worst,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    })


# ---------------------------------------------------------------------------
# GET /api/admin/research/export
# ---------------------------------------------------------------------------

def _opted_out_uids():
    """
    Every uid whose account has explicitly declined the one-time data-
    sharing prompt (users/{uid}.dataSharingConsent == False, set by
    frontend/src/components/DataConsentModal.jsx) - the set research_export
    and research_stats both filter their own interventions read against.

    Deliberately NOT the same as "never answered" (None, the default for
    every account before this existed and for a few seconds on a brand new
    one): a real, considered No is what this respects, not silence -
    treating an unanswered prompt as an opt-out would exclude the entire
    existing user base retroactively for a choice nobody actually made.
    """
    db = get_db()
    return {
        doc.id
        for doc in db.collection(Config.COLLECTION_USERS)
        .where(filter=gcloud_firestore.FieldFilter("dataSharingConsent", "==", False))
        .stream()
    }


def _hashed_uid(uid):
    """
    A stable, one-way, per-deployment pseudonym for a user id.

    SHA-256 of the raw uid would still let anyone with a list of registered
    uids (an admin, notably) recover the mapping by hashing each one and
    comparing - a "hash it yourself and see if it matches" attack works
    against any unsalted hash. Salting with SECRET_KEY (never shipped to the
    browser, unlike everything in this CSV) closes that off: the export is
    anonymised against the person who downloads and shares it, not just
    against whoever it's shared with.
    """
    salted = f"{Config.SECRET_KEY}:{uid}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()[:16]


@admin_bp.route("/research/export", methods=["GET"])
@require_researcher
def research_export():
    """
    Anonymised CSV of every logged intervention - the evaluation-harness data
    the paper's adoption-rate and behaviour-delta numbers come from. See
    backend/routes/insights.py and routes/engagement.py for what writes to
    the `interventions` collection and when.

    SCOPE, deliberately: this exports what is cheap to read live (one
    collection scan, same cost class as GET /admin/stats). Forecast accuracy
    (MAE/MAPE) is a walk-forward BACKTEST across historical months, which is
    a genuinely different, heavier computation - that stays in
    evaluate_forecast.py, a script you run from your own machine, rather
    than being recomputed on every hit of an admin-console button.

    No email, no name, no raw uid - only the hashed pseudonym above. This is
    a real anonymisation property of the export, not a cosmetic one: a
    column rename would not be enough if the raw uid were still in the file,
    since uids are also the join key into every OTHER collection.

    Also excludes anyone who has explicitly declined the data-sharing
    prompt - see _opted_out_uids' own docstring for exactly what that does
    and does not exclude.
    """
    db = get_db()
    excluded = _opted_out_uids()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "userHash", "type", "variant", "action", "projectedSavingKg",
        "observedDeltaKg", "shownAt", "actedAt",
    ])

    row_count = 0
    for doc in db.collection(Config.COLLECTION_INTERVENTIONS).stream():
        data = doc.to_dict()
        if data.get("userId") in excluded:
            continue
        shown_at = data.get("shownAt")
        acted_at = data.get("actedAt")
        writer.writerow([
            _hashed_uid(data.get("userId", "")),
            data.get("type", ""),
            data.get("variant", ""),
            data.get("action", "shown"),
            data.get("projectedSavingKg", ""),
            data.get("observedDeltaKg", ""),
            shown_at.isoformat() if shown_at else "",
            acted_at.isoformat() if acted_at else "",
        ])
        row_count += 1

    return api_success({
        "csv": output.getvalue(),
        "filename": f"ecotrack-interventions-{date.today().isoformat()}.csv",
        "rowCount": row_count,
    })


# ---------------------------------------------------------------------------
# GET /api/admin/research/stats
# ---------------------------------------------------------------------------

# Only these two intervention types ever show an Accept/Dismiss control -
# see frontend/src/components/SwapCard.jsx and QuickLogChips.jsx, the only
# two files in the app that call useIntervention's accept()/dismiss(). A
# forecast, the ranked swap list itself, and a cohort comparison are shown
# but nothing to "adopt" - reporting an adoption rate for those would silently
# imply 0% engagement on features that were never actionable in the first
# place, which is a worse number than no number.
ACTIONABLE_INTERVENTION_TYPES = {"swap_item", "quick_log_suggestion"}

# How many days of daily shown/accepted counts the trend chart covers.
RESEARCH_TREND_DAYS = 14


def _adoption_rate(accepted, shown):
    return round((accepted / shown) * 100, 1) if shown else 0.0


@admin_bp.route("/research/stats", methods=["GET"])
@require_researcher
def research_stats():
    """
    Turns the raw `interventions` log into the actual numbers the project's
    central claim rests on: not "we log recommendations" but "here is the
    measured rate at which people acted on them."

    ONE PASS, same cost class as research_export() just above - both read
    the same collection once rather than running a separate query per figure
    (see backend/routes/dashboard.py's module docstring for why that
    matters at all).

    THE BOOMERANG-EFFECT INSTRUMENTATION, AND ITS HONEST LIMIT
    routes/insights.py's /cohort route assigns each user a variant
    deterministically from their own position (below the cohort mean ->
    "injunctive_approval", at or above it -> "descriptive_comparison") - see
    that route's own comment for the citation. That is NOT a randomised
    controlled trial: there is no below-mean user who received the plain
    descriptive framing to compare against, so this endpoint can report how
    often each variant was shown, but cannot itself claim to have measured
    whether the injunctive framing prevented a boomerang increase. Testing
    that causally needs a longitudinal join against carbonRecords (did this
    user's emissions rise in the weeks after seeing the comparison) across
    enough users for statistical power - future work, not a live snapshot.
    Reporting the honest partial number here beats reporting a number that
    overclaims what a single admin-console request can actually prove.

    Also excludes anyone who has explicitly declined the data-sharing
    prompt - see _opted_out_uids' own docstring, and research_export's
    identical exclusion just above for the same reasoning applied to the
    CSV instead of these aggregate figures.
    """
    db = get_db()
    excluded = _opted_out_uids()

    by_type = {}
    cohort_variants = {}
    daily = {}
    total_saving_kg = 0.0
    total_shown = total_accepted = total_dismissed = 0

    window_start = date.today() - timedelta(days=RESEARCH_TREND_DAYS - 1)
    window_start_iso = window_start.isoformat()

    for doc in db.collection(Config.COLLECTION_INTERVENTIONS).stream():
        data = doc.to_dict()
        if data.get("userId") in excluded:
            continue
        intervention_type = data.get("type", "unknown")
        action = data.get("action", "shown")
        variant = data.get("variant", "")

        bucket = by_type.setdefault(intervention_type, {"shown": 0, "accepted": 0, "dismissed": 0})
        bucket["shown"] += 1
        total_shown += 1

        if action == "accepted":
            bucket["accepted"] += 1
            total_accepted += 1
            # observedDeltaKg is negative for a reduction (see SwapCard.jsx's
            # accept(-swap.savingKg)) - only count real reductions, in case a
            # future intervention type ever records a positive delta for a
            # different reason.
            delta = data.get("observedDeltaKg")
            if isinstance(delta, (int, float)) and delta < 0:
                total_saving_kg += -delta
        elif action == "dismissed":
            bucket["dismissed"] += 1
            total_dismissed += 1

        if intervention_type == "cohort" and variant:
            cohort_variants[variant] = cohort_variants.get(variant, 0) + 1

        shown_at = data.get("shownAt")
        if shown_at:
            day = shown_at.date().isoformat()
            if day >= window_start_iso:
                point = daily.setdefault(day, {"shown": 0, "accepted": 0})
                point["shown"] += 1
                if action == "accepted":
                    point["accepted"] += 1

    by_type_list = [
        {
            "type": intervention_type,
            "shown": counts["shown"],
            "accepted": counts["accepted"],
            "dismissed": counts["dismissed"],
            "actionable": intervention_type in ACTIONABLE_INTERVENTION_TYPES,
            "adoptionRate": (
                _adoption_rate(counts["accepted"], counts["shown"])
                if intervention_type in ACTIONABLE_INTERVENTION_TYPES
                else None
            ),
        }
        for intervention_type, counts in sorted(by_type.items())
    ]

    actionable_shown = sum(
        counts["shown"] for t, counts in by_type.items() if t in ACTIONABLE_INTERVENTION_TYPES
    )
    actionable_accepted = sum(
        counts["accepted"] for t, counts in by_type.items() if t in ACTIONABLE_INTERVENTION_TYPES
    )

    # Every day in the window, oldest first, gaps filled with zero rather than
    # skipped - the same reasoning as dashboard.py's _build_trend: a quiet day
    # is a real data point, not a day to compress out of the line.
    daily_trend = []
    cursor = window_start
    today = date.today()
    while cursor <= today:
        key = cursor.isoformat()
        point = daily.get(key, {"shown": 0, "accepted": 0})
        daily_trend.append({"date": key, "shown": point["shown"], "accepted": point["accepted"]})
        cursor += timedelta(days=1)

    return api_success({
        "totalInterventions": total_shown,
        "overall": {
            "shown": total_shown,
            "accepted": total_accepted,
            "dismissed": total_dismissed,
            "notActedOn": total_shown - total_accepted - total_dismissed,
        },
        "actionableAdoptionRate": _adoption_rate(actionable_accepted, actionable_shown),
        "actionableShown": actionable_shown,
        "byType": by_type_list,
        "totalProjectedSavingKg": round(total_saving_kg, 2),
        "cohortVariants": [
            {"variant": variant, "count": count} for variant, count in sorted(cohort_variants.items())
        ],
        "dailyTrend": daily_trend,
    })


# ---------------------------------------------------------------------------
# POST /api/admin/invite
# ---------------------------------------------------------------------------

@admin_bp.route("/invite", methods=["POST"])
@require_admin
def invite_admin():
    """
    Send a branded invitation email to a new admin.

    Body: {"email": "new-admin@example.com", "name": "Optional Name"}

    IMPORTANT SCOPE: this sends an email. It does NOT itself grant access -
    Config.ADMIN_EMAILS is read once from the environment when the process
    starts (see config.py), so there is no runtime API that could add to it
    without a real deployment. Actually granting access is a separate,
    deliberate step (updating ADMIN_EMAILS in the Vercel dashboard and
    redeploying) that only someone with access to that dashboard can take -
    exactly the same reasoning as this file's own module docstring on why
    there is no "make me an admin" route. This endpoint's job ends at
    telling the right person that access is coming.
    """
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    name = str(body.get("name", "")).strip() or None

    if not is_valid_email(email):
        return api_error(EMAIL_ERROR, 400, code="invalid_email")

    sent = send_admin_invite_email(email, invited_by_email=g.email, invited_name=name)

    if not sent:
        return api_error(
            "Could not send the invite email - RESEND_API_KEY may not be configured, "
            "or Resend rejected the request. Tell them yourself in the meantime.",
            502,
            code="invite_send_failed",
        )

    return api_success({"email": email, "sent": True}, message=f"Invite sent to {email}.")


# ---------------------------------------------------------------------------
# GET / POST / DELETE /api/admin/researchers   (manage the researcher role)
# ---------------------------------------------------------------------------

@admin_bp.route("/researchers", methods=["GET"])
@require_admin
def list_researchers():
    """Everyone currently holding read-only research access."""
    db = get_db()
    researchers = [
        {"uid": doc.id, **doc.to_dict()}
        for doc in db.collection(Config.COLLECTION_RESEARCHERS).stream()
    ]
    researchers.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
    return api_success({"researchers": researchers, "count": len(researchers)})


@admin_bp.route("/researchers", methods=["POST"])
@require_admin
def add_researcher():
    """
    Grant read-only research access (routes/admin.py's research_export and
    research_stats - the anonymised interventions export/adoption stats,
    nothing else) to an existing EcoTrack account.

    Body: {"email": "guide@university.edu"}

    Unlike inviting an admin, this takes effect immediately - no redeploy,
    no ADMIN_EMAILS env var - because unlike granting the FIRST admin (see
    this file's own module docstring on why that stays a manual console
    step forever), an existing admin adding a research collaborator is
    exactly the kind of routine, already-authenticated action an admin
    session should be trusted to do directly.
    """
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()

    if not is_valid_email(email):
        return api_error(EMAIL_ERROR, 400, code="invalid_email")

    try:
        user_record = firebase_auth.get_user_by_email(email)
    except firebase_auth.UserNotFoundError:
        return api_error(
            "No EcoTrack account exists for that email yet. "
            "They need to register first.",
            404,
            code="user_not_found",
        )

    db = get_db()
    ref = db.collection(Config.COLLECTION_RESEARCHERS).document(user_record.uid)
    if ref.get().exists:
        return api_error("That person already has research access.", 409, code="already_researcher")

    ref.set({
        "email": email,
        "name": user_record.display_name or "",
        "addedBy": g.email,
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    return api_success(
        {"uid": user_record.uid, "email": email},
        message=f"Research access granted to {email}.",
        status=201,
    )


@admin_bp.route("/researchers/<researcher_uid>", methods=["DELETE"])
@require_admin
def remove_researcher(researcher_uid):
    """Revoke research access. Does not touch the user's account or data -
    the same non-destructive shape as removing a household member."""
    db = get_db()
    ref = db.collection(Config.COLLECTION_RESEARCHERS).document(researcher_uid)
    if not ref.get().exists:
        return api_error("That person does not have research access.", 404, code="not_researcher")

    ref.delete()
    return api_success({"uid": researcher_uid}, message="Research access revoked.")


# ---------------------------------------------------------------------------
# GET /api/admin/data-quality
# ---------------------------------------------------------------------------

@admin_bp.route("/data-quality", methods=["GET"])
@require_admin
def data_quality():
    """
    Platform-wide view of routes/carbon.py's anomaly flag - how many logged
    entries look statistically unusual against the user's own history, and
    the most recent ones, so an admin can spot a pattern (a broken bill
    scanner extraction, a factor that quietly encourages odd inputs)
    instead of only ever seeing this one flag at a time on one user's own
    Activity Log.

    Read-only, deliberately: this is visibility, not moderation - an admin
    here cannot edit or delete another user's individual record (only the
    whole-account deletion list_users/delete_user already supports), the
    same boundary this file's own module docstring draws around
    self-promotion. See routes/carbon.py's module docstring for what the
    flag itself means and why it never blocks a save.
    """
    db = get_db()

    total = 0
    flagged_records = []
    for doc in db.collection(Config.COLLECTION_CARBON_RECORDS).stream():
        data = doc.to_dict()
        total += 1
        if data.get("flaggedAnomaly"):
            flagged_records.append({
                "id": doc.id,
                "userHash": _hashed_uid(data.get("userId", "")),
                "category": data.get("category", ""),
                "subType": data.get("subType", ""),
                "quantity": float(data.get("quantity", 0)),
                "recordedDate": data.get("recordedDate", ""),
                "reason": data.get("anomalyReason"),
            })

    flagged_records.sort(key=lambda r: r["recordedDate"], reverse=True)

    return api_success({
        "totalRecords": total,
        "flaggedCount": len(flagged_records),
        "flaggedRate": round(100 * len(flagged_records) / total, 2) if total else 0.0,
        # Capped the same way research_export's own row-per-page reasoning
        # goes - enough to see a pattern, not the platform's whole history
        # in one response.
        "recentFlags": flagged_records[:50],
    })
