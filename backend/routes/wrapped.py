# EcoTrack/backend/routes/wrapped.py
"""
Carbon Wrapped: a shareable recap of one period (a month or a year) - total
emissions, the trend against the previous equivalent period, which category
improved the most, the longest logging streak inside the period, the
lightest single day, and how many recommendations were actually accepted.

WHY THESE STATS AND NOT OTHERS
Reward points and goal-achieved dates are NOT period-scoped in this schema -
goals/challenges documents have no achievedAt/claimedAt field (see
routes/goals.py's update_goal and routes/engagement.py's claim_challenge) -
so this route reports LIFETIME points/tree stage instead of inventing a
period-scoped points figure the data cannot actually support. Every other
stat here is built from a real timestamp (recordedDate on a carbon record,
shownAt on an intervention), never approximated.

Mounted at /api/wrapped
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
    month_label,
    require_auth,
    total_emission,
)
# Reused rather than reimplemented - the same two functions
# routes/engagement.py's own /streak and /rewards routes are built on.
from routes.engagement import _longest_streak, _tree_progress

wrapped_bp = Blueprint("wrapped", __name__, url_prefix="/api/wrapped")

VALID_PERIODS = ["month", "year"]


def _year_bounds(year):
    """First and last day of a calendar year, as "YYYY-MM-DD" strings."""
    return f"{year}-01-01", f"{year}-12-31"


def _period_bounds(period, year, month):
    if period == "year":
        return _year_bounds(year)
    return month_bounds(year, month)


def _previous_period(period, year, month):
    """The immediately preceding equivalent period, for a trend comparison."""
    if period == "year":
        return year - 1, month
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _period_label(period, year, month):
    return str(year) if period == "year" else month_label(year, month)


def _top_category(totals):
    """The single biggest contributor, or None if nothing was logged."""
    non_zero = {category: value for category, value in totals.items() if value > 0}
    if not non_zero:
        return None
    category = max(non_zero, key=non_zero.get)
    return {"category": category, "totalKg": round(non_zero[category], 2)}


def _most_improved_category(current_totals, previous_totals):
    """
    The category with the largest percentage drop from the previous period to
    this one, among categories that had emissions in BOTH periods. A category
    that simply was not logged last period has nothing real to compare
    against - showing it as "100% improved" would be a trick of missing
    data, not an actual behaviour change.
    """
    best = None
    for category, previous_value in previous_totals.items():
        if previous_value <= 0:
            continue
        current_value = current_totals.get(category, 0.0)
        drop_percent = ((previous_value - current_value) / previous_value) * 100
        if best is None or drop_percent > best["dropPercent"]:
            best = {
                "category": category,
                "previousKg": round(previous_value, 2),
                "currentKg": round(current_value, 2),
                "dropPercent": round(drop_percent, 1),
            }
    # Only worth showing as an improvement if it actually dropped
    if best is None or best["dropPercent"] <= 0:
        return None
    return best


def _best_day(records):
    """The single lowest-emission day among days that have at least one record."""
    if not records:
        return None
    totals_by_day = {}
    for record in records:
        day = record["recordedDate"]
        totals_by_day[day] = totals_by_day.get(day, 0.0) + record["emissionKgco2"]
    best_day, best_total = min(totals_by_day.items(), key=lambda item: item[1])
    return {"date": best_day, "totalKg": round(best_total, 2)}


def _change_percent(current_total, previous_total):
    """None when there is nothing real to compare against, not a misleading -100%."""
    if previous_total <= 0:
        return None
    return round(((current_total - previous_total) / previous_total) * 100, 1)


def _swaps_accepted(uid, start_date, end_date):
    """
    Count of accepted recommendations (the intervention log in
    routes/engagement.py) whose shownAt timestamp falls inside this period.
    Filtered by userId only in the Firestore query - the same
    off-composite-index convention fetch_user_records uses - with the date
    and action narrowing done in Python.
    """
    db = get_db()
    query = db.collection(Config.COLLECTION_INTERVENTIONS).where(
        filter=gcloud_firestore.FieldFilter("userId", "==", uid)
    )
    count = 0
    for doc in query.stream():
        data = doc.to_dict()
        if data.get("action") != "accepted":
            continue
        shown_at = data.get("shownAt")
        if not shown_at:
            continue
        shown_date = shown_at.date().isoformat()
        if start_date <= shown_date <= end_date:
            count += 1
    return count


@wrapped_bp.route("", methods=["GET"])
@require_auth
def get_wrapped():
    """
    GET /api/wrapped?period=month|year&year=YYYY&month=MM

    period, year and month all default to the current month.
    """
    period = (request.args.get("period") or "month").strip().lower()
    if period not in VALID_PERIODS:
        return api_error(
            f"period must be one of: {', '.join(VALID_PERIODS)}.", 400, code="invalid_period"
        )

    today = date.today()
    try:
        year = int(request.args.get("year", today.year))
        month = int(request.args.get("month", today.month))
    except (TypeError, ValueError):
        return api_error("year and month must be numbers.", 400, code="invalid_period_params")

    if period == "month" and not (1 <= month <= 12):
        return api_error("month must be between 1 and 12.", 400, code="invalid_month")

    start_date, end_date = _period_bounds(period, year, month)
    previous_year, previous_month = _previous_period(period, year, month)
    previous_start, previous_end = _period_bounds(period, previous_year, previous_month)

    records = fetch_user_records(g.uid, start_date=start_date, end_date=end_date)
    previous_records = fetch_user_records(g.uid, start_date=previous_start, end_date=previous_end)

    current_totals = group_by_category(records)
    previous_totals = group_by_category(previous_records)
    current_total_kg = total_emission(records)
    previous_total_kg = total_emission(previous_records)

    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(g.uid).get()
    total_points = (user_doc.to_dict() or {}).get("rewardPoints", 0) if user_doc.exists else 0

    return api_success({
        "period": period,
        "label": _period_label(period, year, month),
        "year": year,
        "month": month if period == "month" else None,
        "totalEmissionKg": current_total_kg,
        "entryCount": len(records),
        "previousTotalEmissionKg": previous_total_kg,
        "changePercent": _change_percent(current_total_kg, previous_total_kg),
        "topCategory": _top_category(current_totals),
        "mostImprovedCategory": _most_improved_category(current_totals, previous_totals),
        "longestStreakInPeriod": _longest_streak({r["recordedDate"] for r in records}),
        "bestDay": _best_day(records),
        "swapsAccepted": _swaps_accepted(g.uid, start_date, end_date),
        # Lifetime, not period-scoped - see module docstring for why.
        **_tree_progress(total_points),
    })
