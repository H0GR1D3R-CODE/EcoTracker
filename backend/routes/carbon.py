# EcoTrack/backend/routes/carbon.py
"""
Carbon calculation and record routes.

THE CORE ALGORITHM OF THE WHOLE PROJECT
---------------------------------------
    emission (kgCO2) = quantity x emissionFactor

Example: driving 30 km in a petrol car
    30 km  x  0.141 kgCO2/km  =  4.23 kgCO2

The emission factor is never hardcoded here. It is read from the
emissionFactors collection in Firestore every time, so an admin can update a
factor when a new DEFRA or IPCC report is published without any code change.

DATA QUALITY: FLAGGING AN UNUSUAL ENTRY, NEVER BLOCKING ONE
-------------------------------------------------------------
"3,000 km of driving, logged as one day's petrol_car entry" is almost always
a typo (a missing decimal point, a stray zero), not a real commute - and a
single entry like that quietly drags the /insights forecast's prediction
interval and the dashboard's own average out of shape until someone notices
by eye. _anomaly_check compares a new quantity against THIS user's own
recent history for that exact category+subType using a modified z-score
(median and median absolute deviation, not mean/stddev - MAD stays stable
even though the very outlier being tested is itself in the sample, which a
mean-based test would not: Iglewicz & Hoaglin, NIST/SEMATECH e-Handbook of
Statistical Methods, 2012).

This never rejects a save - see save_calculated_record's own "never a
different number for what was already drawn" reasoning in grid_engine.py,
applied here to REJECTING rather than reframing: a real 3,000 km trip is
rare but not impossible, and refusing to log it would be a worse failure
than logging it with a flag. Two things use the flag instead:
  1. POST /api/carbon/check - a dry run the Calculator page calls BEFORE
     submitting, so a typo can be caught and fixed before it is ever saved.
  2. Every save (including a CSV import row) stores flaggedAnomaly on the
     record regardless of whether the frontend checked first, so GET
     /api/carbon/quality-score and an admin's data-quality view both have a
     real, complete signal to work from - never just an unenforced client
     convention.

Mounted at /api/carbon
"""

import csv
import io
import statistics
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
    parse_date_string,
    parse_month_string,
    require_auth,
    serialize_record,
    today_string,
    total_emission,
)

carbon_bp = Blueprint("carbon", __name__, url_prefix="/api/carbon")

# A single entry larger than this is almost certainly a typo (someone typing
# their phone number into the quantity box), so we reject it with a clear message.
MAX_QUANTITY = 1_000_000

# Nothing in this app should be dated before the year 2000
EARLIEST_DATE = "2000-01-01"

# Severity thresholds in kgCO2, used for the colour-coded badge on the
# Calculator result card: green / amber / red
SEVERITY_LOW_MAX = 5.0
SEVERITY_MEDIUM_MAX = 20.0

# How many days of history the "compared to your daily average" ring looks at
DAILY_AVERAGE_WINDOW_DAYS = 30

# --- Data quality / anomaly detection - see this file's own module
# docstring for the full reasoning. ---

# How far back _anomaly_check looks to build "this user's usual range" for
# one category+subType. Half a year, not the user's whole history: recent
# behaviour (a new commute, a house move) should be what "usual" means, not
# something from a year ago diluting a real, lasting change.
ANOMALY_HISTORY_WINDOW_DAYS = 180

# Need at least this many past entries for the SAME category+subType before
# a modified z-score means anything - three data points cannot tell a real
# pattern from a coincidence, so with fewer than this, nothing is flagged.
ANOMALY_MIN_HISTORY = 5

# The standard Iglewicz & Hoaglin cutoff for "unusual enough to look twice
# at" (|modified z-score| > 3.5) - loose enough that ordinary day-to-day
# variation never trips it, tight enough to catch a stray extra digit.
ANOMALY_ZSCORE_THRESHOLD = 3.5


def _median_absolute_deviation(values, median):
    """MAD: the median of each value's absolute distance from the median -
    a spread measure that, unlike standard deviation, is not itself dragged
    around by the one outlier being tested."""
    return statistics.median(abs(v - median) for v in values)


def _anomaly_check(uid, category, sub_type, quantity):
    """
    Compare `quantity` against this user's own recent history for this
    exact category+subType. Returns a dict, never raises, never blocks a
    save - see this file's module docstring.

    {"flagged": bool, "reason": str | None, "sampleSize": int,
     "medianQuantity": float | None}
    """
    window_start = (date.today() - timedelta(days=ANOMALY_HISTORY_WINDOW_DAYS)).isoformat()
    records = fetch_user_records(uid, start_date=window_start, end_date=today_string())
    quantities = [
        float(r["quantity"]) for r in records
        if r["category"] == category and r["subType"] == sub_type
    ]

    if len(quantities) < ANOMALY_MIN_HISTORY:
        return {"flagged": False, "reason": None, "sampleSize": len(quantities), "medianQuantity": None}

    median = statistics.median(quantities)
    mad = _median_absolute_deviation(quantities, median)

    # A MAD of exactly zero means every past entry was identical - the
    # honest reading is "any different value at all deserves a second
    # look", not "undefined, so never flag". A small fraction of the
    # median (or a flat floor when the median is itself 0, e.g. the
    # bicycle/solar factors) keeps that literal without dividing by zero.
    if mad == 0:
        mad = median * 0.05 if median > 0 else 1.0

    # 0.6745 rescales MAD to be comparable to a standard deviation for a
    # normal distribution - the standard modified z-score constant.
    modified_z = 0.6745 * (quantity - median) / mad

    if abs(modified_z) <= ANOMALY_ZSCORE_THRESHOLD:
        return {"flagged": False, "reason": None, "sampleSize": len(quantities), "medianQuantity": round(median, 3)}

    direction = "above" if modified_z > 0 else "below"
    multiple = round(quantity / median, 1) if median > 0 else None
    reason = (
        f"{multiple}x your usual amount for this activity ({round(median, 2)} typical)"
        if multiple else
        f"Unusually far {direction} your usual amount for this activity ({round(median, 2)} typical)"
    )

    return {
        "flagged": True,
        "reason": reason,
        "sampleSize": len(quantities),
        "medianQuantity": round(median, 3),
    }


# ---------------------------------------------------------------------------
# Helpers used only inside this file
# ---------------------------------------------------------------------------

def _find_emission_factor(category, sub_type, preferred_region=""):
    """
    Look up one emission factor in Firestore.

    Returns (factor_dict, None) on success or (None, error_message) if missing.

    When several documents exist for the same category and subType - which is
    exactly what happens once region-specific factors are added - the one
    matching the user's own region wins. Otherwise the first match is used.
    """
    db = get_db()
    matches = list(
        db.collection(Config.COLLECTION_EMISSION_FACTORS)
        .where(filter=gcloud_firestore.FieldFilter("category", "==", category))
        .where(filter=gcloud_firestore.FieldFilter("subType", "==", sub_type))
        .stream()
    )

    if not matches:
        return None, (
            f"No emission factor is configured for {category}/{sub_type}. "
            "Please pick a different option."
        )

    chosen_doc = matches[0]

    # Prefer a factor defined for this user's region, if one exists
    if preferred_region:
        for doc in matches:
            data = doc.to_dict()
            if str(data.get("region", "")).lower() == preferred_region.lower():
                chosen_doc = doc
                break

    chosen = chosen_doc.to_dict()

    return {
        # The document id and version are what make a saved record
        # reproducible later - see PROVENANCE in this file's module
        # docstring. Without them a record is just a number nobody can
        # re-derive once an admin edits the factor it came from.
        "id": chosen_doc.id,
        "version": int(chosen.get("version", 1)),
        "factorValue": float(chosen.get("factorValue", 0)),
        "unit": chosen.get("unit", ""),
        "region": chosen.get("region", ""),
        "source": chosen.get("source", ""),
    }, None


def _severity_for(emission):
    """Colour band for the result badge on the Calculator page."""
    if emission < SEVERITY_LOW_MAX:
        return "low"
    if emission <= SEVERITY_MEDIUM_MAX:
        return "medium"
    return "high"


def _user_region(uid):
    """Read the user's region so region-specific factors can be applied."""
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    if not user_doc.exists:
        return ""
    return user_doc.to_dict().get("region", "")


def _daily_average(uid):
    """
    The user's average emissions per day over the last 30 days.

    Dividing by a fixed 30 rather than by "days that had entries" is deliberate:
    a day with no entries is still a real day, and counting it keeps the number
    honest instead of flattering the user for forgetting to log.
    """
    window_start = (date.today() - timedelta(days=DAILY_AVERAGE_WINDOW_DAYS)).isoformat()
    records = fetch_user_records(uid, start_date=window_start, end_date=today_string())
    if not records:
        return 0.0
    return round(total_emission(records) / DAILY_AVERAGE_WINDOW_DAYS, 2)


# ---------------------------------------------------------------------------
# POST /api/carbon/calculate
# ---------------------------------------------------------------------------

def save_calculated_record(uid, category, sub_type, quantity_raw, unit, recorded_date_raw):
    """
    Validate, calculate, and save one emission record - THE shared path.

    Extracted out of the /calculate route below so a second caller (the
    quick-log templates route, routes/templates.py:log_from_template) can
    save a record through the exact same validation and the exact same
    formula, rather than a second copy of this logic drifting out of sync
    with it. Returns (result_dict, None) on success or (None, error_response)
    on failure - the same tuple shape _find_emission_factor already uses in
    this file, so callers here and in templates.py handle it identically.
    """
    category = str(category or "").strip().lower()
    sub_type = str(sub_type or "").strip().lower()
    unit = str(unit or "").strip()
    recorded_date_raw = recorded_date_raw or today_string()

    if category not in Config.CATEGORIES:
        return None, api_error(
            f"Invalid category. Choose one of: {', '.join(Config.CATEGORIES)}.",
            400,
            code="invalid_category",
        )

    if not sub_type:
        return None, api_error("subType is required.", 400, code="missing_sub_type")

    try:
        quantity = float(quantity_raw)
    except (TypeError, ValueError):
        return None, api_error("Quantity must be a number.", 400, code="invalid_quantity")

    if quantity <= 0:
        return None, api_error("Quantity must be greater than zero.", 400, code="invalid_quantity")

    if quantity > MAX_QUANTITY:
        return None, api_error(
            f"Quantity looks too large. Please enter a value under {MAX_QUANTITY:,}.",
            400,
            code="quantity_too_large",
        )

    recorded_date, date_error = parse_date_string(recorded_date_raw, "recordedDate")
    if date_error:
        return None, api_error(date_error, 400, code="invalid_date")

    if recorded_date > date.today():
        return None, api_error("You cannot log emissions for a future date.", 400, code="future_date")

    if recorded_date.isoformat() < EARLIEST_DATE:
        return None, api_error(f"Date must be on or after {EARLIEST_DATE}.", 400, code="date_too_early")

    factor, factor_error = _find_emission_factor(category, sub_type, _user_region(uid))
    if factor_error:
        return None, api_error(factor_error, 404, code="factor_not_found")

    if unit and factor["unit"] and unit.lower() != factor["unit"].lower():
        return None, api_error(
            f"Unit mismatch: {category}/{sub_type} is measured in "
            f"'{factor['unit']}', not '{unit}'.",
            400,
            code="unit_mismatch",
        )

    # THE CALCULATION
    emission = round(quantity * factor["factorValue"], 3)

    # Computed and stored on every save regardless of whether the frontend
    # already ran POST /api/carbon/check first (a CSV import row never
    # does) - see this file's module docstring.
    anomaly = _anomaly_check(uid, category, sub_type, quantity)

    db = get_db()
    record_ref = db.collection(Config.COLLECTION_CARBON_RECORDS).document()
    record_ref.set({
        "userId": uid,  # taken from the verified token, never from the request body
        "category": category,
        "subType": sub_type,
        "quantity": quantity,
        "unit": factor["unit"] or unit,  # the factor's unit is the authoritative one
        "emissionKgco2": emission,
        "recordedDate": recorded_date.isoformat(),
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
        # Provenance - see routes/factors.py's PROVENANCE note. Stored once,
        # here, never re-fetched live: if an admin later edits this factor,
        # this record keeps saying what actually computed it until (and
        # unless) an admin explicitly runs POST /api/factors/<id>/recalculate.
        "factorId": factor["id"],
        "factorVersion": factor["version"],
        "factorValue": factor["factorValue"],
        "factorSource": factor["source"],
        # Data quality - see _anomaly_check above.
        "flaggedAnomaly": anomaly["flagged"],
        "anomalyReason": anomaly["reason"],
    })

    saved = serialize_record(record_ref.get())

    daily_average = _daily_average(uid)
    percent_of_average = (
        round((emission / daily_average) * 100, 1) if daily_average > 0 else None
    )

    return {
        "record": saved,
        "emissionKgco2": emission,
        "factorUsed": factor["factorValue"],
        "factorSource": factor["source"],
        "severity": _severity_for(emission),
        "dailyAverage": daily_average,
        "percentOfDailyAverage": percent_of_average,
        "anomaly": anomaly,
    }, None


@carbon_bp.route("/calculate", methods=["POST"])
@require_auth
def calculate():
    """
    Calculate an emission, save it, and return it with display context.

    Body: {"category": "transport", "subType": "petrol_car",
           "quantity": 30, "unit": "km", "recordedDate": "2026-07-24"}
    """
    body = request.get_json(silent=True) or {}

    result, error = save_calculated_record(
        g.uid,
        body.get("category"),
        body.get("subType"),
        body.get("quantity"),
        body.get("unit"),
        body.get("recordedDate"),
    )
    if error:
        return error

    return api_success(
        result,
        message=f"Logged {result['emissionKgco2']} kg CO2 for {result['record']['subType'].replace('_', ' ')}.",
        status=201,
    )


# ---------------------------------------------------------------------------
# POST /api/carbon/check     (dry run - no save, no side effects)
# ---------------------------------------------------------------------------

@carbon_bp.route("/check", methods=["POST"])
@require_auth
def check_quantity():
    """
    Run _anomaly_check without saving anything - the Calculator page calls
    this right before submitting, so a typo (an extra zero, a missing
    decimal point) can be caught and fixed before it is ever logged rather
    than after. See this file's module docstring.

    Body: {"category": "transport", "subType": "petrol_car", "quantity": 30}
    """
    body = request.get_json(silent=True) or {}
    category = str(body.get("category", "")).strip().lower()
    sub_type = str(body.get("subType", "")).strip().lower()

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
        return api_error("Quantity must be a number.", 400, code="invalid_quantity")
    if quantity <= 0:
        return api_error("Quantity must be greater than zero.", 400, code="invalid_quantity")

    return api_success(_anomaly_check(g.uid, category, sub_type, quantity))


# ---------------------------------------------------------------------------
# GET /api/carbon/quality-score
# ---------------------------------------------------------------------------

@carbon_bp.route("/quality-score", methods=["GET"])
@require_auth
def quality_score():
    """
    How much of this user's recent logging looks clean vs. flagged as an
    outlier by _anomaly_check at the time it was saved - a rough, honest
    signal of how much to trust their own recent trend, not a judgement of
    the person (a genuinely unusual week is still real data, just data
    worth a second look).

    Missing data (score 100, no penalty) beats a fabricated one: someone
    who has logged nothing yet has not made an error either.
    """
    window_start = (date.today() - timedelta(days=ANOMALY_HISTORY_WINDOW_DAYS)).isoformat()
    records = fetch_user_records(g.uid, start_date=window_start, end_date=today_string())

    total = len(records)
    flagged = [r for r in records if r.get("flaggedAnomaly")]

    score = round(100 * (1 - len(flagged) / total), 1) if total else 100.0

    return api_success({
        "score": score,
        "totalRecords": total,
        "flaggedCount": len(flagged),
        # Most recent first, capped - enough to show without the response
        # growing with the user's whole history.
        "recentFlags": [
            {
                "id": r["id"],
                "category": r["category"],
                "subType": r["subType"],
                "quantity": r["quantity"],
                "recordedDate": r["recordedDate"],
                "reason": r.get("anomalyReason"),
            }
            for r in sorted(flagged, key=lambda r: r["recordedDate"], reverse=True)[:10]
        ],
    })


# ---------------------------------------------------------------------------
# GET /api/carbon/records
# ---------------------------------------------------------------------------

@carbon_bp.route("/records", methods=["GET"])
@require_auth
def list_records():
    """
    List the signed-in user's records.

    Query parameters (both optional, month wins if you send both):
        ?month=2026-07   every record in that month
        ?year=2026       every record in that year
    With neither, the current month is returned.
    """
    month_param = (request.args.get("month") or "").strip()
    year_param = (request.args.get("year") or "").strip()

    if month_param:
        parsed, error = parse_month_string(month_param)
        if error:
            return api_error(error, 400, code="invalid_month")
        year, month = parsed
        start_date, end_date = month_bounds(year, month)
        period = month_param

    elif year_param:
        if not year_param.isdigit() or len(year_param) != 4:
            return api_error("year must be a 4-digit number, e.g. 2026.", 400, code="invalid_year")
        year = int(year_param)
        if year < 2000 or year > date.today().year + 1:
            return api_error(
                f"year must be between 2000 and {date.today().year + 1}.",
                400,
                code="invalid_year",
            )
        start_date, end_date = f"{year}-01-01", f"{year}-12-31"
        period = year_param

    else:
        today = date.today()
        start_date, end_date = month_bounds(today.year, today.month)
        period = f"{today.year}-{today.month:02d}"

    records = fetch_user_records(g.uid, start_date=start_date, end_date=end_date)

    return api_success({
        "records": records,
        "count": len(records),
        "totalEmission": total_emission(records),
        "categoryBreakdown": group_by_category(records),
        "period": period,
        "periodStart": start_date,
        "periodEnd": end_date,
    })


# ---------------------------------------------------------------------------
# GET /api/carbon/records/all      (full history, filterable, paginated)
# ---------------------------------------------------------------------------

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


@carbon_bp.route("/records/all", methods=["GET"])
@require_auth
def list_all_records():
    """
    The Activity Log page's data source: every record this account has ever
    logged, not one month or year at a time like GET /records above (which
    Calculator.jsx's recent-entries list still uses, unchanged).

    Query parameters (all optional):
        ?category=transport         one of Config.CATEGORIES
        ?startDate=2026-01-01       inclusive
        ?endDate=2026-12-31         inclusive
        ?page=1                     1-indexed, defaults to 1
        ?pageSize=25                defaults to 25, capped at 100

    PAGINATED IN PYTHON, NOT IN FIRESTORE, ON PURPOSE
    fetch_user_records already loads every one of this user's records into
    memory before this route ever runs (the same call GET /records and the
    streak/challenge routes already make) - Firestore's own cursor-based
    pagination would need a composite index for "this user, this category,
    ordered by date" that does not exist and is not worth adding for a
    figure that tops out at a few hundred rows for even a multi-year power
    user. Slicing an already-fetched, already-sorted Python list is the
    honest cost here, not a shortcut.
    """
    category = (request.args.get("category") or "").strip().lower()
    if category and category not in Config.CATEGORIES:
        return api_error(
            f"Unknown category '{category}'. Valid categories are: {', '.join(Config.CATEGORIES)}.",
            400,
            code="invalid_category",
        )

    start_date_param = (request.args.get("startDate") or "").strip()
    end_date_param = (request.args.get("endDate") or "").strip()

    if start_date_param:
        _, error = parse_date_string(start_date_param, "startDate")
        if error:
            return api_error(error, 400, code="invalid_start_date")
    if end_date_param:
        _, error = parse_date_string(end_date_param, "endDate")
        if error:
            return api_error(error, 400, code="invalid_end_date")

    page_param = (request.args.get("page") or "1").strip()
    page_size_param = (request.args.get("pageSize") or str(DEFAULT_PAGE_SIZE)).strip()
    if not page_param.isdigit() or int(page_param) < 1:
        return api_error("page must be a positive whole number.", 400, code="invalid_page")
    if not page_size_param.isdigit() or not (1 <= int(page_size_param) <= MAX_PAGE_SIZE):
        return api_error(f"pageSize must be between 1 and {MAX_PAGE_SIZE}.", 400, code="invalid_page_size")

    page = int(page_param)
    page_size = int(page_size_param)

    records = fetch_user_records(
        g.uid,
        start_date=start_date_param or None,
        end_date=end_date_param or None,
    )
    if category:
        records = [record for record in records if record["category"] == category]

    # fetch_user_records already sorts newest-first
    total_count = len(records)
    total_pages = max(1, (total_count + page_size - 1) // page_size)
    start_index = (page - 1) * page_size
    page_records = records[start_index:start_index + page_size]

    return api_success({
        "records": page_records,
        "totalCount": total_count,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
    })


# ---------------------------------------------------------------------------
# PUT /api/carbon/records/<record_id>      (edit a saved record)
# ---------------------------------------------------------------------------

@carbon_bp.route("/records/<record_id>", methods=["PUT"])
@require_auth
def update_record(record_id):
    """
    Edit a previously saved record - the one thing DELETE below could not
    do on its own (delete-and-relog loses the original createdAt and, on
    the Activity Log page, loses your place in a long filtered list).

    Body: any of {"subType", "quantity", "unit", "recordedDate"} - category
    is deliberately NOT editable here. A record's category and subType
    together are what selected the emission factor in the first place;
    changing category without re-running the whole category/subType picker
    UI risks a subType that does not exist under the new category at all.
    Changing subType within the SAME category is safe and supported (the
    factor lookup below re-runs for whatever category+subType the edited
    record now has), so the practical path for "wrong category" is still
    delete-and-relog, same as before this route existed.

    Recalculates emissionKgco2 from scratch via the same factor lookup
    save_calculated_record uses - never trusts a client-sent emission value,
    for the same reason the original save never did.
    """
    db = get_db()
    record_ref = db.collection(Config.COLLECTION_CARBON_RECORDS).document(record_id)
    record_doc = record_ref.get()

    if not record_doc.exists:
        return api_error("Record not found.", 404, code="record_not_found")

    existing = record_doc.to_dict()
    if existing.get("userId") != g.uid:
        return api_error(
            "You do not have permission to edit this record.",
            403,
            code="not_record_owner",
        )

    body = request.get_json(silent=True) or {}
    category = existing.get("category")
    sub_type = str(body.get("subType", existing.get("subType"))).strip().lower()
    unit = str(body.get("unit", "")).strip()

    try:
        quantity = float(body.get("quantity", existing.get("quantity")))
    except (TypeError, ValueError):
        return api_error("Quantity must be a number.", 400, code="invalid_quantity")

    if quantity <= 0:
        return api_error("Quantity must be greater than zero.", 400, code="invalid_quantity")
    if quantity > MAX_QUANTITY:
        return api_error(
            f"Quantity looks too large. Please enter a value under {MAX_QUANTITY:,}.",
            400,
            code="quantity_too_large",
        )

    recorded_date_raw = body.get("recordedDate", existing.get("recordedDate"))
    recorded_date, date_error = parse_date_string(recorded_date_raw, "recordedDate")
    if date_error:
        return api_error(date_error, 400, code="invalid_date")
    if recorded_date > date.today():
        return api_error("You cannot log emissions for a future date.", 400, code="future_date")
    if recorded_date.isoformat() < EARLIEST_DATE:
        return api_error(f"Date must be on or after {EARLIEST_DATE}.", 400, code="date_too_early")

    factor, factor_error = _find_emission_factor(category, sub_type, _user_region(g.uid))
    if factor_error:
        return api_error(factor_error, 404, code="factor_not_found")

    if unit and factor["unit"] and unit.lower() != factor["unit"].lower():
        return api_error(
            f"Unit mismatch: {category}/{sub_type} is measured in "
            f"'{factor['unit']}', not '{unit}'.",
            400,
            code="unit_mismatch",
        )

    emission = round(quantity * factor["factorValue"], 3)
    anomaly = _anomaly_check(g.uid, category, sub_type, quantity)

    record_ref.update({
        "subType": sub_type,
        "quantity": quantity,
        "unit": factor["unit"] or unit or existing.get("unit"),
        "emissionKgco2": emission,
        "recordedDate": recorded_date.isoformat(),
        "flaggedAnomaly": anomaly["flagged"],
        "anomalyReason": anomaly["reason"],
        # Re-run through the same factor lookup as a fresh save, so an edited
        # record's provenance reflects whatever factor actually computed its
        # NEW emissionKgco2 - see routes/factors.py's PROVENANCE note.
        "factorId": factor["id"],
        "factorVersion": factor["version"],
        "factorValue": factor["factorValue"],
        "factorSource": factor["source"],
    })

    return api_success(
        {"record": serialize_record(record_ref.get())},
        message="Record updated successfully.",
    )


# ---------------------------------------------------------------------------
# DELETE /api/carbon/records/<record_id>
# ---------------------------------------------------------------------------

@carbon_bp.route("/records/<record_id>", methods=["DELETE"])
@require_auth
def delete_record(record_id):
    """
    Delete one record.

    The ownership check on the line marked below is the important part: without
    it, any logged-in user could delete any other user's data just by guessing a
    document id. Verifying the token proves WHO you are; this proves the record
    is YOURS.
    """
    db = get_db()
    record_ref = db.collection(Config.COLLECTION_CARBON_RECORDS).document(record_id)
    record_doc = record_ref.get()

    if not record_doc.exists:
        return api_error("Record not found.", 404, code="record_not_found")

    # OWNERSHIP CHECK
    if record_doc.to_dict().get("userId") != g.uid:
        return api_error(
            "You do not have permission to delete this record.",
            403,
            code="not_record_owner",
        )

    record_ref.delete()
    return api_success({"id": record_id}, message="Record deleted successfully.")


# ---------------------------------------------------------------------------
# POST /api/carbon/import      (bulk CSV import)
# ---------------------------------------------------------------------------

MAX_IMPORT_ROWS = 500

# The exact header names Reports.jsx's own CSV export already writes
# (downloadReportCsv in frontend/src/pages/Reports.jsx) - accepting these
# means a report exported from this backend is directly re-importable into
# it, not just a one-way trip. "Emissions (kg CO2)", if present, is read and
# silently ignored: every row is recalculated from the published factor via
# save_calculated_record below, the same as every other way of logging an
# entry (the Calculator, the bill scanner, voice logging) already works -
# an imported file never gets to assert its own emission number.
COLUMN_ALIASES = {
    "date": "recordedDate",
    "recordeddate": "recordedDate",
    "category": "category",
    "sub-type": "subType",
    "subtype": "subType",
    "quantity": "quantity",
    "unit": "unit",
}


def _normalise_row(raw_row):
    """Map a CSV row's (possibly differently-cased/spaced) headers onto the
    fixed field names save_calculated_record expects, dropping anything
    unrecognised (an Emissions column, a stray blank trailing column)."""
    normalised = {}
    for key, value in raw_row.items():
        if key is None:
            continue
        field = COLUMN_ALIASES.get(key.strip().lower())
        if field:
            normalised[field] = (value or "").strip()
    return normalised


@carbon_bp.route("/import", methods=["POST"])
@require_auth
def import_records():
    """
    Bulk-log activities from a CSV, for backfilling history from a
    spreadsheet or a previous tracker - the missing other half of Reports.jsx's
    own CSV export.

    Body: {"csv": "Date,Category,Sub-type,Quantity,Unit\n2026-01-15,transport,petrol_car,12,km\n..."}

    EVERY ROW GOES THROUGH THE SAME VALIDATION AND FORMULA AS A MANUAL ENTRY
    This calls save_calculated_record - the exact function POST /calculate
    above uses - once per row, so an imported entry is indistinguishable
    from one typed into the Calculator by hand: same factor lookup, same
    category/date/quantity limits, same recalculated emission. A row that
    fails validation is skipped and reported, not silently dropped or
    allowed to corrupt the rest of the import - the response lists exactly
    which rows failed and why, so the user can fix and re-upload just those.
    """
    body = request.get_json(silent=True) or {}
    csv_text = body.get("csv")

    if not isinstance(csv_text, str) or not csv_text.strip():
        return api_error("csv is required.", 400, code="missing_csv")

    try:
        reader = csv.DictReader(io.StringIO(csv_text))
        rows = list(reader)
    except csv.Error:
        return api_error("Could not parse that as CSV.", 400, code="invalid_csv")

    if not rows:
        return api_error("That CSV has no data rows.", 400, code="empty_csv")
    if len(rows) > MAX_IMPORT_ROWS:
        return api_error(
            f"A single import is capped at {MAX_IMPORT_ROWS} rows - split larger files into batches.",
            400,
            code="too_many_rows",
        )

    imported = []
    errors = []

    for index, raw_row in enumerate(rows, start=2):  # start=2: row 1 is the header line
        fields = _normalise_row(raw_row)
        result, error = save_calculated_record(
            g.uid,
            fields.get("category"),
            fields.get("subType"),
            fields.get("quantity"),
            fields.get("unit"),
            fields.get("recordedDate"),
        )
        if error:
            # error is the (Response, status) tuple api_error() returns -
            # .get_json() reads the message back out of it for this row's report.
            message = error[0].get_json().get("error", "Invalid row")
            errors.append({"row": index, "message": message})
        else:
            imported.append(result["record"])

    return api_success({
        "importedCount": len(imported),
        "errorCount": len(errors),
        # Capped so one wildly malformed file does not return an enormous
        # response - the count above already tells the user how many failed.
        "errors": errors[:20],
    }, message=f"Imported {len(imported)} of {len(rows)} rows.")
