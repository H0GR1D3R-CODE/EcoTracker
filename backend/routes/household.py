# EcoTrack/backend/routes/household.py
"""
Household/group mode: a small, invite-code-joined group (family, hostel
room, college batch) that sees a combined monthly footprint and a
points-ranked leaderboard.

WHY RANKED BY POINTS, NOT RAW EMISSIONS
----------------------------------------
routes/insights.py's cohort comparison goes out of its way to avoid the
literature's "boomerang effect" - someone already doing better than average
drifting worse after being told so, via injunctive/approving framing rather
than a bare descriptive ranking. A household leaderboard has the exact same
risk in a more direct form: ranking members by "who emitted the least" turns
whoever emits the most (which may just mean a longer commute, not less
effort) into a visible loser every time they open the page. Ranking by
rewardPoints instead - the same lifetime effort figure the Dashboard's
reward tree already celebrates - keeps the leaderboard about visible effort,
not about whose life happens to have a smaller footprint. Each member's own
monthly emission is still shown, as context, never as the sort key.

A user belongs to at most one household at a time - users/{uid}.householdId
points back to the household document, mirroring the pattern goals.py and
engagement.py already use for a document that references its owner.

Mounted at /api/household
"""

import secrets
import string
from datetime import date

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, fetch_user_records, month_bounds, require_auth, total_emission
from routes.engagement import _tree_progress

household_bp = Blueprint("household", __name__, url_prefix="/api/household")

# Small on purpose - a household is a family, a hostel room, a close group,
# not a leaderboard meant to scale. Keeping it small also keeps the
# per-member aggregation below cheap: a handful of fetch_user_records calls,
# not a collection scan.
MAX_HOUSEHOLD_MEMBERS = 10

MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 40

# O/0 and I/1 excluded - a code someone reads aloud or copies by hand should
# never be ambiguous about which character it was.
INVITE_CODE_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")
INVITE_CODE_LENGTH = 6


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
    """This member's name, this month's emission, and their points/tree
    stage - reuses _tree_progress rather than reimplementing the same
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
        "rewardPoints": tree["totalPoints"],
        "stageLabel": tree["stageLabel"],
    }


def _serialize_household(household_doc, uid):
    data = household_doc.to_dict()
    member_uids = data.get("memberUids", [])
    members = [_member_stats(member_uid) for member_uid in member_uids]
    # Effort-ranked, not emission-ranked - see the module docstring for why.
    members.sort(key=lambda member: member["rewardPoints"], reverse=True)

    return {
        "inHousehold": True,
        "id": household_doc.id,
        "name": data.get("name", ""),
        "inviteCode": data.get("inviteCode", ""),
        "isOwner": data.get("ownerUid") == uid,
        "memberCount": len(member_uids),
        "combinedEmissionThisMonthKg": round(
            sum(member["emissionThisMonthKg"] for member in members), 2
        ),
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
    """Body: {"name": "The Green Team"}"""
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()

    if len(name) < MIN_NAME_LENGTH or len(name) > MAX_NAME_LENGTH:
        return api_error(
            f"Name must be between {MIN_NAME_LENGTH} and {MAX_NAME_LENGTH} characters.",
            400,
            code="invalid_name",
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
    member_uids = household_doc.to_dict().get("memberUids", [])

    if len(member_uids) >= MAX_HOUSEHOLD_MEMBERS:
        return api_error(
            f"This household already has the maximum of {MAX_HOUSEHOLD_MEMBERS} members.",
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

@household_bp.route("/leave", methods=["POST"])
@require_auth
def leave_household():
    household_ref, household_doc = _get_own_household_doc(g.uid)
    if household_ref is None:
        return api_error("You're not in a household.", 400, code="not_in_household")

    data = household_doc.to_dict()
    remaining = [member for member in data.get("memberUids", []) if member != g.uid]

    db = get_db()
    db.collection(Config.COLLECTION_USERS).document(g.uid).set({"householdId": None}, merge=True)

    if not remaining:
        # The last member leaving deletes the household - an empty group
        # with a live invite code would just be a dangling door to nowhere.
        household_ref.delete()
        return api_success({"inHousehold": False}, message="Household disbanded.")

    update = {"memberUids": remaining}
    if data.get("ownerUid") == g.uid:
        # Ownership passes to whoever is left, arbitrarily but deterministically
        update["ownerUid"] = remaining[0]
    household_ref.update(update)

    return api_success({"inHousehold": False}, message="Left the household.")


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
