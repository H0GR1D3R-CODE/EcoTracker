# EcoTrack/backend/routes/templates.py
"""
Quick-log activity templates: the fix for the biggest real gap in this app -
every emission record used to require one full trip through the Calculator's
form. A template is a saved (category, subType, quantity, unit) a user logs
often; POST /<id>/log creates a real carbonRecords entry in one tap, through
the exact same validation and formula as the Calculator
(routes/carbon.py:save_calculated_record - see that function's docstring for
why this route calls it instead of recalculating anything itself).

GET /suggestions mines the user's own history for repeats they have not yet
turned into a template, so the feature can offer itself rather than asking
the user to notice the pattern and set it up unprompted.

Mounted at /api/templates
"""

from collections import defaultdict
from datetime import date, timedelta
from statistics import median

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, fetch_user_records, require_auth, today_string
from routes.carbon import save_calculated_record

templates_bp = Blueprint("templates", __name__, url_prefix="/api/templates")

MAX_LABEL_LENGTH = 60
VALID_WEEKDAYS = set(range(7))  # 0=Monday .. 6=Sunday, matching date.weekday()

# --- habit-mining thresholds for GET /suggestions ---
SUGGESTION_LOOKBACK_DAYS = 90
MIN_OCCURRENCES_FOR_SUGGESTION = 3
QUANTITY_TOLERANCE_RATIO = 0.15  # +/-15% of the median counts as "the same" entry
MAX_SUGGESTIONS = 5


def _serialize_template(doc):
    data = doc.to_dict()
    last_used = data.get("lastUsedAt")
    created_at = data.get("createdAt")
    return {
        "id": doc.id,
        "label": data.get("label", ""),
        "category": data.get("category", ""),
        "subType": data.get("subType", ""),
        "quantity": float(data.get("quantity", 0)),
        "unit": data.get("unit", ""),
        "weekdays": data.get("weekdays", []),
        "source": data.get("source", "manual"),
        "useCount": int(data.get("useCount", 0)),
        "lastUsedAt": last_used.isoformat() if last_used else None,
        "createdAt": created_at.isoformat() if created_at else None,
    }


# ---------------------------------------------------------------------------
# POST /api/templates
# ---------------------------------------------------------------------------

@templates_bp.route("", methods=["POST"])
@require_auth
def create_template():
    """
    Body: {"label": "Weekday commute", "category": "transport",
           "subType": "petrol_car", "quantity": 24, "unit": "km",
           "weekdays": [0,1,2,3,4], "source": "manual" | "mined"}
    """
    body = request.get_json(silent=True) or {}

    label = str(body.get("label", "")).strip()
    category = str(body.get("category", "")).strip().lower()
    sub_type = str(body.get("subType", "")).strip().lower()
    unit = str(body.get("unit", "")).strip()

    if not label:
        return api_error("label is required.", 400, code="missing_label")
    if len(label) > MAX_LABEL_LENGTH:
        return api_error(f"label must be under {MAX_LABEL_LENGTH} characters.", 400, code="label_too_long")
    if category not in Config.CATEGORIES:
        return api_error(
            f"Invalid category. Choose one of: {', '.join(Config.CATEGORIES)}.",
            400,
            code="invalid_category",
        )
    if not sub_type:
        return api_error("subType is required.", 400, code="missing_sub_type")

    try:
        quantity = float(body.get("quantity"))
    except (TypeError, ValueError):
        return api_error("quantity must be a number.", 400, code="invalid_quantity")
    if quantity <= 0:
        return api_error("quantity must be greater than zero.", 400, code="invalid_quantity")

    weekdays_raw = body.get("weekdays") or []
    if not isinstance(weekdays_raw, list) or any(
        not isinstance(d, int) or d not in VALID_WEEKDAYS for d in weekdays_raw
    ):
        return api_error("weekdays must be a list of integers 0-6.", 400, code="invalid_weekdays")

    source = "mined" if body.get("source") == "mined" else "manual"

    db = get_db()
    ref = db.collection(Config.COLLECTION_ACTIVITY_TEMPLATES).document()
    ref.set({
        "userId": g.uid,
        "label": label,
        "category": category,
        "subType": sub_type,
        "quantity": quantity,
        "unit": unit,
        "weekdays": sorted(set(weekdays_raw)),
        "source": source,
        "useCount": 0,
        "lastUsedAt": None,
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    return api_success(_serialize_template(ref.get()), message="Template saved.", status=201)


# ---------------------------------------------------------------------------
# GET /api/templates
# ---------------------------------------------------------------------------

@templates_bp.route("", methods=["GET"])
@require_auth
def list_templates():
    """Most-used first, so the top of the list is always the fastest chips to tap."""
    db = get_db()
    docs = (
        db.collection(Config.COLLECTION_ACTIVITY_TEMPLATES)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", g.uid))
        .stream()
    )
    templates = [_serialize_template(doc) for doc in docs]
    templates.sort(key=lambda t: t["useCount"], reverse=True)
    return api_success({"templates": templates, "count": len(templates)})


# ---------------------------------------------------------------------------
# DELETE /api/templates/<id>
# ---------------------------------------------------------------------------

@templates_bp.route("/<template_id>", methods=["DELETE"])
@require_auth
def delete_template(template_id):
    db = get_db()
    ref = db.collection(Config.COLLECTION_ACTIVITY_TEMPLATES).document(template_id)
    doc = ref.get()

    if not doc.exists:
        return api_error("Template not found.", 404, code="template_not_found")
    if doc.to_dict().get("userId") != g.uid:
        return api_error("Not your template.", 403, code="not_owner")

    ref.delete()
    return api_success({"id": template_id}, message="Template deleted.")


# ---------------------------------------------------------------------------
# POST /api/templates/<id>/log      (the one-tap quick log)
# ---------------------------------------------------------------------------

@templates_bp.route("/<template_id>/log", methods=["POST"])
@require_auth
def log_from_template(template_id):
    """Body (optional): {"recordedDate": "2026-08-19"} - defaults to today."""
    db = get_db()
    ref = db.collection(Config.COLLECTION_ACTIVITY_TEMPLATES).document(template_id)
    doc = ref.get()

    if not doc.exists:
        return api_error("Template not found.", 404, code="template_not_found")

    data = doc.to_dict()
    if data.get("userId") != g.uid:
        return api_error("Not your template.", 403, code="not_owner")

    body = request.get_json(silent=True) or {}
    recorded_date_raw = body.get("recordedDate") or today_string()

    result, error = save_calculated_record(
        g.uid,
        data.get("category"),
        data.get("subType"),
        data.get("quantity"),
        data.get("unit"),
        recorded_date_raw,
    )
    if error:
        return error

    ref.update({
        "useCount": gcloud_firestore.Increment(1),
        "lastUsedAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    return api_success(result, message=f"Logged from '{data.get('label')}'.", status=201)


# ---------------------------------------------------------------------------
# GET /api/templates/suggestions      (habit mining)
# ---------------------------------------------------------------------------

@templates_bp.route("/suggestions", methods=["GET"])
@require_auth
def suggestions():
    """
    Find (category, subType) combinations logged at least
    MIN_OCCURRENCES_FOR_SUGGESTION times in the last SUGGESTION_LOOKBACK_DAYS
    days with a quantity that clusters tightly around its own median, that do
    NOT already have a template. Each becomes a proposed template the
    frontend shows for one-tap confirmation - nothing is created here.
    """
    window_start = (date.today() - timedelta(days=SUGGESTION_LOOKBACK_DAYS)).isoformat()
    records = fetch_user_records(g.uid, start_date=window_start)

    db = get_db()
    existing_keys = {
        (t.to_dict().get("category"), t.to_dict().get("subType"))
        for t in db.collection(Config.COLLECTION_ACTIVITY_TEMPLATES)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", g.uid))
        .stream()
    }

    grouped = defaultdict(list)
    for record in records:
        grouped[(record["category"], record["subType"])].append(record)

    proposals = []
    for (category, sub_type), group in grouped.items():
        if (category, sub_type) in existing_keys:
            continue
        if len(group) < MIN_OCCURRENCES_FOR_SUGGESTION:
            continue

        quantities = [r["quantity"] for r in group]
        typical = median(quantities)
        if typical <= 0:
            continue

        # "Clusters tightly" - most occurrences within +/-15% of the median.
        # A category logged with wildly different quantities each time is not
        # a repeatable habit, it is just... every entry ever made in that category.
        close = [q for q in quantities if abs(q - typical) <= typical * QUANTITY_TOLERANCE_RATIO]
        if len(close) < MIN_OCCURRENCES_FOR_SUGGESTION:
            continue

        weekdays = sorted({date.fromisoformat(r["recordedDate"]).weekday() for r in group})

        proposals.append({
            "category": category,
            "subType": sub_type,
            "suggestedQuantity": round(median(close), 2),
            "unit": group[0]["unit"],
            "weekdays": weekdays,
            "occurrences": len(group),
            "matchingOccurrences": len(close),
        })

    # Most-repeated habit first - that is the one most worth automating
    proposals.sort(key=lambda p: p["matchingOccurrences"], reverse=True)
    return api_success({"suggestions": proposals[:MAX_SUGGESTIONS]})
