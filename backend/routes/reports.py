# EcoTrack/backend/routes/reports.py
"""
Report generation routes.

WHAT GETS STORED VS WHAT GETS CALCULATED
----------------------------------------
A report document in Firestore holds only its definition:

    userId, reportType, periodStart, periodEnd, generatedAt

The actual figures are NOT stored. They are recalculated from carbonRecords
every time the report is opened. That is a deliberate decision worth defending:

  * A stored total would go stale the moment the user edits or deletes a record
    inside the report's date range, and the report would then contradict the
    dashboard.
  * Storing only the definition keeps the documents tiny.
  * Recalculating costs one Firestore query, which at this scale is cheap.

The trade-off is that a report is a live view of a period, not a frozen
snapshot. For a personal carbon tracker that is the more useful behaviour.

Mounted at /api/reports
"""

from datetime import date

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import (
    api_error,
    api_success,
    fetch_user_records,
    group_by_category,
    parse_date_string,
    require_auth,
    total_emission,
)

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

# The kinds of report the Reports page can ask for
VALID_REPORT_TYPES = ["monthly", "yearly", "custom"]

# A sanity limit so nobody generates a report across a thousand years
MAX_PERIOD_DAYS = 366 * 5

# How many of the user's worst activities the summary lists
TOP_SUB_TYPES_COUNT = 5


# ---------------------------------------------------------------------------
# Helpers used only inside this file
# ---------------------------------------------------------------------------

def _top_sub_types(records):
    """
    The activities contributing the most CO2, biggest first.

    This is the part of a report that actually changes behaviour - it tells the
    user "your car is 60% of your footprint" instead of just showing a total.
    """
    totals = {}
    for record in records:
        # A key like "transport/petrol_car" keeps categories from colliding
        key = f"{record['category']}/{record['subType']}"
        entry = totals.setdefault(key, {
            "category": record["category"],
            "subType": record["subType"],
            "emission": 0.0,
            "count": 0,
        })
        entry["emission"] += record["emissionKgco2"]
        entry["count"] += 1

    ranked = sorted(totals.values(), key=lambda item: item["emission"], reverse=True)

    for entry in ranked:
        entry["emission"] = round(entry["emission"], 2)

    return ranked[:TOP_SUB_TYPES_COUNT]


def _highest_day(records):
    """The single worst day in the period, or None if there are no records."""
    if not records:
        return None

    daily_totals = {}
    for record in records:
        day = record["recordedDate"]
        daily_totals[day] = daily_totals.get(day, 0.0) + record["emissionKgco2"]

    worst_day = max(daily_totals, key=lambda day: daily_totals[day])
    return {"date": worst_day, "emission": round(daily_totals[worst_day], 2)}


def _build_report_data(uid, period_start, period_end):
    """
    Calculate every figure in a report from the raw records.

    Called both when a report is generated and every time one is opened.
    """
    records = fetch_user_records(uid, period_start, period_end)

    start_date, _ = parse_date_string(period_start)
    end_date, _ = parse_date_string(period_end)
    # +1 because both the first and last day are inside the period
    days_in_period = (end_date - start_date).days + 1

    total = total_emission(records)
    breakdown = group_by_category(records)

    # The category the user emitted the most in (ignoring untouched categories)
    active_categories = {c: v for c, v in breakdown.items() if v > 0}
    highest_category = None
    if active_categories:
        name = max(active_categories, key=lambda category: active_categories[category])
        highest_category = {
            "category": name,
            "emission": active_categories[name],
            # What share of the total footprint this one category is responsible for
            "sharePercent": round((active_categories[name] / total) * 100, 1) if total else 0.0,
        }

    return {
        "totalEmission": total,
        "recordCount": len(records),
        "daysInPeriod": days_in_period,
        "dailyAverage": round(total / days_in_period, 2) if days_in_period > 0 else 0.0,
        "categoryBreakdown": breakdown,
        "highestCategory": highest_category,
        "topSubTypes": _top_sub_types(records),
        "highestDay": _highest_day(records),
        "records": records,
    }


def _serialize_report(doc):
    """Turn a reports document into JSON (metadata only, no figures)."""
    data = doc.to_dict()
    generated_at = data.get("generatedAt")
    return {
        "id": doc.id,
        "userId": data.get("userId", ""),
        "reportType": data.get("reportType", ""),
        "periodStart": data.get("periodStart", ""),
        "periodEnd": data.get("periodEnd", ""),
        "generatedAt": generated_at.isoformat() if generated_at else None,
    }


# ---------------------------------------------------------------------------
# POST /api/reports/generate
# ---------------------------------------------------------------------------

@reports_bp.route("/generate", methods=["POST"])
@require_auth
def generate_report():
    """
    Generate a report for a date range and save its definition.

    Body: {"reportType": "monthly", "periodStart": "2026-07-01",
           "periodEnd": "2026-07-31"}
    """
    body = request.get_json(silent=True) or {}

    report_type = str(body.get("reportType", "")).strip().lower()

    if report_type not in VALID_REPORT_TYPES:
        return api_error(
            f"reportType must be one of: {', '.join(VALID_REPORT_TYPES)}.",
            400,
            code="invalid_report_type",
        )

    period_start, start_error = parse_date_string(body.get("periodStart"), "periodStart")
    if start_error:
        return api_error(start_error, 400, code="invalid_period_start")

    period_end, end_error = parse_date_string(body.get("periodEnd"), "periodEnd")
    if end_error:
        return api_error(end_error, 400, code="invalid_period_end")

    if period_end < period_start:
        return api_error(
            "periodEnd cannot be before periodStart.",
            400,
            code="invalid_period",
        )

    if (period_end - period_start).days + 1 > MAX_PERIOD_DAYS:
        return api_error(
            f"The report period cannot be longer than {MAX_PERIOD_DAYS} days.",
            400,
            code="period_too_long",
        )

    if period_start > date.today():
        return api_error(
            "periodStart cannot be in the future.",
            400,
            code="period_in_future",
        )

    start_string = period_start.isoformat()
    end_string = period_end.isoformat()

    # Save the definition of the report
    db = get_db()
    report_ref = db.collection(Config.COLLECTION_REPORTS).document()
    report_ref.set({
        "userId": g.uid,  # from the verified token, never the request body
        "reportType": report_type,
        "periodStart": start_string,
        "periodEnd": end_string,
        "generatedAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    # Calculate the figures fresh and return them with the saved definition
    report = _serialize_report(report_ref.get())
    report["data"] = _build_report_data(g.uid, start_string, end_string)

    return api_success(report, message="Report generated successfully.", status=201)


# ---------------------------------------------------------------------------
# GET /api/reports
# ---------------------------------------------------------------------------

@reports_bp.route("", methods=["GET"])
@require_auth
def list_reports():
    """
    List the reports the user has generated before, newest first.

    Only the definitions are returned here - opening one calls GET /api/reports/<id>,
    which is where the figures get calculated.
    """
    db = get_db()
    documents = (
        db.collection(Config.COLLECTION_REPORTS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", g.uid))
        .stream()
    )

    reports = [_serialize_report(doc) for doc in documents]

    # Sorting in Python rather than Firestore avoids needing a composite index
    # on userId + generatedAt. "" keeps a missing timestamp from crashing sort().
    reports.sort(key=lambda item: item["generatedAt"] or "", reverse=True)

    return api_success({"reports": reports, "count": len(reports)})


# ---------------------------------------------------------------------------
# GET /api/reports/<report_id>
# ---------------------------------------------------------------------------

@reports_bp.route("/<report_id>", methods=["GET"])
@require_auth
def get_report(report_id):
    """Open one report, recalculating its figures from the current records."""
    db = get_db()
    report_doc = db.collection(Config.COLLECTION_REPORTS).document(report_id).get()

    if not report_doc.exists:
        return api_error("Report not found.", 404, code="report_not_found")

    # OWNERSHIP CHECK - a report contains a full history of someone's habits,
    # so this matters more here than almost anywhere else in the app
    if report_doc.to_dict().get("userId") != g.uid:
        return api_error(
            "You do not have permission to view this report.",
            403,
            code="not_report_owner",
        )

    report = _serialize_report(report_doc)
    report["data"] = _build_report_data(g.uid, report["periodStart"], report["periodEnd"])

    return api_success(report)


# ---------------------------------------------------------------------------
# DELETE /api/reports/<report_id>
# ---------------------------------------------------------------------------

@reports_bp.route("/<report_id>", methods=["DELETE"])
@require_auth
def delete_report(report_id):
    """
    Delete a saved report definition.

    Deleting a report never touches carbonRecords - it only removes the saved
    date range, so the underlying emission data is completely unaffected.
    """
    db = get_db()
    report_ref = db.collection(Config.COLLECTION_REPORTS).document(report_id)
    report_doc = report_ref.get()

    if not report_doc.exists:
        return api_error("Report not found.", 404, code="report_not_found")

    # OWNERSHIP CHECK
    if report_doc.to_dict().get("userId") != g.uid:
        return api_error(
            "You do not have permission to delete this report.",
            403,
            code="not_report_owner",
        )

    report_ref.delete()
    return api_success({"id": report_id}, message="Report deleted successfully.")
