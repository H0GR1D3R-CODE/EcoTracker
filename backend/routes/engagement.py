# EcoTrack/backend/routes/engagement.py
"""
The retention layer: the evaluation-harness intervention log, login/logging
streaks, and weekly self-relative challenges.

TWO WAYS AN INTERVENTION GETS LOGGED
-------------------------------------
Server-generated recommendations (a forecast, a ranked swap list, a cohort
comparison) log themselves at the moment they are computed - see
routes/insights.py's _log_intervention. That is more efficient than the
frontend making a second round trip to announce something the server just
built, and it can never be forgotten or spoofed.

Client-rendered nudges that have no server round trip of their own (a quick-
log chip suggestion, a streak-freeze notice, a challenge reminder) have
nothing to log themselves at generation time, so POST /interventions below
is the generic entry point for those - called by
frontend/src/hooks/useIntervention.js.

Mounted at /api/engagement
"""

from datetime import date, timedelta

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, fetch_user_records, require_auth, total_emission

engagement_bp = Blueprint("engagement", __name__, url_prefix="/api/engagement")

VALID_INTERVENTION_ACTIONS = ["accepted", "dismissed"]

# How many trailing days count towards the streak and challenge windows
STREAK_LOOKBACK_DAYS = 120
CHALLENGE_LOG_DAYS_TARGET = 5  # out of 7
CHALLENGE_REDUCTION_TARGET_RATIO = 0.9  # keep the week's total under 90% of baseline


# ---------------------------------------------------------------------------
# POST /api/engagement/interventions      (generic log-a-shown-recommendation)
# ---------------------------------------------------------------------------

@engagement_bp.route("/interventions", methods=["POST"])
@require_auth
def log_intervention():
    """
    Body: {"type": "quick_log_suggestion", "variant": "template_chip",
           "payloadSummary": {...}, "projectedSavingKg": 1.2}
    """
    body = request.get_json(silent=True) or {}
    intervention_type = str(body.get("type", "")).strip()
    if not intervention_type:
        return api_error("type is required.", 400, code="missing_type")

    db = get_db()
    ref = db.collection(Config.COLLECTION_INTERVENTIONS).document()
    ref.set({
        "userId": g.uid,
        "type": intervention_type,
        "variant": str(body.get("variant", "")).strip(),
        "payloadSummary": body.get("payloadSummary") or {},
        "projectedSavingKg": body.get("projectedSavingKg"),
        "shownAt": gcloud_firestore.SERVER_TIMESTAMP,
        "action": "shown",
        "actedAt": None,
    })

    return api_success({"id": ref.id}, status=201)


# ---------------------------------------------------------------------------
# PATCH /api/engagement/interventions/<id>      (record what the user did)
# ---------------------------------------------------------------------------

@engagement_bp.route("/interventions/<intervention_id>", methods=["PATCH"])
@require_auth
def update_intervention(intervention_id):
    """Body: {"action": "accepted" | "dismissed", "observedDeltaKg": -1.2}"""
    body = request.get_json(silent=True) or {}
    action = str(body.get("action", "")).strip()

    if action not in VALID_INTERVENTION_ACTIONS:
        return api_error(
            f"action must be one of: {', '.join(VALID_INTERVENTION_ACTIONS)}.",
            400,
            code="invalid_action",
        )

    db = get_db()
    ref = db.collection(Config.COLLECTION_INTERVENTIONS).document(intervention_id)
    doc = ref.get()

    if not doc.exists:
        return api_error("Intervention not found.", 404, code="intervention_not_found")
    if doc.to_dict().get("userId") != g.uid:
        return api_error("Not your intervention.", 403, code="not_owner")

    update = {"action": action, "actedAt": gcloud_firestore.SERVER_TIMESTAMP}
    if "observedDeltaKg" in body:
        try:
            update["observedDeltaKg"] = float(body.get("observedDeltaKg"))
        except (TypeError, ValueError):
            pass

    ref.update(update)
    return api_success({"id": intervention_id, "action": action})


# ---------------------------------------------------------------------------
# Streak
# ---------------------------------------------------------------------------

def _longest_streak(active_dates):
    """Longest run of consecutive calendar days present in a set of ISO date strings."""
    if not active_dates:
        return 0
    parsed = sorted(date.fromisoformat(d) for d in active_dates)
    longest = current = 1
    for previous, current_day in zip(parsed, parsed[1:]):
        if (current_day - previous).days == 1:
            current += 1
            longest = max(longest, current)
        else:
            current = 1
    return longest


def _compute_streak(records, today):
    """
    Consecutive-day logging streak, with ONE FREEZE EARNED PER 7 CONSECUTIVE
    LOGGED DAYS and usable on the next gap day to keep the streak alive
    without extending it. Earned freezes do not bank beyond one at a time -
    a second gap right after using one requires another 7-day run first.

    Today is not penalised if nothing has been logged yet: a day is not
    "missed" until it is over, so the evaluated window ends at yesterday in
    that case, and the frontend shows today as "log something to keep your
    streak" rather than treating the streak as already broken.

    WALK DIRECTION MATTERS HERE (worth defending in the viva): a freeze can
    only be spent AFTER it has been earned, so this has to walk FORWARD
    through time (oldest day first) - earning freezes as 7-day runs
    complete, spending one the moment a gap is reached. An earlier version
    of this function walked backward from today and broke on the first gap
    it met, even when a long run sat just beyond it: walking backward can
    never know about a freeze earned "later" in that walk (i.e. earlier in
    real time) until it is too late to use it. See
    tests/test_engagement.py for the case that caught this.

    Pure function of the record dates - no streak state is stored anywhere,
    so there is nothing to go stale or drift from what was actually logged.
    """
    active = {r["recordedDate"] for r in records}
    longest = _longest_streak(active)

    if not active:
        return {"currentStreak": 0, "longestStreak": 0, "loggedToday": False, "freezesUsed": 0}

    def has_log(d):
        return d.isoformat() in active

    logged_today = has_log(today)
    end_cursor = today if logged_today else today - timedelta(days=1)
    start_cursor = end_cursor - timedelta(days=STREAK_LOOKBACK_DAYS - 1)

    streak = 0
    days_since_freeze = 0
    freeze_available = False
    freezes_used = 0

    cursor = start_cursor
    while cursor <= end_cursor:
        if has_log(cursor):
            streak += 1
            days_since_freeze += 1
            if days_since_freeze >= 7:
                freeze_available = True
                days_since_freeze = 0
        elif freeze_available:
            # Bridge this one gap day: the streak survives but does not grow,
            # and the freeze must be earned again before it can protect another gap.
            freeze_available = False
            freezes_used += 1
        else:
            # No freeze banked - the run genuinely breaks and starts over
            streak = 0
            days_since_freeze = 0

        cursor += timedelta(days=1)

    return {
        "currentStreak": streak,
        "longestStreak": max(longest, streak),
        "loggedToday": logged_today,
        "freezesUsed": freezes_used,
    }


@engagement_bp.route("/streak", methods=["GET"])
@require_auth
def streak():
    window_start = (date.today() - timedelta(days=STREAK_LOOKBACK_DAYS)).isoformat()
    records = fetch_user_records(g.uid, start_date=window_start)
    result = _compute_streak(records, date.today())
    # Reuses the same fetch the streak maths already needed - ActivityHeatmap.jsx
    # renders straight from this instead of the frontend making a second
    # request for data this route already has in hand.
    result["activeDates"] = sorted({r["recordedDate"] for r in records})
    return api_success(result)


# ---------------------------------------------------------------------------
# Weekly challenges
# ---------------------------------------------------------------------------

def _week_bounds(today):
    """Monday-to-Sunday week containing `today`, as ISO date strings."""
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)
    return start, end


def _ensure_week_challenges(uid, today):
    """
    Return this week's challenge documents, creating them on first request of
    the week. The TARGET is computed once at creation time from data available
    then, and never recalculated afterwards - otherwise a challenge whose bar
    moves as the week's own data comes in would not be a real target.
    """
    db = get_db()
    week_start, week_end = _week_bounds(today)
    period_start = week_start.isoformat()

    existing = list(
        db.collection(Config.COLLECTION_CHALLENGES)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .where(filter=gcloud_firestore.FieldFilter("periodStart", "==", period_start))
        .stream()
    )
    if existing:
        return existing, week_start, week_end

    # --- baseline for the self-relative reduction challenge ---
    # The 4 weeks before this one, excluding it, so the target cannot be
    # inflated or deflated by anything the user does after the challenge starts.
    baseline_start = (week_start - timedelta(weeks=4)).isoformat()
    baseline_end = (week_start - timedelta(days=1)).isoformat()
    baseline_records = fetch_user_records(uid, start_date=baseline_start, end_date=baseline_end)

    category_totals = {}
    for record in baseline_records:
        category_totals[record["category"]] = category_totals.get(record["category"], 0.0) + record[
            "emissionKgco2"
        ]

    created = []
    log_challenge_ref = db.collection(Config.COLLECTION_CHALLENGES).document()
    log_challenge_ref.set({
        "userId": uid,
        "type": "log_frequency",
        "target": CHALLENGE_LOG_DAYS_TARGET,
        "periodStart": period_start,
        "periodEnd": week_end.isoformat(),
        "progress": 0,
        "status": "active",
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })
    created.append(log_challenge_ref)

    if category_totals:
        # The category the user emits the most from is the one a reduction
        # target is most meaningful for - a challenge on their smallest
        # category would be trivially easy and would not change anything real.
        top_category = max(category_totals, key=category_totals.get)
        weekly_baseline = round(category_totals[top_category] / 4, 2)
        if weekly_baseline > 0:
            target = round(weekly_baseline * CHALLENGE_REDUCTION_TARGET_RATIO, 2)
            reduction_ref = db.collection(Config.COLLECTION_CHALLENGES).document()
            reduction_ref.set({
                "userId": uid,
                "type": "category_reduction",
                "category": top_category,
                "target": target,
                "baseline": weekly_baseline,
                "periodStart": period_start,
                "periodEnd": week_end.isoformat(),
                "progress": 0,
                "status": "active",
                "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
            })
            created.append(reduction_ref)

    return [ref.get() for ref in created], week_start, week_end


def _serialize_challenge(doc, records_this_week):
    data = doc.to_dict()
    challenge_type = data.get("type")
    target = float(data.get("target", 0))

    if challenge_type == "log_frequency":
        progress = len({r["recordedDate"] for r in records_this_week})
        is_complete = progress >= target
        progress_percent = round(min(100.0, (progress / target) * 100), 1) if target else 0.0
    elif challenge_type == "category_reduction":
        category = data.get("category")
        category_total = round(
            sum(r["emissionKgco2"] for r in records_this_week if r["category"] == category), 2
        )
        progress = category_total
        # Lower is better here, so "complete" means staying UNDER the target,
        # and progress-towards-completion runs the opposite way from a normal bar
        is_complete = category_total <= target
        baseline = float(data.get("baseline", target)) or 1.0
        progress_percent = round(max(0.0, min(100.0, (1 - category_total / baseline) * 100)), 1)
    else:
        progress = 0
        is_complete = False
        progress_percent = 0.0

    return {
        "id": doc.id,
        "type": challenge_type,
        "category": data.get("category"),
        "target": target,
        "baseline": data.get("baseline"),
        "progress": progress,
        "progressPercent": progress_percent,
        "isComplete": is_complete,
        "status": "achieved" if is_complete else data.get("status", "active"),
        "periodStart": data.get("periodStart"),
        "periodEnd": data.get("periodEnd"),
    }


@engagement_bp.route("/challenges", methods=["GET"])
@require_auth
def challenges():
    today = date.today()
    docs, week_start, week_end = _ensure_week_challenges(g.uid, today)
    records_this_week = fetch_user_records(
        g.uid, start_date=week_start.isoformat(), end_date=week_end.isoformat()
    )

    serialized = [_serialize_challenge(doc, records_this_week) for doc in docs]
    return api_success({"challenges": serialized, "weekStart": week_start.isoformat()})


@engagement_bp.route("/challenges/<challenge_id>/claim", methods=["POST"])
@require_auth
def claim_challenge(challenge_id):
    """Mark a completed challenge as claimed - a small acknowledgement step
    that gives the confetti moment something explicit to fire on, rather than
    firing automatically the instant progress crosses the line while the user
    might not even be looking at the page."""
    db = get_db()
    ref = db.collection(Config.COLLECTION_CHALLENGES).document(challenge_id)
    doc = ref.get()

    if not doc.exists:
        return api_error("Challenge not found.", 404, code="challenge_not_found")

    data = doc.to_dict()
    if data.get("userId") != g.uid:
        return api_error("Not your challenge.", 403, code="not_owner")

    week_start = date.fromisoformat(data["periodStart"])
    week_end = date.fromisoformat(data["periodEnd"])
    records_this_week = fetch_user_records(
        g.uid, start_date=week_start.isoformat(), end_date=week_end.isoformat()
    )
    serialized = _serialize_challenge(doc, records_this_week)

    if not serialized["isComplete"]:
        return api_error("This challenge is not complete yet.", 400, code="not_complete")

    ref.update({"status": "claimed"})
    return api_success({**serialized, "status": "claimed"})
