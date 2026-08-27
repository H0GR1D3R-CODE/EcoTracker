# EcoTrack/backend/routes/reminders.py
"""
Recurring "remind me to log X" reminders - a push notification, never an
auto-logged record. Every other AI-assisted or automation-adjacent feature
in this app (the bill scanner, voice logging, the AI reduction plan) stops
at PROPOSING an entry and makes the user actively confirm it before
anything is saved; a reminder that silently created carbonRecords entries
on its own would be the one place that rule broke, so it does not - this
route only ever creates/reads/deletes reminder CONFIGURATION, never a
carbonRecords document.

SCOPED TO DAYS OF THE WEEK, NOT A CHOSEN TIME
routes/cron.py's one existing scheduled job runs once a day, at a fixed UTC
hour set in vercel.json - Vercel's Hobby tier caps both how many cron jobs a
project can have and how often each can fire, so "remind me every weekday
at 6pm" is not a promise this backend can actually keep. A reminder here is
delivered through that SAME daily cron run (see cron.py's streak_reminders,
extended with a third priority tier below it in that file), at whatever
time everyone else's streak/goal reminder already arrives. Honest about
that limit rather than accepting a time input the backend would just ignore.

Mounted at /api/reminders
"""

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, require_auth

reminders_bp = Blueprint("reminders", __name__, url_prefix="/api/reminders")

# A cap, not a real limit anyone should hit - stops a runaway client from
# quietly creating hundreds of reminders that would all be evaluated (and
# all send at most nothing, since cron.py's shared "at most one push a day"
# rule still applies) on every cron run.
MAX_REMINDERS_PER_USER = 10

# Monday=0 .. Sunday=6, matching Python's own date.weekday() - the exact
# value cron.py compares a reminder's daysOfWeek against each run, so there
# is no day-numbering translation anywhere in this feature.
VALID_WEEKDAYS = set(range(7))


def _serialize_reminder(doc):
    data = doc.to_dict()
    return {
        "id": doc.id,
        "category": data.get("category", ""),
        "subType": data.get("subType", ""),
        "daysOfWeek": data.get("daysOfWeek", []),
    }


@reminders_bp.route("", methods=["GET"])
@require_auth
def list_reminders():
    db = get_db()
    docs = (
        db.collection(Config.COLLECTION_ACTIVITY_REMINDERS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", g.uid))
        .stream()
    )
    return api_success({"reminders": [_serialize_reminder(doc) for doc in docs]})


@reminders_bp.route("", methods=["POST"])
@require_auth
def create_reminder():
    """Body: {"category": "transport", "subType": "petrol_car", "daysOfWeek": [0,1,2,3,4]}"""
    db = get_db()

    existing_count = sum(
        1
        for _ in db.collection(Config.COLLECTION_ACTIVITY_REMINDERS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", g.uid))
        .stream()
    )
    if existing_count >= MAX_REMINDERS_PER_USER:
        return api_error(
            f"You can have up to {MAX_REMINDERS_PER_USER} reminders at once.",
            400,
            code="too_many_reminders",
        )

    body = request.get_json(silent=True) or {}
    category = str(body.get("category", "")).strip().lower()
    sub_type = str(body.get("subType", "")).strip().lower()
    days_of_week = body.get("daysOfWeek")

    if category not in Config.CATEGORIES:
        return api_error(
            f"Invalid category. Choose one of: {', '.join(Config.CATEGORIES)}.",
            400,
            code="invalid_category",
        )
    if not sub_type:
        return api_error("subType is required.", 400, code="missing_sub_type")
    # A real emission factor has to exist for this category+subType, so a
    # typo does not sit unreachable forever as a reminder nobody's Calculator
    # dropdown could ever have produced in the first place.
    factor_exists = any(
        True
        for _ in db.collection(Config.COLLECTION_EMISSION_FACTORS)
        .where(filter=gcloud_firestore.FieldFilter("category", "==", category))
        .where(filter=gcloud_firestore.FieldFilter("subType", "==", sub_type))
        .limit(1)
        .stream()
    )
    if not factor_exists:
        return api_error(
            f"No emission factor is configured for {category}/{sub_type}.",
            404,
            code="factor_not_found",
        )

    if (
        not isinstance(days_of_week, list)
        or not days_of_week
        or not all(isinstance(d, int) and d in VALID_WEEKDAYS for d in days_of_week)
    ):
        return api_error(
            "daysOfWeek must be a non-empty list of integers 0 (Monday) to 6 (Sunday).",
            400,
            code="invalid_days",
        )

    ref = db.collection(Config.COLLECTION_ACTIVITY_REMINDERS).document()
    ref.set({
        "userId": g.uid,
        "category": category,
        "subType": sub_type,
        # De-duplicated and sorted so the frontend never has to - a client
        # sending [4,0,0,2] would otherwise round-trip exactly that way.
        "daysOfWeek": sorted(set(days_of_week)),
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    return api_success({"reminder": _serialize_reminder(ref.get())}, status=201)


@reminders_bp.route("/<reminder_id>", methods=["DELETE"])
@require_auth
def delete_reminder(reminder_id):
    db = get_db()
    ref = db.collection(Config.COLLECTION_ACTIVITY_REMINDERS).document(reminder_id)
    doc = ref.get()

    if not doc.exists:
        return api_error("Reminder not found.", 404, code="reminder_not_found")
    if doc.to_dict().get("userId") != g.uid:
        return api_error(
            "You do not have permission to delete this reminder.",
            403,
            code="not_reminder_owner",
        )

    ref.delete()
    return api_success({"id": reminder_id}, message="Reminder deleted.")
