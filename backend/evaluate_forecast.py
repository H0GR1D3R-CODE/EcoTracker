# EcoTrack/backend/evaluate_forecast.py
"""
Walk-forward backtest of the forecast engine - produces the MAE/MAPE table
that is the results section for the forecasting half of the paper.

RUN IT FROM THE BACKEND FOLDER, WITH REAL CREDENTIALS CONFIGURED:
    python evaluate_forecast.py

THIS IS NOT PART OF THE RUNNING APPLICATION, same as seed_factors.py: it is
never imported by app.py and is not deployed. It is a research tool you run
from your own machine, and it only READS Firestore - it writes nothing.

METHOD
For every user with at least two full months of history, and for every
historical month that has a full month AFTER it available to compare against
(so "the real total" is not still being logged when the comparison happens),
the script asks insights_engine.forecast_month() what it would have
predicted at day 5, 10, 15 and 20 of that month - using ONLY the records
that existed up to that simulated day, exactly as forecast_month is called
live (see its docstring on walk-forward safety) - and compares the
prediction to what the user's total for that month actually turned out to be.

The same is done for a NAIVE baseline: linear extrapolation of the actual
total logged so far, scaled up by how much of the month remains
    naive_projection = actual_to_date * (days_in_month / days_elapsed)
which is the obvious thing to do without any EWMA or day-type modelling, and
therefore the fair thing to beat.

Reports Mean Absolute Error and Mean Absolute Percentage Error for both, at
each checkpoint day and overall.
"""

import sys
from collections import defaultdict
from datetime import date, timedelta

from config import Config, get_db
from insights_engine import MONTHLY_BUDGET_KG, forecast_month

# Which day of each historical month to simulate a forecast from
CHECKPOINT_DAYS = [5, 10, 15, 20]

# A user needs at least this many total logged days before their history is
# used at all - a handful of records is not something to draw a MAE from
MIN_RECORDS_TO_INCLUDE_USER = 15


def _days_in_month(year, month):
    if month == 12:
        return (date(year + 1, 1, 1) - date(year, month, 1)).days
    return (date(year, month + 1, 1) - date(year, month, 1)).days


def _month_actual_total(records, year, month):
    start = date(year, month, 1).isoformat()
    end = date(year, month, _days_in_month(year, month)).isoformat()
    return round(sum(float(r["emissionKgco2"]) for r in records if start <= r["recordedDate"] <= end), 2)


def _naive_projection(records, year, month, checkpoint_day):
    start = date(year, month, 1).isoformat()
    checkpoint = date(year, month, checkpoint_day).isoformat()
    actual_to_date = sum(
        float(r["emissionKgco2"]) for r in records if start <= r["recordedDate"] <= checkpoint
    )
    days_in_month = _days_in_month(year, month)
    return round(actual_to_date * (days_in_month / checkpoint_day), 2)


def _fetch_all_records_by_user():
    """One full scan of carbonRecords, grouped by user - the same "one read,
    many totals" principle routes/dashboard.py already documents, applied
    across every user instead of just one."""
    db = get_db()
    by_user = defaultdict(list)
    for doc in db.collection(Config.COLLECTION_CARBON_RECORDS).stream():
        data = doc.to_dict()
        by_user[data.get("userId")].append({
            "category": data.get("category", ""),
            "emissionKgco2": float(data.get("emissionKgco2", 0) or 0),
            "recordedDate": data.get("recordedDate", ""),
        })
    return by_user


def _months_with_full_next_month(records):
    """
    Every (year, month) this user has ANY record in, excluding the most
    recent one - a month cannot be scored until it is actually over, and the
    most recent month a user has records in might still be in progress.
    """
    month_keys = sorted({r["recordedDate"][:7] for r in records if r["recordedDate"]})
    return month_keys[:-1] if len(month_keys) > 1 else []


def run():
    print("EcoTrack forecast backtest")
    print(f"Firebase project: {Config.FIREBASE_PROJECT_ID}\n")

    by_user = _fetch_all_records_by_user()

    # {checkpoint_day: {"ewma": [abs_errors...], "ewma_pct": [...], "naive": [...], "naive_pct": [...]}}
    results = {day: {"ewma": [], "ewma_pct": [], "naive": [], "naive_pct": []} for day in CHECKPOINT_DAYS}
    users_included = 0
    months_scored = 0

    for uid, records in by_user.items():
        if len(records) < MIN_RECORDS_TO_INCLUDE_USER:
            continue

        month_keys = _months_with_full_next_month(records)
        if not month_keys:
            continue

        users_included += 1

        for month_key in month_keys:
            year, month = int(month_key[:4]), int(month_key[5:7])
            days_in_month = _days_in_month(year, month)
            actual_total = _month_actual_total(records, year, month)

            scored_this_month = False
            for checkpoint_day in CHECKPOINT_DAYS:
                if checkpoint_day >= days_in_month:
                    continue
                simulated_today = date(year, month, checkpoint_day)

                forecast = forecast_month(records, simulated_today, Config.CATEGORIES, MONTHLY_BUDGET_KG)
                naive = _naive_projection(records, year, month, checkpoint_day)

                if forecast["status"] != "ok":
                    continue  # not enough history at this simulated point - skip, do not penalise

                scored_this_month = True
                ewma_error = abs(forecast["projected"] - actual_total)
                naive_error = abs(naive - actual_total)

                results[checkpoint_day]["ewma"].append(ewma_error)
                results[checkpoint_day]["naive"].append(naive_error)
                if actual_total > 0:
                    results[checkpoint_day]["ewma_pct"].append(ewma_error / actual_total * 100)
                    results[checkpoint_day]["naive_pct"].append(naive_error / actual_total * 100)

            if scored_this_month:
                months_scored += 1

    if months_scored == 0:
        print("Not enough historical data to backtest yet.")
        print(f"Need at least {MIN_RECORDS_TO_INCLUDE_USER} records per user, spanning at least two months.")
        return

    print(f"Users included: {users_included}")
    print(f"User-months scored: {months_scored}\n")

    header = f"{'Day':>5} | {'EWMA MAE':>10} | {'Naive MAE':>10} | {'EWMA MAPE':>10} | {'Naive MAPE':>11} | {'n':>5}"
    print(header)
    print("-" * len(header))

    overall_ewma_mae = []
    overall_naive_mae = []
    overall_ewma_mape = []
    overall_naive_mape = []

    for day in CHECKPOINT_DAYS:
        bucket = results[day]
        if not bucket["ewma"]:
            continue
        ewma_mae = sum(bucket["ewma"]) / len(bucket["ewma"])
        naive_mae = sum(bucket["naive"]) / len(bucket["naive"])
        ewma_mape = sum(bucket["ewma_pct"]) / len(bucket["ewma_pct"]) if bucket["ewma_pct"] else float("nan")
        naive_mape = sum(bucket["naive_pct"]) / len(bucket["naive_pct"]) if bucket["naive_pct"] else float("nan")

        print(
            f"{day:>5} | {ewma_mae:>9.2f}k | {naive_mae:>9.2f}k | "
            f"{ewma_mape:>9.1f}% | {naive_mape:>10.1f}% | {len(bucket['ewma']):>5}"
        )

        overall_ewma_mae.extend(bucket["ewma"])
        overall_naive_mae.extend(bucket["naive"])
        overall_ewma_mape.extend(bucket["ewma_pct"])
        overall_naive_mape.extend(bucket["naive_pct"])

    print("-" * len(header))
    if overall_ewma_mae:
        print(
            f"{'All':>5} | {sum(overall_ewma_mae) / len(overall_ewma_mae):>9.2f}k | "
            f"{sum(overall_naive_mae) / len(overall_naive_mae):>9.2f}k | "
            f"{sum(overall_ewma_mape) / len(overall_ewma_mape):>9.1f}% | "
            f"{sum(overall_naive_mape) / len(overall_naive_mape):>10.1f}% | {len(overall_ewma_mae):>5}"
        )

    print("\nk = kgCO2. MAE = mean absolute error. MAPE = mean absolute percentage error.")
    print("Lower is better for both. This table is the forecast evaluation for the paper.")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:  # pragma: no cover - a CLI tool's top-level guard
        print(f"\nBacktest failed: {error}", file=sys.stderr)
        print("Check backend/.env has real Firebase credentials configured.", file=sys.stderr)
        sys.exit(1)
