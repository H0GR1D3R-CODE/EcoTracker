# EcoTrack/backend/routes/goals.py
"""
Sustainability goal routes.

HOW A GOAL WORKS
----------------
A goal says: "my transport emissions were 120 kg last month (the baseline);
I want to cut that by 25% by 31 December."

    targetEmission  = baselineEmission x (1 - targetReductionPercent / 100)
                    = 120 x (1 - 0.25)
                    = 90 kg

Progress is then measured as how far the user has travelled from the baseline
towards the target:

    progress %  =  (baseline - current) / (baseline - target) x 100

If this month's transport total is 105 kg:
    (120 - 105) / (120 - 90) x 100  =  50% of the way there

Goals are PER CATEGORY, not one overall goal. That is a deliberate design
decision: "cut my total emissions by 20%" gives the user no idea what to
actually change, while "cut transport by 20%" points at a specific behaviour.

Mounted at /api/goals
"""

from datetime import date

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import (
    api_error,
    api_success,
    fetch_user_records,
    month_bounds,
    parse_date_string,
    require_auth,
    total_emission,
)
from routes.engagement import POINTS_PER_GOAL_ACHIEVED, award_points

goals_bp = Blueprint("goals", __name__, url_prefix="/api/goals")

# The only values the status field is allowed to hold
VALID_STATUSES = ["active", "achieved", "missed"]

# A goal must aim for a real reduction, and 100% (zero emissions) is the limit
MIN_REDUCTION_PERCENT = 1
MAX_REDUCTION_PERCENT = 100


# ---------------------------------------------------------------------------
# Helpers used only inside this file
# ---------------------------------------------------------------------------

def _current_month_total_for_category(uid, category):
    """This month's emissions in one category - the number progress is measured against."""
    today = date.today()
    start_date, end_date = month_bounds(today.year, today.month)
    records = fetch_user_records(uid, start_date, end_date)
    # Only the records belonging to this goal's category count towards it
    return total_emission([r for r in records if r["category"] == category])


def _progress_band(percent):
    """
    Which colour the SVG progress ring should be.

    The frontend maps these to the palette: red -> orange -> yellow -> green.
    """
    if percent < 25:
        return "critical"
    if percent < 50:
        return "warning"
    if percent < 75:
        return "progressing"
    return "success"


def _serialize_goal(doc, uid):
    """
    Turn a goals document into JSON, adding the calculated progress fields.

    The stored document only holds what the user chose. Everything about how
    the goal is GOING is worked out fresh on every request, so the numbers can
    never go stale the way a saved progress figure would.
    """
    data = doc.to_dict()

    category = data.get("category", "")
    baseline = float(data.get("baselineEmission", 0))
    reduction_percent = float(data.get("targetReductionPercent", 0))
    target_date_string = data.get("targetDate", "")
    status = data.get("status", "active")

    target_emission = round(baseline * (1 - reduction_percent / 100), 2)
    current_emission = _current_month_total_for_category(uid, category)

    # How much of the required reduction has actually been made
    reduction_needed = baseline - target_emission
    if reduction_needed <= 0:
        # Guards against dividing by zero if baseline and target are equal
        progress_percent = 100.0 if current_emission <= target_emission else 0.0
    else:
        raw_progress = ((baseline - current_emission) / reduction_needed) * 100
        # Clamp between 0 and 100 so the ring never draws past a full circle,
        # and never goes negative when the user emits MORE than their baseline
        progress_percent = round(max(0.0, min(100.0, raw_progress)), 1)

    # Days left until the deadline (negative once the date has passed)
    days_remaining = None
    is_expired = False
    parsed_target, date_error = parse_date_string(target_date_string, "targetDate")
    if not date_error:
        days_remaining = (parsed_target - date.today()).days
        is_expired = days_remaining < 0

    created_at = data.get("createdAt")

    return {
        "id": doc.id,
        "userId": data.get("userId", ""),
        "category": category,
        "baselineEmission": round(baseline, 2),
        "targetReductionPercent": reduction_percent,
        "targetEmission": target_emission,
        "targetDate": target_date_string,
        "status": status,
        "createdAt": created_at.isoformat() if created_at else None,
        # --- calculated fields, not stored in Firestore ---
        "currentEmission": current_emission,
        "progressPercent": progress_percent,
        "progressBand": _progress_band(progress_percent),
        "isAchieved": current_emission <= target_emission,
        "isExpired": is_expired,
        "daysRemaining": days_remaining,
    }


# ---------------------------------------------------------------------------
# POST /api/goals
# ---------------------------------------------------------------------------

@goals_bp.route("", methods=["POST"])
@require_auth
def create_goal():
    """
    Create a new per-category reduction goal.

    Body: {"category": "transport", "baselineEmission": 120,
           "targetReductionPercent": 25, "targetDate": "2026-12-31"}
    """
    body = request.get_json(silent=True) or {}

    category = str(body.get("category", "")).strip().lower()

    if category not in Config.CATEGORIES:
        return api_error(
            f"Invalid category. Choose one of: {', '.join(Config.CATEGORIES)}.",
            400,
            code="invalid_category",
        )

    # --- validate the baseline ---
    try:
        baseline = float(body.get("baselineEmission"))
    except (TypeError, ValueError):
        return api_error("baselineEmission must be a number.", 400, code="invalid_baseline")

    if baseline <= 0:
        return api_error(
            "baselineEmission must be greater than zero. Log some emissions first "
            "so there is something to improve on.",
            400,
            code="invalid_baseline",
        )

    # --- validate the reduction target ---
    try:
        reduction_percent = float(body.get("targetReductionPercent"))
    except (TypeError, ValueError):
        return api_error(
            "targetReductionPercent must be a number.",
            400,
            code="invalid_reduction",
        )

    if reduction_percent < MIN_REDUCTION_PERCENT or reduction_percent > MAX_REDUCTION_PERCENT:
        return api_error(
            f"targetReductionPercent must be between {MIN_REDUCTION_PERCENT} "
            f"and {MAX_REDUCTION_PERCENT}.",
            400,
            code="invalid_reduction",
        )

    # --- validate the deadline ---
    target_date, date_error = parse_date_string(body.get("targetDate"), "targetDate")
    if date_error:
        return api_error(date_error, 400, code="invalid_target_date")

    if target_date <= date.today():
        return api_error(
            "targetDate must be in the future.",
            400,
            code="target_date_in_past",
        )

    db = get_db()

    # Only one ACTIVE goal per category is allowed. Two competing goals for the
    # same category would make "progress" meaningless - which one is the user
    # actually being measured against?
    existing = (
        db.collection(Config.COLLECTION_GOALS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", g.uid))
        .where(filter=gcloud_firestore.FieldFilter("category", "==", category))
        .stream()
    )
    for goal in existing:
        if goal.to_dict().get("status") == "active":
            return api_error(
                f"You already have an active goal for {category}. "
                "Complete or delete it before creating another.",
                409,
                code="duplicate_active_goal",
            )

    goal_ref = db.collection(Config.COLLECTION_GOALS).document()
    goal_ref.set({
        "userId": g.uid,  # from the verified token, never the request body
        "category": category,
        "baselineEmission": baseline,
        "targetReductionPercent": reduction_percent,
        "targetDate": target_date.isoformat(),
        "status": "active",
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    return api_success(
        _serialize_goal(goal_ref.get(), g.uid),
        message="Goal created successfully.",
        status=201,
    )


# ---------------------------------------------------------------------------
# GET /api/goals
# ---------------------------------------------------------------------------

@goals_bp.route("", methods=["GET"])
@require_auth
def list_goals():
    """
    List the user's goals with live progress calculated for each one.

    Optional query parameter: ?status=active
    """
    status_filter = (request.args.get("status") or "").strip().lower()

    if status_filter and status_filter not in VALID_STATUSES:
        return api_error(
            f"status must be one of: {', '.join(VALID_STATUSES)}.",
            400,
            code="invalid_status",
        )

    db = get_db()
    documents = (
        db.collection(Config.COLLECTION_GOALS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", g.uid))
        .stream()
    )

    goals = []
    for doc in documents:
        goal = _serialize_goal(doc, g.uid)
        # Filtering here rather than in the query keeps us off composite indexes
        if status_filter and goal["status"] != status_filter:
            continue
        goals.append(goal)

    # Soonest deadline first - the most urgent goal appears at the top
    goals.sort(key=lambda item: item["targetDate"])

    return api_success({
        "goals": goals,
        "count": len(goals),
        "activeCount": sum(1 for goal in goals if goal["status"] == "active"),
        "achievedCount": sum(1 for goal in goals if goal["status"] == "achieved"),
    })


# ---------------------------------------------------------------------------
# PUT /api/goals/<goal_id>
# ---------------------------------------------------------------------------

@goals_bp.route("/<goal_id>", methods=["PUT"])
@require_auth
def update_goal(goal_id):
    """
    Change a goal's status.

    The Goals page calls this with {"status": "achieved"} when a ring reaches
    100%, which is what fires the confetti animation and stops the goal being
    counted as active on the dashboard.

    Also where POINTS_PER_GOAL_ACHIEVED gets credited, on a genuine
    active-> achieved transition - checked against the OLD stored status
    fetched below, not the live-computed isAchieved field (which stays true
    forever once a goal's progress crosses 100%, the exact same shape of
    bug routes/engagement.py's claim_challenge had to be guarded against:
    without this check, calling this route twice on an already-achieved
    goal would award points twice for one piece of work).

    Body: {"status": "achieved"}
    """
    body = request.get_json(silent=True) or {}
    new_status = str(body.get("status", "")).strip().lower()

    if new_status not in VALID_STATUSES:
        return api_error(
            f"status must be one of: {', '.join(VALID_STATUSES)}.",
            400,
            code="invalid_status",
        )

    db = get_db()
    goal_ref = db.collection(Config.COLLECTION_GOALS).document(goal_id)
    goal_doc = goal_ref.get()

    if not goal_doc.exists:
        return api_error("Goal not found.", 404, code="goal_not_found")

    goal_data = goal_doc.to_dict()

    # OWNERSHIP CHECK - proves this goal belongs to the caller
    if goal_data.get("userId") != g.uid:
        return api_error(
            "You do not have permission to update this goal.",
            403,
            code="not_goal_owner",
        )

    old_status = goal_data.get("status")
    goal_ref.update({"status": new_status})

    reward = None
    if new_status == "achieved" and old_status != "achieved":
        reward = award_points(g.uid, POINTS_PER_GOAL_ACHIEVED)

    return api_success(
        {**_serialize_goal(goal_ref.get(), g.uid), "reward": reward},
        message=f"Goal marked as {new_status}.",
    )


# ---------------------------------------------------------------------------
# DELETE /api/goals/<goal_id>
# ---------------------------------------------------------------------------

@goals_bp.route("/<goal_id>", methods=["DELETE"])
@require_auth
def delete_goal(goal_id):
    """Delete one of the user's own goals."""
    db = get_db()
    goal_ref = db.collection(Config.COLLECTION_GOALS).document(goal_id)
    goal_doc = goal_ref.get()

    if not goal_doc.exists:
        return api_error("Goal not found.", 404, code="goal_not_found")

    # OWNERSHIP CHECK
    if goal_doc.to_dict().get("userId") != g.uid:
        return api_error(
            "You do not have permission to delete this goal.",
            403,
            code="not_goal_owner",
        )

    goal_ref.delete()
    return api_success({"id": goal_id}, message="Goal deleted successfully.")
