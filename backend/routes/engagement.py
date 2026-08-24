# EcoTrack/backend/routes/engagement.py
"""
The retention layer: the evaluation-harness intervention log, login/logging
streaks, weekly self-relative challenges, and the points/tree reward that
sits on top of claiming one.

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

WHY A GROWING TREE, NOT A WALLET
-----------------------------------
Claiming a challenge earns points, and points grow a tree - seed through a
full banyan - on the Dashboard (see frontend/src/components/GrowingTree.jsx).
This is deliberately NOT a cash-back or withdrawal mechanic: this backend
never moves real money to a user, automatically or otherwise - see this
file's own claim_challenge for the honest framing of what "growing a tree"
represents, and Config.CATEGORIES-style constants below for where that
framing is defined in one place.

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

# --- Points and the tree reward ---
# Flat, not scaled by challenge difficulty - a log-frequency week and a
# reduction week take genuinely different kinds of effort, and trying to
# price those against each other precisely would be a guess dressed up as
# a formula. One number is honest about being a simple reward, not an
# attempt to measure how much a challenge was actually worth.
POINTS_PER_CHALLENGE_CLAIM = 50

# A goal (routes/goals.py) is a real, sustained commitment - weeks of
# staying under a self-chosen reduction target, not one week's habit - so
# it earns more than a weekly challenge claim. See routes/goals.py's
# update_goal for where this is awarded, with the same "check the OLD
# stored status first" guard claim_challenge already needed below, for the
# identical reason: recomputed completion (isAchieved) stays true forever
# once crossed, so only a genuine active->achieved transition should pay out.
POINTS_PER_GOAL_ACHIEVED = 150

# What a point is worth if it were ever turned into an actual donation -
# see this file's own module docstring and award_points() below for why
# that conversion is never executed automatically by this backend. A round,
# stated number (₹1 per 8 points - the same ratio as a full banyan being
# worth ₹100) rather than something that looks precision-calculated.
INR_PER_TREE = 100.0

# Seed through a full banyan. Fast enough that a single claim visibly moves
# the tree (the first stage costs exactly one claim) - a reward system
# where nothing visibly happens for weeks does not feel like a reward
# system - but the full banyan is a real multi-week goal, not something
# claimed away in one sitting.
TREE_STAGES = [
    {"key": "seed", "label": "Seed", "pointsRequired": 0},
    {"key": "sprout", "label": "Sprout", "pointsRequired": 50},
    {"key": "sapling", "label": "Sapling", "pointsRequired": 150},
    {"key": "young_tree", "label": "Young tree", "pointsRequired": 300},
    {"key": "mature_tree", "label": "Mature tree", "pointsRequired": 500},
    {"key": "banyan", "label": "Banyan", "pointsRequired": 800},
]
POINTS_PER_TREE = TREE_STAGES[-1]["pointsRequired"]


def _tree_progress(total_points):
    """
    Turn a lifetime points total into a tree's current growth state.

    Points keep accumulating past a full banyan rather than capping there -
    reaching the last stage should read as "grow another one", not "nothing
    left to do here". treesGrown counts full banyans standing BEHIND the one
    currently on screen; currentTreePoints drives that current tree.

    Landing on an exact multiple of POINTS_PER_TREE (just claimed the point
    that completes a banyan) is deliberately shown AS that completed banyan,
    not reset to an empty new seed - a caught-live bug in an earlier version
    of this function did exactly that (see test_tree_progress_reaches_full_
    banyan_at_exactly_the_threshold), which would have made finishing a tree
    look like losing it. The reset to a fresh seed only happens once the
    NEXT point earned actually pushes the total past this exact multiple.
    """
    trees_grown = total_points // POINTS_PER_TREE
    current_tree_points = total_points % POINTS_PER_TREE

    if current_tree_points == 0 and trees_grown > 0:
        trees_grown -= 1
        current_tree_points = POINTS_PER_TREE

    stage_index = 0
    for i, stage in enumerate(TREE_STAGES):
        if current_tree_points >= stage["pointsRequired"]:
            stage_index = i

    next_stage = TREE_STAGES[stage_index + 1] if stage_index + 1 < len(TREE_STAGES) else None

    return {
        "totalPoints": total_points,
        "treesGrown": trees_grown,
        "currentTreePoints": current_tree_points,
        "pointsPerTree": POINTS_PER_TREE,
        "stageIndex": stage_index,
        "stageKey": TREE_STAGES[stage_index]["key"],
        "stageLabel": TREE_STAGES[stage_index]["label"],
        "pointsToNextStage": (next_stage["pointsRequired"] - current_tree_points) if next_stage else 0,
        "nextStageLabel": next_stage["label"] if next_stage else None,
        "isFullyGrown": next_stage is None,
        "stages": TREE_STAGES,
        # The lifetime total's donation-equivalent, in rupees - see
        # INR_PER_TREE above. A running figure the user can see building up
        # (not just once a tree finishes), so it answers "how much have I
        # earned so far" the moment points exist at all.
        "donationValueInr": round((total_points / POINTS_PER_TREE) * INR_PER_TREE, 2),
    }


def award_points(uid, points):
    """
    Credit points to a user's lifetime total and return their new tree
    state - the one place both claim_challenge and routes/goals.py's
    update_goal go through, so "how a claim turns into a tree" has exactly
    one implementation.

    NEVER MOVES REAL MONEY
    This function only ever writes an integer to Firestore. donationValueInr
    above is a number shown to the user and, separately, visible to whoever
    runs this deployment (see routes/admin.py's stats) - turning it into an
    actual donation is a deliberate, manual decision made outside this
    codebase, the same way Donate.jsx's own donation buttons already work.
    Automating that transfer would mean this backend initiating real money
    movement on its own, which it does not do anywhere, on purpose.
    """
    db = get_db()
    user_ref = db.collection(Config.COLLECTION_USERS).document(uid)
    user_ref.set({"rewardPoints": gcloud_firestore.Increment(points)}, merge=True)
    # Increment() only queues the write - re-reading is what gets the real
    # new total back, needed for the tree-growth state below.
    total_points = user_ref.get().to_dict().get("rewardPoints", 0)
    return {"pointsEarned": points, **_tree_progress(total_points)}


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
    stored_status = data.get("status", "active")

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
        # A stored "claimed" always wins over the recomputed "achieved" -
        # is_complete is purely progress-based and stays true forever once
        # crossed, so without this a claimed challenge would report
        # "achieved" again on every later fetch (GET /challenges included),
        # showing the Claim button again for something already claimed and
        # its points already awarded. Caught while wiring points into
        # claim_challenge below - harmless before that (re-claiming just
        # re-set the same "claimed" status), a real double-award risk after.
        "status": stored_status if stored_status == "claimed" else ("achieved" if is_complete else stored_status),
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
    might not even be looking at the page.

    Also where POINTS_PER_CHALLENGE_CLAIM gets credited to the user's
    lifetime total and their tree grows a step - see _tree_progress above.
    Guarded against being called twice on the same challenge (explicitly,
    not just relying on isComplete staying true forever): before points had
    any real effect a repeat claim was harmless, just re-setting the same
    "claimed" status, but a repeat claim now would double-award points for
    one piece of work."""
    db = get_db()
    ref = db.collection(Config.COLLECTION_CHALLENGES).document(challenge_id)
    doc = ref.get()

    if not doc.exists:
        return api_error("Challenge not found.", 404, code="challenge_not_found")

    data = doc.to_dict()
    if data.get("userId") != g.uid:
        return api_error("Not your challenge.", 403, code="not_owner")

    if data.get("status") == "claimed":
        return api_error("This challenge was already claimed.", 400, code="already_claimed")

    week_start = date.fromisoformat(data["periodStart"])
    week_end = date.fromisoformat(data["periodEnd"])
    records_this_week = fetch_user_records(
        g.uid, start_date=week_start.isoformat(), end_date=week_end.isoformat()
    )
    serialized = _serialize_challenge(doc, records_this_week)

    if not serialized["isComplete"]:
        return api_error("This challenge is not complete yet.", 400, code="not_complete")

    ref.update({"status": "claimed"})

    return api_success({
        **serialized,
        "status": "claimed",
        "reward": award_points(g.uid, POINTS_PER_CHALLENGE_CLAIM),
    })


@engagement_bp.route("/rewards", methods=["GET"])
@require_auth
def rewards():
    """Current points total and tree-growth state - fetched on Dashboard
    load so the tree is right there without needing to claim something
    first to see it."""
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(g.uid).get()
    total_points = (user_doc.to_dict() or {}).get("rewardPoints", 0) if user_doc.exists else 0
    return api_success(_tree_progress(total_points))
