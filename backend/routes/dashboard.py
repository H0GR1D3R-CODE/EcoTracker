# EcoTrack/backend/routes/dashboard.py
"""
Dashboard aggregation routes.

These routes do no new maths on emissions - the kgCO2 value was already worked
out and stored when the user logged the entry. What happens here is
AGGREGATION: slicing the same stored records by month, by year and by category
so the stat cards and Chart.js charts have numbers to draw.

DESIGN NOTE (defend this in the viva)
-------------------------------------
Each route loads the user's records once and totals them in Python rather than
running one Firestore query per statistic. Firestore bills per document read,
so reading the same 200 documents six times to build six numbers would cost six
times as much and be slower. One read, many totals.

Mounted at /api/dashboard
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
    month_bounds,
    month_key_of,
    month_label,
    parse_month_string,
    require_auth,
    shift_month,
    total_emission,
)

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")

# How many months the trend line shows by default, and the most it will allow
DEFAULT_TREND_MONTHS = 6
MAX_TREND_MONTHS = 24


# ---------------------------------------------------------------------------
# Helpers used only inside this file
# ---------------------------------------------------------------------------

def _records_in_month(records, year, month):
    """Filter an already-loaded record list down to one month."""
    key = f"{year}-{month:02d}"
    return [r for r in records if month_key_of(r["recordedDate"]) == key]


def _records_in_year(records, year):
    """Filter an already-loaded record list down to one year."""
    prefix = str(year)
    return [r for r in records if r["recordedDate"].startswith(prefix)]


def _percentage_change(current, previous):
    """
    Work out the percentage change between two months.

    Returns (percentage, trend_word). When there is no previous month to compare
    against, percentage is None and the trend is "new" - the frontend shows a
    dash instead of a misleading "100% increase".
    """
    if previous == 0 and current == 0:
        return 0.0, "same"
    if previous == 0:
        return None, "new"

    change = ((current - previous) / previous) * 100
    if change > 0.05:
        trend = "up"       # emissions went UP, which is bad news
    elif change < -0.05:
        trend = "down"     # emissions went DOWN, which is the goal
    else:
        trend = "same"
    return round(change, 1), trend


def _best_category(this_month_totals, previous_month_totals):
    """
    Pick the "Best Category" stat card value.

    Rule 1 (preferred): the category the user cut the most since last month.
                        That rewards actual improvement.
    Rule 2 (fallback):  if there is nothing to compare against, the category
                        with the lowest emissions this month.

    Returns None when the user has logged nothing at all yet.
    """
    active = {c: v for c, v in this_month_totals.items() if v > 0}
    if not active:
        return None

    # Rule 1 - look for the biggest percentage drop
    best_drop_category = None
    best_drop_percent = 0.0
    for category, current in this_month_totals.items():
        previous = previous_month_totals.get(category, 0.0)
        if previous > 0 and current < previous:
            drop = ((previous - current) / previous) * 100
            if drop > best_drop_percent:
                best_drop_percent = drop
                best_drop_category = category

    if best_drop_category:
        return {
            "category": best_drop_category,
            "thisMonth": round(this_month_totals[best_drop_category], 2),
            "previousMonth": round(previous_month_totals[best_drop_category], 2),
            "changePercent": -round(best_drop_percent, 1),  # negative = a reduction
            "reason": "largest_reduction",
        }

    # Rule 2 - lowest emitting category this month
    lowest = min(active, key=lambda category: active[category])
    return {
        "category": lowest,
        "thisMonth": round(active[lowest], 2),
        "previousMonth": round(previous_month_totals.get(lowest, 0.0), 2),
        "changePercent": None,
        "reason": "lowest_emissions",
    }


def _count_active_goals(uid):
    """How many goals the user still has in progress."""
    db = get_db()
    goals = (
        db.collection(Config.COLLECTION_GOALS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .stream()
    )
    # Counting in Python avoids needing a composite index on userId + status
    return sum(1 for goal in goals if goal.to_dict().get("status") == "active")


def _build_trend(records, months):
    """
    Build the last N months of totals, oldest first, for the trend line chart.

    Months with no records are included as 0 rather than skipped, otherwise the
    chart would silently compress a quiet month and distort the line.
    """
    today = date.today()
    trend = []

    # range(months - 1, -1, -1) counts backwards: 5, 4, 3, 2, 1, 0
    # so the oldest month is added first and the current month last
    for offset in range(months - 1, -1, -1):
        year, month = shift_month(today.year, today.month, -offset)
        month_records = _records_in_month(records, year, month)
        trend.append({
            "month": f"{year}-{month:02d}",
            "label": month_label(year, month),
            "total": total_emission(month_records),
            "count": len(month_records),
        })

    return trend


# ---------------------------------------------------------------------------
# GET /api/dashboard/summary
# ---------------------------------------------------------------------------

@dashboard_bp.route("/summary", methods=["GET"])
@require_auth
def summary():
    """
    Everything the dashboard needs in a single request.

    Returns: thisMonth, thisYear, bestCategory, activeGoals, monthlyTrend[6],
             categoryBreakdown, previousMonth, percentageChange.
    """
    # One read of the user's history, reused for every figure below
    records = fetch_user_records(g.uid)

    today = date.today()
    previous_year, previous_month_number = shift_month(today.year, today.month, -1)

    this_month_records = _records_in_month(records, today.year, today.month)
    previous_month_records = _records_in_month(records, previous_year, previous_month_number)
    this_year_records = _records_in_year(records, today.year)

    this_month_total = total_emission(this_month_records)
    previous_month_total = total_emission(previous_month_records)

    percentage_change, trend_direction = _percentage_change(
        this_month_total, previous_month_total
    )

    return api_success({
        "thisMonth": this_month_total,
        "previousMonth": previous_month_total,
        "thisYear": total_emission(this_year_records),
        "percentageChange": percentage_change,
        "trend": trend_direction,
        "bestCategory": _best_category(
            group_by_category(this_month_records),
            group_by_category(previous_month_records),
        ),
        "activeGoals": _count_active_goals(g.uid),
        "monthlyTrend": _build_trend(records, DEFAULT_TREND_MONTHS),
        "categoryBreakdown": group_by_category(this_month_records),
        "totalRecords": len(records),
        "recordsThisMonth": len(this_month_records),
        "currentMonth": f"{today.year}-{today.month:02d}",
    })


# ---------------------------------------------------------------------------
# GET /api/dashboard/chart/monthly
# ---------------------------------------------------------------------------

@dashboard_bp.route("/chart/monthly", methods=["GET"])
@require_auth
def chart_monthly():
    """
    Data for the 6-month line chart with the gradient fill.

    Query parameter: ?months=6  (1 to 24, defaults to 6)

    Returns labels and data as two matching arrays, which is exactly the shape
    Chart.js expects, so the frontend can pass them straight through.
    """
    months_param = (request.args.get("months") or str(DEFAULT_TREND_MONTHS)).strip()

    if not months_param.isdigit():
        return api_error("months must be a whole number.", 400, code="invalid_months")

    months = int(months_param)
    if months < 1 or months > MAX_TREND_MONTHS:
        return api_error(
            f"months must be between 1 and {MAX_TREND_MONTHS}.",
            400,
            code="invalid_months",
        )

    records = fetch_user_records(g.uid)
    trend = _build_trend(records, months)

    return api_success({
        "labels": [point["label"] for point in trend],
        "data": [point["total"] for point in trend],
        "months": [point["month"] for point in trend],
        "unit": "kgCO2",
    })


# ---------------------------------------------------------------------------
# GET /api/dashboard/chart/category
# ---------------------------------------------------------------------------

@dashboard_bp.route("/chart/category", methods=["GET"])
@require_auth
def chart_category():
    """
    Data for the doughnut chart and the current-vs-previous bar chart.

    Query parameter: ?month=2026-07  (defaults to the current month)
    """
    month_param = (request.args.get("month") or "").strip()

    if month_param:
        parsed, error = parse_month_string(month_param)
        if error:
            return api_error(error, 400, code="invalid_month")
        year, month = parsed
    else:
        today = date.today()
        year, month = today.year, today.month

    previous_year, previous_month = shift_month(year, month, -1)

    start_date, end_date = month_bounds(year, month)
    previous_start, previous_end = month_bounds(previous_year, previous_month)

    current_records = fetch_user_records(g.uid, start_date, end_date)
    previous_records = fetch_user_records(g.uid, previous_start, previous_end)

    current_totals = group_by_category(current_records)
    previous_totals = group_by_category(previous_records)

    # Keep the fixed category order from config so the chart colours stay
    # attached to the same category every time the dashboard reloads
    categories = Config.CATEGORIES

    return api_success({
        # "transport" -> "Transport" for display
        "labels": [category.capitalize() for category in categories],
        "keys": categories,
        "data": [current_totals.get(category, 0.0) for category in categories],
        "previousData": [previous_totals.get(category, 0.0) for category in categories],
        "total": total_emission(current_records),
        "previousTotal": total_emission(previous_records),
        "month": f"{year}-{month:02d}",
        "previousMonth": f"{previous_year}-{previous_month:02d}",
        "unit": "kgCO2",
    })
