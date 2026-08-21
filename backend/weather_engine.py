# EcoTrack/backend/weather_engine.py
"""
Weather-normalised electricity: separating "the weather changed" from
"behaviour changed" in a user's own emissions.

THE QUESTION THIS ANSWERS
--------------------------
Every comparison EcoTrack already makes - this month vs last, a goal's
progress, the forecast, the cohort ranking - silently assumes the weather
held constant. It does not. A 15% drop in someone's electricity could be
real behaviour change, or it could just have been a cooler month. Without
separating the two, "reduced your footprint" is a claim this app cannot
actually back up for its biggest, most weather-sensitive category.

COOLING DEGREE DAYS (CDD), NOT HEATING
Most of India's electricity-weather link runs through cooling (fans, AC),
not heating, so this module only computes CDD: how far a day's mean
temperature sits above a comfort baseline, summed as "how much cooling
demand this month plausibly had". BASE_TEMP_C=24 is a commonly used
comfort-band baseline in Indian degree-day work - stated here as a
deliberate, documented assumption, the same way insights_engine.py's swap
feasibility fractions are.

WHY THIS FILE IS FRAMEWORK-FREE
Same reasoning as insights_engine.py's own docstring: plain Python data in,
plain Python data out, so routes/insights.py (the live API), the test
suite, and nothing else all agree on one implementation. This file makes
no network calls itself - routes/insights.py fetches the daily temperature
series (from Open-Meteo, cached in Firestore) and hands it to
weather_adjusted_electricity() below.

TWO HONEST PHASES, NOT ONE OPTIMISTIC ONE
  1. CONTEXT (available from day one): "this month was N degree-days
     warmer than last month" - true and useful immediately, no fitting.
  2. REGRESSION (needs MIN_MONTHS_FOR_REGRESSION separate months of
     electricity records with some real variation in monthly CDD): an
     actual ordinary-least-squares fit of kg CO2 against CDD, reported
     with its own R^2 so a low-confidence fit looks like one. A brand new
     app with only weeks of history should show phase 1, not a regression
     line drawn through two points pretending to be science.
"""

from datetime import date, timedelta

# Cooling comfort baseline in Celsius - see module docstring. A day's CDD is
# how far its mean temperature sits above this, floored at zero.
BASE_TEMP_C = 24.0

# Regression needs enough distinct months, with enough spread in monthly CDD
# between them, to mean anything - two points can always be joined by a
# "perfect" line that says nothing.
MIN_MONTHS_FOR_REGRESSION = 3
MIN_CDD_SPREAD_FOR_REGRESSION = 10.0  # degree-days between the driest and warmest month

# Approximate coordinates for each region Register.jsx's REGIONS list
# offers - the state's capital (or most populous city where the capital is
# a small purpose-built town), used as a single representative point for
# the whole state. This is a real, stated approximation, not precision:
# Karnataka's weather at its northern border is not Bengaluru's. Good
# enough to separate "unusually hot month" from "normal month"; not
# intended as a hyper-local forecast.
REGION_COORDINATES = {
    "India": (28.6139, 77.2090),  # New Delhi - national fallback
    "Andhra Pradesh": (16.5062, 80.6480),  # Vijayawada
    "Assam": (26.1445, 91.7362),  # Guwahati
    "Bihar": (25.5941, 85.1376),  # Patna
    "Delhi": (28.6139, 77.2090),
    "Goa": (15.4909, 73.8278),  # Panaji
    "Gujarat": (23.0225, 72.5714),  # Ahmedabad
    "Haryana": (30.7333, 76.7794),  # Chandigarh
    "Karnataka": (12.9716, 77.5946),  # Bengaluru
    "Kerala": (8.5241, 76.9366),  # Thiruvananthapuram
    "Madhya Pradesh": (23.2599, 77.4126),  # Bhopal
    "Maharashtra": (19.0760, 72.8777),  # Mumbai
    "Odisha": (20.2961, 85.8245),  # Bhubaneswar
    "Punjab": (30.7333, 76.7794),  # Chandigarh
    "Rajasthan": (26.9124, 75.7873),  # Jaipur
    "Tamil Nadu": (13.0827, 80.2707),  # Chennai
    "Telangana": (17.3850, 78.4867),  # Hyderabad
    "Uttar Pradesh": (26.8467, 80.9462),  # Lucknow
    "West Bengal": (22.5726, 88.3639),  # Kolkata
    "Other": (28.6139, 77.2090),
}

# Human-readable label for the approximate city each region maps to, so the
# UI can cite exactly where its weather figure came from rather than just
# echoing the state name back.
REGION_CITY_LABELS = {
    "India": "New Delhi", "Andhra Pradesh": "Vijayawada", "Assam": "Guwahati",
    "Bihar": "Patna", "Delhi": "New Delhi", "Goa": "Panaji",
    "Gujarat": "Ahmedabad", "Haryana": "Chandigarh", "Karnataka": "Bengaluru",
    "Kerala": "Thiruvananthapuram", "Madhya Pradesh": "Bhopal",
    "Maharashtra": "Mumbai", "Odisha": "Bhubaneswar", "Punjab": "Chandigarh",
    "Rajasthan": "Jaipur", "Tamil Nadu": "Chennai", "Telangana": "Hyderabad",
    "Uttar Pradesh": "Lucknow", "West Bengal": "Kolkata", "Other": "New Delhi",
}


def coordinates_for_region(region):
    """(lat, lon) for a region, falling back to the national default for
    anything not in REGION_COORDINATES (an unrecognised or missing region)."""
    return REGION_COORDINATES.get(region, REGION_COORDINATES["India"])


def city_label_for_region(region):
    return REGION_CITY_LABELS.get(region, REGION_CITY_LABELS["India"])


def daily_cooling_degree_days(daily_mean_temps, base_temp_c=BASE_TEMP_C):
    """
    [(date, cdd)] from [(date, mean_temp_c)].

    A day at or below base_temp_c contributes 0, not a negative number -
    degree-days measure cooling DEMAND, and there is no such thing as
    negative demand.
    """
    return [(d, round(max(0.0, temp - base_temp_c), 2)) for d, temp in daily_mean_temps]


def monthly_cdd_totals(daily_cdd):
    """{"YYYY-MM": total_cdd} summed from a [(date, cdd)] series."""
    totals = {}
    for d, cdd in daily_cdd:
        key = f"{d.year:04d}-{d.month:02d}"
        totals[key] = round(totals.get(key, 0.0) + cdd, 2)
    return totals


def monthly_mean_temp(daily_mean_temps):
    """{"YYYY-MM": average_temp_c} - context only, for display."""
    by_month = {}
    for d, temp in daily_mean_temps:
        key = f"{d.year:04d}-{d.month:02d}"
        by_month.setdefault(key, []).append(temp)
    return {k: round(sum(v) / len(v), 1) for k, v in by_month.items()}


def _ordinary_least_squares(xs, ys):
    """
    Plain-Python simple linear regression: y = slope*x + intercept, plus R^2.

    No numpy - this project has none as a dependency, and a two-variable OLS
    fit is a handful of sums, not a reason to add one. Returns None when
    there is no meaningful x-variance to fit against (e.g. every month had
    identical CDD, which would make "slope" a division by zero, not a real
    answer).
    """
    n = len(xs)
    if n < 2:
        return None

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    var_x = sum((x - mean_x) ** 2 for x in xs)
    if var_x == 0:
        return None

    covariance = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    slope = covariance / var_x
    intercept = mean_y - slope * mean_x

    predicted = [slope * x + intercept for x in xs]
    ss_res = sum((y - p) ** 2 for y, p in zip(ys, predicted))
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    r_squared = 1.0 if ss_tot == 0 else round(1 - ss_res / ss_tot, 3)

    return {
        "slope": round(slope, 4),
        "intercept": round(intercept, 2),
        "r2": max(0.0, r_squared),
        "months": n,
    }


def weather_context(electricity_by_month, cdd_by_month, temp_by_month, this_month, previous_month):
    """
    Phase 1: always-available comparison, no fitting required.

    Returns None if either month is missing weather data entirely (should
    not happen once the Open-Meteo fetch has run, but a route should never
    trust an external API unconditionally).
    """
    if this_month not in cdd_by_month or previous_month not in cdd_by_month:
        return None

    this_cdd = cdd_by_month[this_month]
    previous_cdd = cdd_by_month.get(previous_month, 0.0)
    cdd_delta_percent = (
        round(((this_cdd - previous_cdd) / previous_cdd) * 100, 1) if previous_cdd > 0 else None
    )

    return {
        "thisMonth": {
            "month": this_month,
            "cdd": this_cdd,
            "meanTempC": temp_by_month.get(this_month),
            "electricityKg": electricity_by_month.get(this_month),
        },
        "previousMonth": {
            "month": previous_month,
            "cdd": previous_cdd,
            "meanTempC": temp_by_month.get(previous_month),
            "electricityKg": electricity_by_month.get(previous_month),
        },
        "cddDeltaPercent": cdd_delta_percent,
    }


def weather_adjusted_electricity(electricity_by_month, cdd_by_month):
    """
    Phase 2: an actual fit, once there is enough real spread to fit against.

    electricity_by_month / cdd_by_month: {"YYYY-MM": float}, independently
    keyed - only months present in BOTH are used, since a month with
    electricity logged but no weather fetched yet (or vice versa) cannot
    contribute a real (x, y) pair.

    Returns None (not a fabricated fit) below MIN_MONTHS_FOR_REGRESSION
    shared months, or below MIN_CDD_SPREAD_FOR_REGRESSION degree-days of
    spread across them - a regression across a narrow, near-identical
    range of weather cannot say anything about weather's effect either.
    """
    shared_months = sorted(set(electricity_by_month) & set(cdd_by_month))
    if len(shared_months) < MIN_MONTHS_FOR_REGRESSION:
        return None

    xs = [cdd_by_month[m] for m in shared_months]
    ys = [electricity_by_month[m] for m in shared_months]

    if max(xs) - min(xs) < MIN_CDD_SPREAD_FOR_REGRESSION:
        return None

    fit = _ordinary_least_squares(xs, ys)
    if fit is None:
        return None

    # The "weather-adjusted" figure: what an AVERAGE-weather month would
    # have cost this user, at their fitted per-degree-day rate - the
    # intercept alone, since that is the fit's y-value at CDD=0.
    average_cdd = round(sum(xs) / len(xs), 1)
    weather_adjusted_kg = round(max(0.0, fit["intercept"] + fit["slope"] * average_cdd), 2)

    return {
        **fit,
        "months": shared_months,
        "kgPerDegreeDay": fit["slope"],
        "averageCddInSample": average_cdd,
        "weatherAdjustedMonthlyKg": weather_adjusted_kg,
    }
