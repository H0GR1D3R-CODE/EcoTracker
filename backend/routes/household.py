# EcoTrack/backend/routes/household.py
"""
Household/group mode: a small, invite-code-joined group (family, hostel
room, college batch, workplace team) that sees a combined monthly
footprint, a points-ranked leaderboard, a shared weekly challenge, an
activity feed of real logged entries, and lightweight cheers on those
entries.

WHY RANKED BY POINTS, NOT RAW EMISSIONS
----------------------------------------
routes/insights.py's cohort comparison goes out of its way to avoid the
literature's "boomerang effect" - someone already doing better than average
drifting worse after being told so, via injunctive/approving framing rather
than a bare descriptive ranking. A household leaderboard has the exact same
risk in a more direct form: ranking members by "who emitted the least"
turns whoever emits the most (which may just mean a longer commute, not
less effort) into a visible loser every time they open the page. Ranking
by rewardPoints instead - the same lifetime effort figure the Dashboard's
reward tree already celebrates - keeps the leaderboard about visible
effort, not about whose life happens to have a smaller footprint. Each
member's own monthly emission is still shown, as context, never as the
sort key.

WHY THE ACTIVITY FEED IS COMPUTED, NOT A STORED EVENT LOG
Every other derived figure in this app (goal progress, challenge progress,
streaks) is worked out fresh on every request rather than cached and risking
drift - see goals.py's own module docstring. The activity feed follows the
same rule: it is built by querying each member's own real carbonRecords for
the last ACTIVITY_WINDOW_DAYS and merging them, not by writing a separate
"UserX logged an entry" event at save time. That means it can never go
stale or duplicate, at the cost of only being able to show real logged
entries - not synthetic events like "so-and-so joined a week ago", which
would need a stored timestamp this schema does not keep.

A user belongs to at most one household at a time - users/{uid}.householdId
points back to the household document, mirroring the pattern goals.py and
engagement.py already use for a document that references its owner.

Mounted at /api/household
"""

import secrets
import string
from datetime import date, timedelta

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import (
    api_error,
    api_success,
    fetch_user_records,
    group_by_category,
    month_bounds,
    require_auth,
    total_emission,
)
from routes.engagement import (
    POINTS_PER_CHALLENGE_CLAIM,
    _tree_progress,
    _week_bounds,
    award_points,
)

household_bp = Blueprint("household", __name__, url_prefix="/api/household")

# Small on purpose - a household is a family, a hostel room, a close group,
# not a leaderboard meant to scale. Keeping it small also keeps the
# per-member aggregation below cheap: a handful of fetch_user_records calls,
# not a collection scan.
MAX_HOUSEHOLD_MEMBERS = 10

# A classroom/team is the same document and the same mechanics - invite code,
# combined stats, shared challenge, activity feed - just at a different
# scale: a teacher's section or a workplace team, not a family. It gets its
# own, much larger cap rather than a second collection or route file; see
# groupType below.
MAX_CLASSROOM_MEMBERS = 60

# A workplace group is the exact same document and mechanics again, one
# tier further: an employer or SME sustainability lead tracking commute and
# workplace footprint as a team, not a classroom-sized group. A real
# company department can be larger than a single class, hence its own,
# larger cap - still capped at all, for the same per-member aggregation
# cost reasoning MAX_CLASSROOM_MEMBERS's own comment gives.
MAX_WORKPLACE_MEMBERS = 300

VALID_GROUP_TYPES = ("household", "classroom", "workplace")


def _max_members(group_type):
    if group_type == "classroom":
        return MAX_CLASSROOM_MEMBERS
    if group_type == "workplace":
        return MAX_WORKPLACE_MEMBERS
    return MAX_HOUSEHOLD_MEMBERS

MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 40

# O/0 and I/1 excluded - a code someone reads aloud or copies by hand should
# never be ambiguous about which character it was.
INVITE_CODE_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")
INVITE_CODE_LENGTH = 6

# How far back the activity feed looks, and how many entries it shows -
# a feed is for "what's been happening lately", not a full history (that is
# what each member's own Reports page is for).
ACTIVITY_WINDOW_DAYS = 7
ACTIVITY_FEED_LIMIT = 20

# Same reduction-ambition ratio engagement.py's own weekly challenges use
# (CHALLENGE_REDUCTION_TARGET_RATIO) - kept as its own constant here rather
# than imported, since a household target is a distinct, if parallel, idea:
# a reduction the WHOLE group has to hit together, not one person's target.
HOUSEHOLD_CHALLENGE_REDUCTION_RATIO = 0.9


def _generate_invite_code(db):
    """A short code, retried on the rare collision - see INVITE_CODE_ALPHABET."""
    for _ in range(5):
        code = "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))
        existing = (
            db.collection(Config.COLLECTION_HOUSEHOLDS)
            .where(filter=gcloud_firestore.FieldFilter("inviteCode", "==", code))
            .limit(1)
            .stream()
        )
        if not list(existing):
            return code
    # Astronomically unlikely at this table size, but never loop forever
    raise RuntimeError("Could not generate a unique invite code.")


def _member_stats(uid):
    """This member's name, this month's emission and category breakdown
    (the last for the profile drill-down), and their points/tree stage -
    reuses _tree_progress rather than reimplementing the same
    points-to-stage maths engagement.py's own /rewards route already has."""
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    profile = user_doc.to_dict() if user_doc.exists else {}

    today = date.today()
    start, end = month_bounds(today.year, today.month)
    records = fetch_user_records(uid, start_date=start, end_date=end)
    tree = _tree_progress(profile.get("rewardPoints", 0))

    return {
        "uid": uid,
        "name": profile.get("name") or "Member",
        "emissionThisMonthKg": total_emission(records),
        "categoryBreakdown": group_by_category(records),
        "rewardPoints": tree["totalPoints"],
        "stageLabel": tree["stageLabel"],
    }


def _serialize_household(household_doc, uid):
    data = household_doc.to_dict()
    member_uids = data.get("memberUids", [])
    members = [_member_stats(member_uid) for member_uid in member_uids]
    # Effort-ranked, not emission-ranked - see the module docstring for why.
    members.sort(key=lambda member: member["rewardPoints"], reverse=True)

    group_type = data.get("groupType") or "household"

    return {
        "inHousehold": True,
        "id": household_doc.id,
        "name": data.get("name", ""),
        "groupType": group_type,
        "inviteCode": data.get("inviteCode", ""),
        "isOwner": data.get("ownerUid") == uid,
        "memberCount": len(member_uids),
        "maxMembers": _max_members(group_type),
        "combinedEmissionThisMonthKg": round(
            sum(member["emissionThisMonthKg"] for member in members), 2
        ),
        # The organizer's pick for the category NEXT week's auto-generated
        # challenge should target - see _ensure_week_household_challenge.
        # None means "auto (whatever the group emits most)", the only
        # behaviour a plain household ever had.
        "preferredChallengeCategory": data.get("preferredChallengeCategory"),
        "members": members,
    }


def _get_own_household_doc(uid):
    """The current user's household document, or (None, None) if they are
    not in one - checked via users/{uid}.householdId rather than scanning
    every household's memberUids array."""
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    household_id = (user_doc.to_dict() or {}).get("householdId") if user_doc.exists else None
    if not household_id:
        return None, None
    household_ref = db.collection(Config.COLLECTION_HOUSEHOLDS).document(household_id)
    household_doc = household_ref.get()
    if not household_doc.exists:
        # The user doc points at a household that no longer exists (e.g. it
        # was deleted from under them) - self-heal rather than error forever.
        db.collection(Config.COLLECTION_USERS).document(uid).update({"householdId": None})
        return None, None
    return household_ref, household_doc


# ---------------------------------------------------------------------------
# GET /api/household
# ---------------------------------------------------------------------------

@household_bp.route("", methods=["GET"])
@require_auth
def get_household():
    _ref, doc = _get_own_household_doc(g.uid)
    if doc is None:
        return api_success({"inHousehold": False})
    return api_success(_serialize_household(doc, g.uid))


# ---------------------------------------------------------------------------
# POST /api/household        (create)
# ---------------------------------------------------------------------------

@household_bp.route("", methods=["POST"])
@require_auth
def create_household():
    """Body: {"name": "The Green Team", "groupType": "household" | "classroom" | "workplace"}

    groupType defaults to "household" so every existing caller (and the
    tests) that never send it keeps behaving exactly as before.
    """
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()
    group_type = str(body.get("groupType") or "household").strip().lower()

    if len(name) < MIN_NAME_LENGTH or len(name) > MAX_NAME_LENGTH:
        return api_error(
            f"Name must be between {MIN_NAME_LENGTH} and {MAX_NAME_LENGTH} characters.",
            400,
            code="invalid_name",
        )

    if group_type not in VALID_GROUP_TYPES:
        return api_error(
            f"groupType must be one of: {', '.join(VALID_GROUP_TYPES)}.",
            400,
            code="invalid_group_type",
        )

    existing_ref, _existing_doc = _get_own_household_doc(g.uid)
    if existing_ref is not None:
        return api_error(
            "You're already in a household. Leave it before creating another.",
            409,
            code="already_in_household",
        )

    db = get_db()
    invite_code = _generate_invite_code(db)

    household_ref = db.collection(Config.COLLECTION_HOUSEHOLDS).document()
    household_ref.set({
        "name": name,
        "groupType": group_type,
        "ownerUid": g.uid,
        "memberUids": [g.uid],
        "inviteCode": invite_code,
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })
    db.collection(Config.COLLECTION_USERS).document(g.uid).set(
        {"householdId": household_ref.id}, merge=True
    )

    return api_success(
        _serialize_household(household_ref.get(), g.uid),
        message="Household created.",
        status=201,
    )


# ---------------------------------------------------------------------------
# POST /api/household/join
# ---------------------------------------------------------------------------

@household_bp.route("/join", methods=["POST"])
@require_auth
def join_household():
    """Body: {"inviteCode": "AB3XZQ"}"""
    body = request.get_json(silent=True) or {}
    invite_code = str(body.get("inviteCode", "")).strip().upper()

    if not invite_code:
        return api_error("An invite code is required.", 400, code="missing_invite_code")

    existing_ref, _existing_doc = _get_own_household_doc(g.uid)
    if existing_ref is not None:
        return api_error(
            "You're already in a household. Leave it before joining another.",
            409,
            code="already_in_household",
        )

    db = get_db()
    matches = list(
        db.collection(Config.COLLECTION_HOUSEHOLDS)
        .where(filter=gcloud_firestore.FieldFilter("inviteCode", "==", invite_code))
        .limit(1)
        .stream()
    )
    if not matches:
        return api_error("No household found for that invite code.", 404, code="household_not_found")

    household_doc = matches[0]
    household_ref = household_doc.reference
    matched_data = household_doc.to_dict()
    member_uids = matched_data.get("memberUids", [])
    max_members = _max_members(matched_data.get("groupType") or "household")

    if len(member_uids) >= max_members:
        return api_error(
            f"This household already has the maximum of {max_members} members.",
            400,
            code="household_full",
        )

    household_ref.update({"memberUids": gcloud_firestore.ArrayUnion([g.uid])})
    db.collection(Config.COLLECTION_USERS).document(g.uid).set(
        {"householdId": household_ref.id}, merge=True
    )

    return api_success(_serialize_household(household_ref.get(), g.uid), message="Joined household.")


# ---------------------------------------------------------------------------
# POST /api/household/leave
# ---------------------------------------------------------------------------

def _leave_household_for(uid):
    """
    The actual leave-a-household logic, factored out of the route below so
    routes/auth.py's account-deletion cascade can reuse the exact same
    membership/ownership-handoff/disband rules rather than a second,
    driftable copy of them.

    Returns (was_in_household, was_disbanded) - the route below turns that
    into its own success/error response and message; the deletion cascade
    just needs the side effect and does not care which message would have
    been shown.
    """
    household_ref, household_doc = _get_own_household_doc(uid)
    if household_ref is None:
        return False, False

    data = household_doc.to_dict()
    remaining = [member for member in data.get("memberUids", []) if member != uid]

    db = get_db()
    db.collection(Config.COLLECTION_USERS).document(uid).set({"householdId": None}, merge=True)

    if not remaining:
        # The last member leaving deletes the household - an empty group
        # with a live invite code would just be a dangling door to nowhere.
        household_ref.delete()
        return True, True

    update = {"memberUids": remaining}
    if data.get("ownerUid") == uid:
        # Ownership passes to whoever is left, arbitrarily but deterministically
        update["ownerUid"] = remaining[0]
    household_ref.update(update)

    return True, False


@household_bp.route("/leave", methods=["POST"])
@require_auth
def leave_household():
    was_in_household, was_disbanded = _leave_household_for(g.uid)
    if not was_in_household:
        return api_error("You're not in a household.", 400, code="not_in_household")

    message = "Household disbanded." if was_disbanded else "Left the household."
    return api_success({"inHousehold": False}, message=message)


# ---------------------------------------------------------------------------
# DELETE /api/household/members/<member_uid>        (owner-only kick)
# ---------------------------------------------------------------------------

@household_bp.route("/members/<member_uid>", methods=["DELETE"])
@require_auth
def remove_member(member_uid):
    household_ref, household_doc = _get_own_household_doc(g.uid)
    if household_ref is None:
        return api_error("You're not in a household.", 400, code="not_in_household")

    data = household_doc.to_dict()
    if data.get("ownerUid") != g.uid:
        return api_error("Only the household owner can remove a member.", 403, code="not_owner")

    if member_uid == g.uid:
        return api_error("Use leave instead of removing yourself.", 400, code="cannot_remove_self")

    if member_uid not in data.get("memberUids", []):
        return api_error("That person is not in this household.", 404, code="member_not_found")

    household_ref.update({"memberUids": gcloud_firestore.ArrayRemove([member_uid])})

    db = get_db()
    db.collection(Config.COLLECTION_USERS).document(member_uid).set({"householdId": None}, merge=True)

    return api_success(_serialize_household(household_ref.get(), g.uid), message="Member removed.")


# ---------------------------------------------------------------------------
# GET /api/household/activity      (real logged entries, merged + cheers)
# ---------------------------------------------------------------------------

def _cheer_counts_for(db, household_id, record_ids):
    """{recordId: {"count": n, "cheeredByMe": bool}} for a batch of records -
    one query for the whole household's cheer docs rather than one per
    record, since Firestore has no cheap "IN this set of doc ids" batch read
    across arbitrary ids without a matching where-in of similar size."""
    if not record_ids:
        return {}
    counts = {record_id: {"count": 0, "cheeredByMe": False} for record_id in record_ids}
    docs = (
        db.collection(Config.COLLECTION_HOUSEHOLD_CHEERS)
        .where(filter=gcloud_firestore.FieldFilter("householdId", "==", household_id))
        .stream()
    )
    for doc in docs:
        data = doc.to_dict()
        record_id = data.get("recordId")
        if record_id not in counts:
            continue
        cheerer_uids = data.get("cheererUids", [])
        counts[record_id] = {
            "count": len(cheerer_uids),
            "cheeredByMe": g.uid in cheerer_uids,
        }
    return counts


@household_bp.route("/activity", methods=["GET"])
@require_auth
def get_activity():
    household_ref, household_doc = _get_own_household_doc(g.uid)
    if household_ref is None:
        return api_error("You're not in a household.", 400, code="not_in_household")

    data = household_doc.to_dict()
    member_uids = data.get("memberUids", [])

    db = get_db()
    names_by_uid = {}
    for member_uid in member_uids:
        user_doc = db.collection(Config.COLLECTION_USERS).document(member_uid).get()
        names_by_uid[member_uid] = (user_doc.to_dict() or {}).get("name") or "Member"

    window_start = (date.today() - timedelta(days=ACTIVITY_WINDOW_DAYS)).isoformat()

    merged = []
    for member_uid in member_uids:
        for record in fetch_user_records(member_uid, start_date=window_start):
            merged.append({
                "recordId": record["id"],
                "uid": member_uid,
                "name": names_by_uid.get(member_uid, "Member"),
                "category": record["category"],
                "emissionKgco2": record["emissionKgco2"],
                "recordedDate": record["recordedDate"],
                "createdAt": record["createdAt"],
            })

    # Newest first, capped - a feed, not a full export
    merged.sort(key=lambda item: (item["recordedDate"], item["createdAt"] or ""), reverse=True)
    merged = merged[:ACTIVITY_FEED_LIMIT]

    cheer_counts = _cheer_counts_for(db, household_ref.id, [item["recordId"] for item in merged])
    for item in merged:
        cheer_state = cheer_counts.get(item["recordId"], {"count": 0, "cheeredByMe": False})
        item["cheerCount"] = cheer_state["count"]
        item["cheeredByMe"] = cheer_state["cheeredByMe"]

    return api_success({"activity": merged})


# ---------------------------------------------------------------------------
# POST /api/household/activity/<record_id>/cheer      (toggle)
# ---------------------------------------------------------------------------

@household_bp.route("/activity/<record_id>/cheer", methods=["POST"])
@require_auth
def toggle_cheer(record_id):
    household_ref, household_doc = _get_own_household_doc(g.uid)
    if household_ref is None:
        return api_error("You're not in a household.", 400, code="not_in_household")

    member_uids = household_doc.to_dict().get("memberUids", [])

    db = get_db()
    record_doc = db.collection(Config.COLLECTION_CARBON_RECORDS).document(record_id).get()
    if not record_doc.exists or record_doc.to_dict().get("userId") not in member_uids:
        return api_error(
            "That entry isn't part of your household's activity.", 404, code="record_not_found"
        )

    cheer_ref = db.collection(Config.COLLECTION_HOUSEHOLD_CHEERS).document(
        f"{household_ref.id}_{record_id}"
    )
    cheer_doc = cheer_ref.get()
    existing_uids = cheer_doc.to_dict().get("cheererUids", []) if cheer_doc.exists else []

    if g.uid in existing_uids:
        cheer_ref.update({"cheererUids": gcloud_firestore.ArrayRemove([g.uid])})
        cheered = False
        count = len(existing_uids) - 1
    else:
        cheer_ref.set(
            {
                "householdId": household_ref.id,
                "recordId": record_id,
                "cheererUids": gcloud_firestore.ArrayUnion([g.uid]),
            },
            merge=True,
        )
        cheered = True
        count = len(existing_uids) + 1

    return api_success({"recordId": record_id, "cheerCount": max(0, count), "cheeredByMe": cheered})


# ---------------------------------------------------------------------------
# GET /api/household/challenge     (auto-creates this week's, if needed)
# ---------------------------------------------------------------------------

def _ensure_week_household_challenge(household_id, member_uids, today, preferred_category=None):
    """
    Return this week's household challenge document, creating it on first
    request of the week - the same lazy-creation pattern
    engagement.py's own _ensure_week_challenges uses for personal
    challenges, just aggregated across every member instead of one person.

    preferred_category is the organizer's pick (household.preferredChallengeCategory)
    for what THIS challenge, once it is created, should target - it only
    has any effect the first time this is called for a given week, same as
    every other input to this function; changing the preference mid-week
    never rewrites a challenge already in progress; it takes effect once
    this week's challenge is claimed or ends and the next one is created.
    """
    db = get_db()
    week_start, week_end = _week_bounds(today)
    period_start = week_start.isoformat()

    existing = list(
        db.collection(Config.COLLECTION_HOUSEHOLD_CHALLENGES)
        .where(filter=gcloud_firestore.FieldFilter("householdId", "==", household_id))
        .where(filter=gcloud_firestore.FieldFilter("periodStart", "==", period_start))
        .limit(1)
        .stream()
    )
    if existing:
        return existing[0]

    # Baseline: the 4 weeks before this one, across every member, excluding
    # this week - the same reasoning engagement.py's own baseline uses, so
    # nothing done after the challenge starts can inflate or deflate it.
    baseline_start = (week_start - timedelta(weeks=4)).isoformat()
    baseline_end = (week_start - timedelta(days=1)).isoformat()

    category_totals = {}
    for member_uid in member_uids:
        for record in fetch_user_records(member_uid, start_date=baseline_start, end_date=baseline_end):
            category_totals[record["category"]] = (
                category_totals.get(record["category"], 0.0) + record["emissionKgco2"]
            )

    challenge_ref = db.collection(Config.COLLECTION_HOUSEHOLD_CHALLENGES).document()

    if not category_totals:
        # Nothing logged yet as a household - still create a placeholder so
        # the frontend has something to show ("log a few entries first"),
        # rather than a route that sometimes returns nothing at all.
        challenge_ref.set({
            "householdId": household_id,
            "type": "category_reduction",
            "category": None,
            "target": 0,
            "baseline": 0,
            "periodStart": period_start,
            "periodEnd": week_end.isoformat(),
            "status": "active",
            "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
        })
        return challenge_ref.get()

    # An organizer's pick only counts if the group actually has a real
    # baseline in it - a 0 kg baseline would make a 0 kg target, which is
    # "complete" the instant the week ends whether or not anyone did
    # anything, not a meaningful challenge. Falls back to the usual
    # top-emitting category exactly as a plain household always has.
    if preferred_category and category_totals.get(preferred_category, 0) > 0:
        top_category = preferred_category
    else:
        top_category = max(category_totals, key=category_totals.get)
    weekly_baseline = round(category_totals[top_category] / 4, 2)
    target = round(weekly_baseline * HOUSEHOLD_CHALLENGE_REDUCTION_RATIO, 2)

    challenge_ref.set({
        "householdId": household_id,
        "type": "category_reduction",
        "category": top_category,
        "target": target,
        "baseline": weekly_baseline,
        "periodStart": period_start,
        "periodEnd": week_end.isoformat(),
        "status": "active",
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })
    return challenge_ref.get()


def _serialize_household_challenge(doc, member_uids):
    data = doc.to_dict()
    category = data.get("category")
    target = float(data.get("target", 0))
    stored_status = data.get("status", "active")

    if category is None:
        return {
            "id": doc.id,
            "available": False,
            "periodStart": data.get("periodStart"),
            "periodEnd": data.get("periodEnd"),
        }

    period_start = data.get("periodStart")
    period_end = data.get("periodEnd")
    combined_total = 0.0
    for member_uid in member_uids:
        records = fetch_user_records(member_uid, start_date=period_start, end_date=period_end)
        combined_total += sum(r["emissionKgco2"] for r in records if r["category"] == category)
    combined_total = round(combined_total, 2)

    # Requires the week to actually be OVER, the same fix and the same
    # reasoning as engagement.py's own _serialize_challenge: with nothing
    # logged yet, combined_total=0 is trivially "under target" from minute
    # one of the week, which would let the whole household claim a shared
    # challenge for doing nothing at all.
    week_has_ended = date.today() > date.fromisoformat(period_end)
    is_complete = combined_total <= target and week_has_ended
    baseline = float(data.get("baseline", target)) or 1.0
    progress_percent = round(max(0.0, min(100.0, (1 - combined_total / baseline) * 100)), 1)

    return {
        "id": doc.id,
        "available": True,
        "category": category,
        "target": target,
        "baseline": data.get("baseline"),
        "progress": combined_total,
        "progressPercent": progress_percent,
        "isComplete": is_complete,
        "status": stored_status if stored_status == "claimed" else ("achieved" if is_complete else stored_status),
        "periodStart": period_start,
        "periodEnd": period_end,
    }


@household_bp.route("/challenge", methods=["GET"])
@require_auth
def get_challenge():
    household_ref, household_doc = _get_own_household_doc(g.uid)
    if household_ref is None:
        return api_error("You're not in a household.", 400, code="not_in_household")

    data = household_doc.to_dict()
    member_uids = data.get("memberUids", [])
    doc = _ensure_week_household_challenge(
        household_ref.id, member_uids, date.today(), preferred_category=data.get("preferredChallengeCategory")
    )
    return api_success(_serialize_household_challenge(doc, member_uids))


@household_bp.route("/challenge/<challenge_id>/claim", methods=["POST"])
@require_auth
def claim_household_challenge(challenge_id):
    """Any member may claim a completed household challenge - it belongs to
    the group, not to whoever happens to be looking at the moment it
    finishes. Every current member earns POINTS_PER_CHALLENGE_CLAIM, same as
    a personal challenge claim - a shared effort is worth the same
    celebration for everyone who was part of it."""
    household_ref, household_doc = _get_own_household_doc(g.uid)
    if household_ref is None:
        return api_error("You're not in a household.", 400, code="not_in_household")

    member_uids = household_doc.to_dict().get("memberUids", [])

    db = get_db()
    challenge_ref = db.collection(Config.COLLECTION_HOUSEHOLD_CHALLENGES).document(challenge_id)
    challenge_doc = challenge_ref.get()

    if not challenge_doc.exists or challenge_doc.to_dict().get("householdId") != household_ref.id:
        return api_error("Challenge not found.", 404, code="challenge_not_found")

    data = challenge_doc.to_dict()
    if data.get("status") == "claimed":
        return api_error("This challenge was already claimed.", 400, code="already_claimed")

    serialized = _serialize_household_challenge(challenge_doc, member_uids)
    if not serialized.get("available") or not serialized["isComplete"]:
        return api_error("This challenge is not complete yet.", 400, code="not_complete")

    challenge_ref.update({"status": "claimed"})

    rewards = {member_uid: award_points(member_uid, POINTS_PER_CHALLENGE_CLAIM) for member_uid in member_uids}

    return api_success({**serialized, "status": "claimed", "rewards": rewards})


# ---------------------------------------------------------------------------
# PUT /api/household/challenge-focus     (owner-only, sets NEXT week's category)
# ---------------------------------------------------------------------------

@household_bp.route("/challenge-focus", methods=["PUT"])
@require_auth
def set_challenge_focus():
    """
    Body: {"category": "transport"} or {"category": null} to go back to auto.

    This is the "assigns shared challenges" half of classroom/workplace mode
    - a household never had a way to pick its own focus, only the
    auto-selected top-emitting category. Owner-only, same authority as
    removing a member; a classroom or workplace's organizer role and a
    household's owner role are the same field (ownerUid), so this works for
    any groupType, though the frontend only surfaces the control for
    non-household groups.
    """
    body = request.get_json(silent=True) or {}
    category = body.get("category")

    if category is not None and category not in Config.CATEGORIES:
        return api_error("Not a recognised category.", 400, code="invalid_category")

    household_ref, household_doc = _get_own_household_doc(g.uid)
    if household_ref is None:
        return api_error("You're not in a household.", 400, code="not_in_household")

    if household_doc.to_dict().get("ownerUid") != g.uid:
        return api_error("Only the organizer can set the challenge focus.", 403, code="not_owner")

    household_ref.update({"preferredChallengeCategory": category})

    return api_success(
        _serialize_household(household_ref.get(), g.uid),
        message="Focus set for next week's challenge." if category else "Back to an automatic focus.",
    )
