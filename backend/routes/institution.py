# EcoTrack/backend/routes/institution.py
"""
Institution mode: a tier above a classroom, for a campus green cell or
eco-club lead running several classroom groups (routes/household.py's
own groupType="classroom") as one aggregate view - an inter-class league
table, never a single student's row.

WHY AGGREGATE-ONLY IS THE WHOLE POINT, NOT AN ADD-ON
------------------------------------------------------
routes/community.py's public impact page and routes/insights.py's cohort
comparison both already draw a hard line: an aggregate is safe to show
someone outside the group it describes, an individual record is not. An
institution coordinator sits in exactly that "outside the group" position
relative to every classroom under them - they run the eco-club, they are
not that classroom's own teacher/organizer, and a student in one of those
classrooms never agreed to have their own name or footprint shown to
someone several steps removed from them. So this file NEVER imports
routes/household.py's _serialize_household (which returns a real,
per-member array) - only _member_stats, called per classroom member
purely to fold into one classroom-level total, immediately discarded
after. What a coordinator can see, at most: how many classrooms, how many
members in each, each classroom's combined monthly emission, and each
classroom's average reward points (the same effort-not-emissions ranking
routes/household.py's own leaderboard already uses, for the exact same
boomerang-effect reasoning - see that file's own module docstring).

WHY A COORDINATOR IS NOT A NEW FIREBASE-LEVEL ROLE
routes/admin.py's researcher role needed real backend-enforced RBAC
(researchers/{uid} + require_researcher) because it grants access to
OTHER people's already-collected data on request. An institution
coordinator does not: they only ever see classrooms that explicitly
linked themselves in (via PUT /api/household/institution, owner-only,
see that route's own docstring), the same opt-in shape a household's own
invite code already is. So "coordinator" here is just: a normal
authenticated user who owns an institutions/{id} document, mirrored via
users/{uid}.institutionId the same way COLLECTION_HOUSEHOLDS is mirrored
via users/{uid}.householdId - no new role table, no new decorator.

Mounted at /api/institution
"""

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, require_auth
from routes.household import _generate_invite_code, _member_stats

institution_bp = Blueprint("institution", __name__, url_prefix="/api/institution")

MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 60

# Aggregation cost here is one _member_stats read per member of every
# linked classroom, same shape as routes/household.py's own per-member
# cost - capped for the same "cheap to aggregate, not built to scale
# without limit" reasoning MAX_HOUSEHOLD_MEMBERS's own comment gives, sized
# for a real campus (dozens of sections) rather than a single class.
MAX_LINKED_CLASSROOMS = 50


def _get_own_institution_doc(uid):
    """The current user's own institution document (they are its
    coordinator), or (None, None) - mirrors household.py's own
    _get_own_household_doc, including the same self-healing on a stale
    pointer."""
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    institution_id = (user_doc.to_dict() or {}).get("institutionId") if user_doc.exists else None
    if not institution_id:
        return None, None
    institution_ref = db.collection(Config.COLLECTION_INSTITUTIONS).document(institution_id)
    institution_doc = institution_ref.get()
    if not institution_doc.exists:
        db.collection(Config.COLLECTION_USERS).document(uid).update({"institutionId": None})
        return None, None
    return institution_ref, institution_doc


def _classroom_summary(household_doc):
    """
    One linked classroom, reduced to an aggregate - see this file's own
    module docstring for why this never returns a per-member array. Reuses
    household.py's own _member_stats per member (the exact figures its own
    leaderboard already computes), then folds every member into one row.
    """
    data = household_doc.to_dict()
    member_uids = data.get("memberUids", [])
    if not member_uids:
        return {
            "id": household_doc.id,
            "name": data.get("name", ""),
            "memberCount": 0,
            "combinedEmissionThisMonthKg": 0.0,
            "avgRewardPoints": 0.0,
        }

    members = [_member_stats(uid) for uid in member_uids]
    total_points = sum(member["rewardPoints"] for member in members)

    return {
        "id": household_doc.id,
        "name": data.get("name", ""),
        "memberCount": len(members),
        "combinedEmissionThisMonthKg": round(
            sum(member["emissionThisMonthKg"] for member in members), 2
        ),
        # Average, not total - a bigger class should not automatically
        # outrank a smaller one just for having more people in it, the
        # same per-person fairness routes/community.py's own leaderboard
        # reasoning (COLLECTION_COHORT_STATS) already applies elsewhere.
        "avgRewardPoints": round(total_points / len(members), 1),
    }


def _rank_classrooms(summaries):
    """
    Pure: sort a list of classroom summaries by avgRewardPoints (effort,
    not raw emissions - see this file's module docstring) and stamp each
    with its 1-indexed rank. Split out from _classroom_summary so it can
    be unit-tested with no Firestore involved, the same pure/Firestore
    split routes/engagement.py and routes/household.py's own module
    docstrings already draw elsewhere.
    """
    ranked = sorted(summaries, key=lambda item: item["avgRewardPoints"], reverse=True)
    for index, item in enumerate(ranked, start=1):
        item["rank"] = index
    return ranked


def _serialize_institution(institution_doc):
    db = get_db()
    classroom_docs = list(
        db.collection(Config.COLLECTION_HOUSEHOLDS)
        .where(filter=gcloud_firestore.FieldFilter("institutionId", "==", institution_doc.id))
        .stream()
    )
    summaries = [_classroom_summary(doc) for doc in classroom_docs]
    ranked = _rank_classrooms(summaries)

    data = institution_doc.to_dict()
    return {
        "hasInstitution": True,
        "id": institution_doc.id,
        "name": data.get("name", ""),
        "inviteCode": data.get("inviteCode", ""),
        "classroomCount": len(ranked),
        "maxClassrooms": MAX_LINKED_CLASSROOMS,
        "totalMembers": sum(item["memberCount"] for item in ranked),
        "combinedEmissionThisMonthKg": round(
            sum(item["combinedEmissionThisMonthKg"] for item in ranked), 2
        ),
        "classrooms": ranked,
    }


# ---------------------------------------------------------------------------
# GET /api/institution
# ---------------------------------------------------------------------------

@institution_bp.route("", methods=["GET"])
@require_auth
def get_institution():
    _ref, doc = _get_own_institution_doc(g.uid)
    if doc is None:
        return api_success({"hasInstitution": False})
    return api_success(_serialize_institution(doc))


# ---------------------------------------------------------------------------
# POST /api/institution      (create - the caller becomes its coordinator)
# ---------------------------------------------------------------------------

@institution_bp.route("", methods=["POST"])
@require_auth
def create_institution():
    """Body: {"name": "Christ University - BCA Green Cell"}

    Becoming a coordinator needs no application or admin approval - the
    same "an invite code is the whole access model" trust level a
    household's own creation already runs on. What keeps this safe despite
    that is the aggregate-only boundary described in this file's module
    docstring, not who is allowed to create one: nothing a coordinator can
    see or do here reaches into a classroom that has not explicitly opted
    in with its own invite code.
    """
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()

    if len(name) < MIN_NAME_LENGTH or len(name) > MAX_NAME_LENGTH:
        return api_error(
            f"Name must be between {MIN_NAME_LENGTH} and {MAX_NAME_LENGTH} characters.",
            400,
            code="invalid_name",
        )

    existing_ref, _existing_doc = _get_own_institution_doc(g.uid)
    if existing_ref is not None:
        return api_error(
            "You already run an institution. Delete it before creating another.",
            409,
            code="already_coordinator",
        )

    db = get_db()
    # Reuses household.py's own invite-code generator - same alphabet, same
    # collision-retry, same length; institutions and households are two
    # different collections so a code is only ever unique within its own
    # kind (an institution code and a household code CAN collide with each
    # other), which is fine since PUT /api/household/institution and
    # POST /api/household/join look in two different collections and would
    # never confuse one for the other.
    invite_code = _generate_invite_code(db)

    institution_ref = db.collection(Config.COLLECTION_INSTITUTIONS).document()
    institution_ref.set({
        "name": name,
        "coordinatorUid": g.uid,
        "inviteCode": invite_code,
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })
    db.collection(Config.COLLECTION_USERS).document(g.uid).set(
        {"institutionId": institution_ref.id}, merge=True
    )

    return api_success(
        _serialize_institution(institution_ref.get()), message="Institution created.", status=201
    )


# ---------------------------------------------------------------------------
# DELETE /api/institution/classrooms/<household_id>
# ---------------------------------------------------------------------------

@institution_bp.route("/classrooms/<household_id>", methods=["DELETE"])
@require_auth
def remove_classroom(household_id):
    """
    Unlink one classroom from this institution - the coordinator's side of
    what PUT /api/household/institution's null-inviteCode already lets a
    classroom's own organizer do for themselves. Never deletes the
    classroom itself or anything in it, the same non-destructive shape
    routes/household.py's own remove_member uses for a kicked household
    member.
    """
    institution_ref, _institution_doc = _get_own_institution_doc(g.uid)
    if institution_ref is None:
        return api_error("You don't run an institution.", 400, code="not_coordinator")

    db = get_db()
    household_ref = db.collection(Config.COLLECTION_HOUSEHOLDS).document(household_id)
    household_doc = household_ref.get()

    if not household_doc.exists or household_doc.to_dict().get("institutionId") != institution_ref.id:
        return api_error("That classroom isn't linked to your institution.", 404, code="classroom_not_found")

    household_ref.update({"institutionId": None})
    return api_success(_serialize_institution(institution_ref.get()), message="Classroom unlinked.")


def _disband_institution_for(uid):
    """
    The actual disband logic, factored out so routes/auth.py's account-
    deletion cascade can reuse it - the same split household.py's own
    _leave_household_for already established for exactly this reason (see
    that function's own docstring). Without this, deleting a coordinator's
    account would leave their institution behind forever: coordinatorUid
    pointing at a uid that no longer exists, unreachable by GET
    /api/institution (which looks it up via users/{uid}.institutionId, and
    that user document is gone), with every classroom still linked to it
    - an orphan nothing could ever clean up again.

    Returns True if there was an institution to disband, False otherwise -
    the route below turns that into its own error response; the deletion
    cascade just needs the side effect.
    """
    institution_ref, _institution_doc = _get_own_institution_doc(uid)
    if institution_ref is None:
        return False

    db = get_db()
    linked = (
        db.collection(Config.COLLECTION_HOUSEHOLDS)
        .where(filter=gcloud_firestore.FieldFilter("institutionId", "==", institution_ref.id))
        .stream()
    )
    for household_doc in linked:
        household_doc.reference.update({"institutionId": None})

    db.collection(Config.COLLECTION_USERS).document(uid).set({"institutionId": None}, merge=True)
    institution_ref.delete()
    return True


# ---------------------------------------------------------------------------
# DELETE /api/institution      (coordinator disbands it)
# ---------------------------------------------------------------------------

@institution_bp.route("", methods=["DELETE"])
@require_auth
def delete_institution():
    """
    Disbands the institution and unlinks every classroom under it - each
    classroom keeps existing exactly as it was, just no longer part of an
    institution's aggregate view, the same "the group is gone, its
    members are not" rule household.py's own leave-empties-it path
    follows for a household.
    """
    if not _disband_institution_for(g.uid):
        return api_error("You don't run an institution.", 400, code="not_coordinator")

    return api_success({"hasInstitution": False}, message="Institution disbanded.")
