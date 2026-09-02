# EcoTrack/backend/routes/factors.py
"""
Emission factor routes.

An "emission factor" is the scientific constant that converts an activity into
carbon dioxide. Driving 1 km in a petrol car emits 0.141 kg of CO2, so 0.141 is
the emission factor and the maths is simply:

    emission (kgCO2) = quantity x factorValue

WHY THESE LIVE IN FIRESTORE INSTEAD OF BEING HARDCODED IN PYTHON
----------------------------------------------------------------
(Expect this question in the viva - it is a deliberate design decision.)

  1. An admin can update a factor from the admin dashboard when a new DEFRA or
     IPCC report is published. Hardcoded values would need a code change, a
     GitHub push, and a full redeploy of the Render backend just to edit a number.
  2. The same subType can have different values in different regions - India's
     grid electricity is far more carbon-intensive than Norway's. A 'region'
     field on each document supports that without duplicating any code.
  3. It keeps scientific data (which changes yearly) separate from application
     logic (which should not change yearly). That is good separation of concerns.

This route is PUBLIC - one of only three in the API without token verification.
Emission factors are published constants from DEFRA, IPCC and CEA, not personal
data, and the landing page shows them before anyone has logged in.

PROVENANCE: WHY EVERY FACTOR HAS A version
--------------------------------------------
Editing factorValue here used to be silent from a saved record's point of
view: routes/carbon.py computed emissionKgco2 at save time and stored only
that number, never which factor document or which value produced it. That
meant an admin correcting transport/petrol_car from 0.141 to a newer DEFRA
figure would make every past record silently stop equalling
quantity x (today's factor) - with nothing anywhere able to say so, because
the number that could prove it (the factor value AT THE TIME) was never
kept.

version is an integer, starting at 1, incremented by update_factor every
time factorValue actually changes (not on a unit/source/region-only edit -
see update_factor below). save_calculated_record in routes/carbon.py now
stores the (factorId, factorVersion, factorValue, factorSource) it used
alongside emissionKgco2, so:
  - a record can always show "computed with DEFRA 2023, factor v1" even
    after the factor is later corrected to v2
  - GET /api/factors/<id>/impact tells an admin, before they save an edit,
    exactly how many saved records were computed with the OLD value
  - POST /api/factors/<id>/recalculate lets them explicitly bring those
    records up to date with the new value - never automatic, because
    silently rewriting a user's own logged history is exactly the kind of
    surprise this app avoids everywhere else (see routes/goals.py and
    routes/household.py's own module docstrings on computing-fresh-not-
    caching for the same reasoning applied elsewhere).

Mounted at /api/factors
"""

from flask import Blueprint, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, require_admin

factors_bp = Blueprint("factors", __name__, url_prefix="/api/factors")


def _serialize_factor(doc):
    """Turn one Firestore emissionFactors document into a plain dictionary."""
    data = doc.to_dict()
    return {
        "id": doc.id,
        "category": data.get("category", ""),
        "subType": data.get("subType", ""),
        # float() guards against a factor accidentally saved as a string in the console
        "factorValue": float(data.get("factorValue", 0)),
        # Bumped every time factorValue changes (see update_factor below) - a
        # saved carbonRecords row stores the version it was computed with, so
        # comparing the two tells a user or admin whether that record still
        # matches today's published number. Missing on a factor nobody has
        # ever edited since PROVENANCE shipped, hence the default of 1.
        "version": int(data.get("version", 1)),
        "unit": data.get("unit", ""),
        "region": data.get("region", ""),
        "source": data.get("source", ""),
    }


# ---------------------------------------------------------------------------
# GET /api/factors        (PUBLIC - no token required)
# ---------------------------------------------------------------------------

@factors_bp.route("", methods=["GET"])
def list_factors():
    """
    Return every emission factor, grouped by category.

    Optional query parameters:
        ?category=transport   only that one category
        ?region=India         only factors defined for that region

    Response shape:
        {
          "success": true,
          "data": {
            "categories": ["transport", "electricity", ...],
            "factors": {
              "transport": [
                {"id": "...", "category": "transport", "subType": "petrol_car",
                 "factorValue": 0.141, "unit": "km", "region": "India",
                 "source": "DEFRA 2023"}
              ]
            },
            "count": 17
          }
        }
    """
    category_filter = (request.args.get("category") or "").strip().lower()
    region_filter = (request.args.get("region") or "").strip()

    # Reject an unknown category early with a helpful message rather than
    # silently returning an empty list, which looks like a bug to the frontend
    if category_filter and category_filter not in Config.CATEGORIES:
        return api_error(
            f"Unknown category '{category_filter}'. "
            f"Valid categories are: {', '.join(Config.CATEGORIES)}.",
            400,
            code="invalid_category",
        )

    db = get_db()
    query = db.collection(Config.COLLECTION_EMISSION_FACTORS)

    # Firestore handles several equality filters without needing a composite
    # index, so filtering here is cheap. Sorting is done in Python below,
    # because combining where() with order_by() WOULD require a custom index.
    if category_filter:
        query = query.where(
            filter=gcloud_firestore.FieldFilter("category", "==", category_filter)
        )
    if region_filter:
        query = query.where(
            filter=gcloud_firestore.FieldFilter("region", "==", region_filter)
        )

    try:
        documents = list(query.stream())
    except Exception:
        return api_error(
            "Could not load emission factors. Please try again.",
            500,
            code="factors_fetch_failed",
        )

    # Build an empty bucket for each category first, so the frontend can always
    # do factors["water"].map(...) without checking whether the key exists
    grouped = {category: [] for category in Config.CATEGORIES}

    for doc in documents:
        factor = _serialize_factor(doc)
        category = factor["category"]
        if category in grouped:
            grouped[category].append(factor)
        else:
            # A category saved in Firestore that the app does not know about.
            # Keep it rather than dropping it, so bad data is visible not hidden.
            grouped.setdefault(category, []).append(factor)

    # Sort each category alphabetically by subType for a stable dropdown order
    for category in grouped:
        grouped[category].sort(key=lambda item: item["subType"])

    # When filtering by category, return only that key
    if category_filter:
        grouped = {category_filter: grouped.get(category_filter, [])}
        ordered_categories = [category_filter]
    else:
        # Keep the fixed order from config so the Calculator tabs never reshuffle
        ordered_categories = [c for c in Config.CATEGORIES if c in grouped]
        ordered_categories += [c for c in grouped if c not in ordered_categories]

    total = sum(len(items) for items in grouped.values())

    if total == 0:
        # Almost always means the emissionFactors collection has not been seeded yet
        return api_success(
            {"categories": ordered_categories, "factors": grouped, "count": 0},
            message="No emission factors found. Has the emissionFactors collection been seeded?",
        )

    return api_success({
        "categories": ordered_categories,
        "factors": grouped,
        "count": total,
    })


# ---------------------------------------------------------------------------
# GET /api/factors/<category>/<sub_type>        (PUBLIC)
# ---------------------------------------------------------------------------

@factors_bp.route("/<category>/<sub_type>", methods=["GET"])
def get_single_factor(category, sub_type):
    """
    Look up one specific factor, for example /api/factors/transport/petrol_car.

    The Calculator page uses this for its live "as you type" emission preview so
    it does not have to download every factor just to price a single entry.
    """
    category = category.strip().lower()
    sub_type = sub_type.strip().lower()

    if category not in Config.CATEGORIES:
        return api_error(
            f"Unknown category '{category}'. "
            f"Valid categories are: {', '.join(Config.CATEGORIES)}.",
            400,
            code="invalid_category",
        )

    db = get_db()
    try:
        matches = list(
            db.collection(Config.COLLECTION_EMISSION_FACTORS)
            .where(filter=gcloud_firestore.FieldFilter("category", "==", category))
            .where(filter=gcloud_firestore.FieldFilter("subType", "==", sub_type))
            .limit(1)  # we only ever need the first match
            .stream()
        )
    except Exception:
        return api_error(
            "Could not load the emission factor. Please try again.",
            500,
            code="factors_fetch_failed",
        )

    if not matches:
        return api_error(
            f"No emission factor found for {category}/{sub_type}.",
            404,
            code="factor_not_found",
        )

    return api_success(_serialize_factor(matches[0]))


# ---------------------------------------------------------------------------
# ADMIN-ONLY: create, edit, delete a factor
#
# This is the actual delivery of the promise this file's own module
# docstring makes ("An admin can update a factor from the admin dashboard
# when a new DEFRA or IPCC report is published") - that sentence described
# the reason factors live in Firestore rather than in code, but for a long
# time nothing actually let an admin do it through the app; only the
# Firestore console could. These three routes are that missing piece.
# ---------------------------------------------------------------------------

def _validate_factor_body(body, require_all=True):
    """
    Shared field validation for create and edit. require_all=False (edit)
    only checks whatever fields were actually sent - the same "only touch
    what was sent" rule routes/auth.py's update_profile already follows.
    Returns (clean_fields, error_response).
    """
    clean = {}

    if "category" in body or require_all:
        category = str(body.get("category", "")).strip().lower()
        if category not in Config.CATEGORIES:
            return None, api_error(
                f"Invalid category. Choose one of: {', '.join(Config.CATEGORIES)}.",
                400,
                code="invalid_category",
            )
        clean["category"] = category

    if "subType" in body or require_all:
        sub_type = str(body.get("subType", "")).strip().lower()
        if not sub_type:
            return None, api_error("subType is required.", 400, code="missing_sub_type")
        clean["subType"] = sub_type

    if "factorValue" in body or require_all:
        try:
            factor_value = float(body.get("factorValue"))
        except (TypeError, ValueError):
            return None, api_error("factorValue must be a number.", 400, code="invalid_factor_value")
        if factor_value <= 0:
            return None, api_error("factorValue must be greater than zero.", 400, code="invalid_factor_value")
        clean["factorValue"] = factor_value

    if "unit" in body or require_all:
        unit = str(body.get("unit", "")).strip()
        if not unit:
            return None, api_error("unit is required.", 400, code="missing_unit")
        clean["unit"] = unit

    # Optional either way - a factor with no region is treated as the
    # default/fallback for its category+subType (see _find_emission_factor
    # in routes/carbon.py), and "source" is a citation, not required data.
    if "region" in body:
        clean["region"] = str(body.get("region", "")).strip()
    if "source" in body:
        clean["source"] = str(body.get("source", "")).strip()

    return clean, None


@factors_bp.route("", methods=["POST"])
@require_admin
def create_factor():
    """Body: {"category": "transport", "subType": "e_scooter", "factorValue": 0.02,
              "unit": "km", "region": "India", "source": "DEFRA 2026"}"""
    body = request.get_json(silent=True) or {}
    clean, error = _validate_factor_body(body, require_all=True)
    if error:
        return error

    db = get_db()

    # A second factor for the exact same category+subType+region is almost
    # always a mistake (an admin re-adding one that already exists rather
    # than editing it) - _find_emission_factor in routes/carbon.py would
    # then have two candidates and silently pick whichever Firestore
    # returns first, which is a much harder bug to notice than this
    # upfront rejection.
    region = clean.get("region", "")
    existing = list(
        db.collection(Config.COLLECTION_EMISSION_FACTORS)
        .where(filter=gcloud_firestore.FieldFilter("category", "==", clean["category"]))
        .where(filter=gcloud_firestore.FieldFilter("subType", "==", clean["subType"]))
        .stream()
    )
    for doc in existing:
        if str(doc.to_dict().get("region", "")) == region:
            return api_error(
                f"A factor for {clean['category']}/{clean['subType']}"
                f"{f' in {region}' if region else ''} already exists. Edit it instead.",
                409,
                code="factor_exists",
            )

    ref = db.collection(Config.COLLECTION_EMISSION_FACTORS).document()
    ref.set(clean)

    return api_success({"factor": _serialize_factor(ref.get())}, status=201)


@factors_bp.route("/<factor_id>", methods=["PUT"])
@require_admin
def update_factor(factor_id):
    """Body: any of {"factorValue", "unit", "region", "source", "category", "subType"} -
    exactly the fields to change. The most common edit is just factorValue,
    the number that actually changes when a new DEFRA/IPCC report lands.

    Changing factorValue bumps this factor's version (see PROVENANCE in this
    file's module docstring) - a unit/source/region-only edit does not, since
    those never change what a past record's stored emissionKgco2 means.
    Call GET .../impact first to see how many saved records this will make
    stale, and POST .../recalculate afterward if they should be brought up
    to date.
    """
    body = request.get_json(silent=True) or {}
    clean, error = _validate_factor_body(body, require_all=False)
    if error:
        return error
    if not clean:
        return api_error("Send at least one field to update.", 400, code="empty_update")

    db = get_db()
    ref = db.collection(Config.COLLECTION_EMISSION_FACTORS).document(factor_id)
    current = ref.get()
    if not current.exists:
        return api_error("Factor not found.", 404, code="factor_not_found")

    current_data = current.to_dict()
    if "factorValue" in clean and clean["factorValue"] != float(current_data.get("factorValue", 0)):
        clean["version"] = int(current_data.get("version", 1)) + 1

    ref.update(clean)
    return api_success({"factor": _serialize_factor(ref.get())}, message="Factor updated.")


@factors_bp.route("/<factor_id>/impact", methods=["GET"])
@require_admin
def factor_impact(factor_id):
    """
    How many saved carbonRecords were computed with an older version of this
    factor than it currently holds - the number an admin should see BEFORE
    confirming an edit that changes factorValue, not after.

    staleCount is scoped to factorId so it only ever counts records that
    actually used THIS factor document, never a different one that happens
    to share the same category/subType (region-specific factors mean more
    than one factor document can exist per category+subType).
    """
    db = get_db()
    ref = db.collection(Config.COLLECTION_EMISSION_FACTORS).document(factor_id)
    doc = ref.get()
    if not doc.exists:
        return api_error("Factor not found.", 404, code="factor_not_found")

    current_version = int(doc.to_dict().get("version", 1))

    total_count = 0
    stale_count = 0
    for record_doc in (
        db.collection(Config.COLLECTION_CARBON_RECORDS)
        .where(filter=gcloud_firestore.FieldFilter("factorId", "==", factor_id))
        .stream()
    ):
        total_count += 1
        if int(record_doc.to_dict().get("factorVersion", 1)) != current_version:
            stale_count += 1

    return api_success({
        "factorId": factor_id,
        "currentVersion": current_version,
        "recordsUsingThisFactor": total_count,
        "staleCount": stale_count,
    })


@factors_bp.route("/<factor_id>/recalculate", methods=["POST"])
@require_admin
def recalculate_factor(factor_id):
    """
    Bring every saved record that used an older version of this factor up
    to today's factorValue - explicit and admin-triggered only, never run
    automatically from update_factor. Recomputes emissionKgco2 = quantity x
    (current factorValue), the exact same formula save_calculated_record
    uses, and stamps the record with the current factorVersion so a second
    call is a safe no-op (nothing left stale to recalculate).
    """
    db = get_db()
    ref = db.collection(Config.COLLECTION_EMISSION_FACTORS).document(factor_id)
    doc = ref.get()
    if not doc.exists:
        return api_error("Factor not found.", 404, code="factor_not_found")

    factor_data = doc.to_dict()
    current_version = int(factor_data.get("version", 1))
    current_value = float(factor_data.get("factorValue", 0))

    stale_docs = list(
        db.collection(Config.COLLECTION_CARBON_RECORDS)
        .where(filter=gcloud_firestore.FieldFilter("factorId", "==", factor_id))
        .stream()
    )

    updated = 0
    batch = db.batch()
    batch_size = 0
    for record_doc in stale_docs:
        record = record_doc.to_dict()
        if int(record.get("factorVersion", 1)) == current_version:
            continue
        quantity = float(record.get("quantity", 0))
        batch.update(record_doc.reference, {
            "emissionKgco2": round(quantity * current_value, 3),
            "factorValue": current_value,
            "factorVersion": current_version,
        })
        updated += 1
        batch_size += 1
        # Firestore rejects a batch larger than 500 writes - same limit
        # routes/admin.py's own BATCH_LIMIT works around.
        if batch_size >= 400:
            batch.commit()
            batch = db.batch()
            batch_size = 0

    if batch_size:
        batch.commit()

    return api_success(
        {"factorId": factor_id, "recalculatedCount": updated},
        message=f"Recalculated {updated} record{'s' if updated != 1 else ''}.",
    )


@factors_bp.route("/<factor_id>", methods=["DELETE"])
@require_admin
def delete_factor(factor_id):
    """
    Deletes a factor outright. Existing carbonRecords are unaffected in what
    they display - each one already stored its own computed emissionKgco2 at
    the time it was logged (see save_calculated_record in routes/carbon.py) -
    but a record's stored factorId now becomes a reference to a document
    that no longer exists, which is fine: it is kept only as historical
    provenance ("this is what computed it"), never re-fetched live, so a
    deleted factor cannot break a past record's display. Logging a NEW entry
    for this category+subType will fail with factor_not_found until a
    replacement is added, which is the correct, honest failure mode rather
    than silently falling back to a stale or wrong number.
    """
    db = get_db()
    ref = db.collection(Config.COLLECTION_EMISSION_FACTORS).document(factor_id)
    if not ref.get().exists:
        return api_error("Factor not found.", 404, code="factor_not_found")

    ref.delete()
    return api_success({"id": factor_id}, message="Factor deleted.")
