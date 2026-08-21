# EcoTrack/backend/routes/insights.py
"""
The closed-loop routes: forecast, counterfactual swaps, the what-if sandbox,
and cohort comparison.

All the actual maths lives in insights_engine.py, which is plain Python with
no Flask or Firestore dependency (see that file's docstring for why). This
file's job is strictly: authenticate, load the user's own records and the
published factors from Firestore, hand them to the engine, and log every
recommendation shown into the `interventions` collection so its real-world
effect is measurable later (see routes/engagement.py and
backend/routes/admin.py's research export).

Also mounts the weather route: separating "the weather changed" from
"behaviour changed" in a user's electricity - see weather_engine.py's own
module docstring for the full reasoning.

Mounted at /api/insights
"""

from datetime import date, datetime, timedelta, timezone

import requests
from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from insights_engine import (
    COHORT_MIN_SIZE,
    MONTHLY_BUDGET_KG,
    cohort_deciles,
    cohort_percentile,
    forecast_month,
    generate_swaps,
    macc_curve,
    simulate_scenario,
)
from routes import api_error, api_success, fetch_user_records, parse_month_string, require_auth, shift_month
from weather_engine import (
    BASE_TEMP_C,
    city_label_for_region,
    coordinates_for_region,
    daily_cooling_degree_days,
    monthly_cdd_totals,
    monthly_mean_temp,
    weather_adjusted_electricity,
    weather_context,
)

insights_bp = Blueprint("insights", __name__, url_prefix="/api/insights")

# How stale a cached cohort aggregate is allowed to get before it is
# recomputed. Vercel has no cron job available on this deployment, so the
# cache is refreshed lazily by whichever request happens to find it stale -
# the same "Firestore as shared state" pattern already used for rate
# limiting in routes/__init__.py.
COHORT_CACHE_HOURS = 6

# Weather barely changes hour to hour, so a coarser cache than the cohort's
# is fine - and it means every user sharing a region triggers at most one
# Open-Meteo call every 12 hours between them, not one per page load.
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_CACHE_HOURS = 12
WEATHER_HISTORY_DAYS = 90  # matches insights_engine.FORECAST_WINDOW_DAYS
WEATHER_REQUEST_TIMEOUT_SECONDS = 10


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _load_factor_lookup(preferred_region=""):
    """
    {(category, subType): {"factorValue", "unit", "source"}} for every
    published factor, preferring the caller's region when more than one
    document exists for the same (category, subType) - the same preference
    rule routes/carbon.py:_find_emission_factor applies when actually
    calculating and saving an emission.
    """
    db = get_db()
    lookup = {}
    region_lookup = {}
    for doc in db.collection(Config.COLLECTION_EMISSION_FACTORS).stream():
        data = doc.to_dict()
        key = (data.get("category", ""), data.get("subType", ""))
        entry = {
            "factorValue": float(data.get("factorValue", 0)),
            "unit": data.get("unit", ""),
            "source": data.get("source", ""),
        }
        if key not in lookup:
            lookup[key] = entry
        if preferred_region and str(data.get("region", "")).lower() == preferred_region.lower():
            region_lookup[key] = entry

    lookup.update(region_lookup)
    return lookup


def _user_region(uid):
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    if not user_doc.exists:
        return ""
    return user_doc.to_dict().get("region", "")


def _log_intervention(uid, intervention_type, variant, payload_summary, projected_saving_kg=None):
    """
    Fire-and-forget write to the `interventions` collection - the evaluation
    harness. A failure here must never break the response the user is
    waiting on, so it is caught and swallowed; the intervention id is only
    used by the frontend to later PATCH an accept/dismiss action onto it via
    routes/engagement.py, which is a genuinely optional follow-up.
    """
    try:
        db = get_db()
        ref = db.collection(Config.COLLECTION_INTERVENTIONS).document()
        ref.set({
            "userId": uid,
            "type": intervention_type,
            "variant": variant,
            "payloadSummary": payload_summary,
            "projectedSavingKg": projected_saving_kg,
            "shownAt": gcloud_firestore.SERVER_TIMESTAMP,
            "action": "shown",
            "actedAt": None,
        })
        return ref.id
    except Exception:
        return None


# ---------------------------------------------------------------------------
# GET /api/insights/forecast
# ---------------------------------------------------------------------------

@insights_bp.route("/forecast", methods=["GET"])
@require_auth
def forecast():
    """Month-end projection with an 80% prediction interval. See insights_engine.forecast_month."""
    records = fetch_user_records(g.uid)
    result = forecast_month(records, date.today(), Config.CATEGORIES, MONTHLY_BUDGET_KG)

    intervention_id = None
    if result["status"] == "ok":
        intervention_id = _log_intervention(
            g.uid,
            "forecast",
            "budget_gauge",
            {"projected": result["projected"], "budget": result["budget"]},
            projected_saving_kg=None,
        )

    return api_success({**result, "interventionId": intervention_id})


# ---------------------------------------------------------------------------
# GET /api/insights/swaps
# ---------------------------------------------------------------------------

@insights_bp.route("/swaps", methods=["GET"])
@require_auth
def swaps():
    """
    Ranked counterfactual swaps for one month (default: current).

    Query parameter: ?month=2026-07
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

    records = fetch_user_records(g.uid)
    factor_lookup = _load_factor_lookup(_user_region(g.uid))
    swap_list = generate_swaps(records, factor_lookup, year, month)
    curve = macc_curve(swap_list)

    intervention_id = None
    if swap_list:
        top = swap_list[0]
        intervention_id = _log_intervention(
            g.uid,
            "swap",
            "ranked_list",
            {"topSwapId": top["id"], "count": len(swap_list)},
            projected_saving_kg=sum(s["savingKg"] for s in swap_list),
        )

    return api_success({
        "swaps": swap_list,
        "maccCurve": curve,
        "month": f"{year}-{month:02d}",
        "totalPotentialSavingKg": round(sum(s["savingKg"] for s in swap_list), 2),
        "interventionId": intervention_id,
    })


# ---------------------------------------------------------------------------
# POST /api/insights/simulate
# ---------------------------------------------------------------------------

@insights_bp.route("/simulate", methods=["POST"])
@require_auth
def simulate():
    """
    The authoritative recompute behind the what-if sandbox.

    Body: {"month": "2026-07", "sliders": {"transport_petrol_car_to_bus": 0.5}}

    The sandbox sliders in the React app recompute instantly on the client
    via scenarioMath.js for a responsive feel, but that mirror is never
    trusted for anything shown as a final figure - this endpoint recomputes
    from the same server-side factor lookup and swap table used everywhere
    else, and is what a "save this scenario" or research-export feature
    would read from.
    """
    body = request.get_json(silent=True) or {}
    month_param = str(body.get("month", "")).strip()

    if month_param:
        parsed, error = parse_month_string(month_param)
        if error:
            return api_error(error, 400, code="invalid_month")
        year, month = parsed
    else:
        today = date.today()
        year, month = today.year, today.month

    sliders = body.get("sliders")
    if not isinstance(sliders, dict):
        return api_error("sliders must be an object of {swapId: fraction}.", 400, code="invalid_sliders")

    records = fetch_user_records(g.uid)
    factor_lookup = _load_factor_lookup(_user_region(g.uid))
    result = simulate_scenario(records, factor_lookup, year, month, sliders)

    return api_success(result)


# ---------------------------------------------------------------------------
# GET /api/insights/cohort
# ---------------------------------------------------------------------------

def _compute_cohort_stats(region):
    """
    Full recompute of one region's current-month deciles.

    Reads every user's current-month total once (a full collection scan of
    carbonRecords, filtered to users in this region) - expensive, which is
    exactly why the result is cached for COHORT_CACHE_HOURS rather than run
    per-request. Acceptable at this project's scale for the same reason
    routes/admin.py's stats route does a full scan: there is no cheaper path
    without a separate aggregation pipeline this project does not have.
    """
    db = get_db()
    today = date.today()
    month_start = date(today.year, today.month, 1).isoformat()
    month_end = today.isoformat()

    user_ids_in_region = {
        doc.id
        for doc in db.collection(Config.COLLECTION_USERS)
        .where(filter=gcloud_firestore.FieldFilter("region", "==", region))
        .stream()
    }

    totals_by_user = {uid: 0.0 for uid in user_ids_in_region}
    if user_ids_in_region:
        for doc in db.collection(Config.COLLECTION_CARBON_RECORDS).stream():
            data = doc.to_dict()
            uid = data.get("userId")
            if uid not in totals_by_user:
                continue
            recorded = data.get("recordedDate", "")
            if month_start <= recorded <= month_end:
                totals_by_user[uid] += float(data.get("emissionKgco2", 0) or 0)

    values = list(totals_by_user.values())
    aggregate = cohort_deciles(values)  # None below COHORT_MIN_SIZE - the k-anonymity floor

    stats = {
        "region": region,
        "month": f"{today.year}-{today.month:02d}",
        "n": len(values),
        "computedAt": gcloud_firestore.SERVER_TIMESTAMP,
    }
    if aggregate:
        stats["deciles"] = aggregate["deciles"]
        stats["mean"] = aggregate["mean"]

    db.collection(Config.COLLECTION_COHORT_STATS).document(
        f"{region}_{today.year}-{today.month:02d}"
    ).set(stats)
    return stats


@insights_bp.route("/cohort", methods=["GET"])
@require_auth
def cohort():
    """
    Where this user's current-month total sits among others in their region.

    k-ANONYMITY: a cohort smaller than COHORT_MIN_SIZE returns
    status="insufficient_cohort" with no figures at all - not even a
    rounded one. See COHORT_MIN_SIZE above.

    The `variant` shown (encouragement vs. comparison) is logged to
    `interventions` specifically so the boomerang effect documented in the
    literature (a low emitter drifting UP after learning they are already
    below average) is something this app can test for empirically rather
    than assume away. See the plan's Phase 4 for the citation.
    """
    region = _user_region(g.uid)
    if not region:
        return api_success({"status": "insufficient_cohort"})

    today = date.today()
    doc_id = f"{region}_{today.year}-{today.month:02d}"
    db = get_db()
    doc = db.collection(Config.COLLECTION_COHORT_STATS).document(doc_id).get()

    stats = doc.to_dict() if doc.exists else None
    stale = True
    if stats:
        computed_at = stats.get("computedAt")
        if computed_at:
            stale = (datetime.now(timezone.utc) - computed_at) > timedelta(hours=COHORT_CACHE_HOURS)
        else:
            stale = True

    if stats is None or stale:
        stats = _compute_cohort_stats(region)

    if stats.get("n", 0) < COHORT_MIN_SIZE:
        return api_success({"status": "insufficient_cohort", "region": region, "n": stats.get("n", 0)})

    records = fetch_user_records(
        g.uid,
        start_date=date(today.year, today.month, 1).isoformat(),
        end_date=today.isoformat(),
    )
    my_total = round(sum(float(r["emissionKgco2"]) for r in records), 2)

    deciles = stats["deciles"]
    percentile = cohort_percentile(my_total, deciles)

    # BOOMERANG GUARD: someone already doing better than the cohort mean gets
    # an approving (injunctive) framing rather than a plain descriptive
    # comparison, which is the intervention the literature associates with
    # avoiding the boomerang effect. `variant` is logged so this can be
    # analysed later, not just asserted.
    below_mean = my_total <= stats["mean"]
    variant = "injunctive_approval" if below_mean else "descriptive_comparison"

    intervention_id = _log_intervention(
        g.uid, "cohort", variant, {"percentile": percentile, "region": region}
    )

    return api_success({
        "status": "ok",
        "region": region,
        "month": stats["month"],
        "n": stats["n"],
        "myTotal": my_total,
        "deciles": deciles,
        "mean": stats["mean"],
        "percentile": percentile,
        "belowMean": below_mean,
        "variant": variant,
        "interventionId": intervention_id,
    })


# ---------------------------------------------------------------------------
# GET /api/insights/weather
# ---------------------------------------------------------------------------

def _fetch_daily_temperatures(region):
    """
    [(date, mean_temp_c)] for the trailing WEATHER_HISTORY_DAYS at a
    region's approximate coordinates (see weather_engine.REGION_COORDINATES),
    cached in Firestore per region.

    Fails closed, not loud: any problem reaching Open-Meteo, or a response
    shaped differently than expected, returns a stale cache if one exists,
    or an empty list if not - never an exception. A missing weather context
    should make one panel on /insights quietly absent, not break the page
    the way a factor lookup failure genuinely should (that one changes what
    a saved record means; this one is supporting context for it).
    """
    db = get_db()
    doc_ref = db.collection(Config.COLLECTION_WEATHER_CACHE).document(region)
    doc = doc_ref.get()
    cached = doc.to_dict() if doc.exists else None

    if cached:
        fetched_at = cached.get("fetchedAt")
        if fetched_at and (datetime.now(timezone.utc) - fetched_at) < timedelta(hours=WEATHER_CACHE_HOURS):
            return [(date.fromisoformat(item["date"]), item["temp"]) for item in cached.get("series", [])]

    lat, lon = coordinates_for_region(region)
    try:
        response = requests.get(
            OPEN_METEO_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "daily": "temperature_2m_mean",
                "timezone": "Asia/Kolkata",
                # past_days + a minimal forecast_days covers the whole
                # trailing window in the one call Open-Meteo's free,
                # keyless forecast endpoint supports - no separate
                # "archive" call needed for anything within ~90 days.
                "past_days": WEATHER_HISTORY_DAYS,
                "forecast_days": 1,
            },
            timeout=WEATHER_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        days = payload["daily"]["time"]
        temps = payload["daily"]["temperature_2m_mean"]
        series = [{"date": d, "temp": t} for d, t in zip(days, temps) if t is not None]
    except (requests.RequestException, KeyError, ValueError, TypeError):
        if cached:
            return [(date.fromisoformat(item["date"]), item["temp"]) for item in cached.get("series", [])]
        return []

    # Firestore rejects arrays-of-arrays outright ("Nested arrays are not
    # allowed"), so each day is stored as a {date, temp} map rather than a
    # [date, temp] pair.
    doc_ref.set({
        "region": region,
        "series": series,
        "fetchedAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    return [(date.fromisoformat(item["date"]), item["temp"]) for item in series]


@insights_bp.route("/weather", methods=["GET"])
@require_auth
def weather():
    """
    Weather-normalised electricity - separating "the weather changed" from
    "behaviour changed" in the category most sensitive to it. See
    weather_engine.py's module docstring for the full reasoning and its
    two-phase design (an always-available comparison, plus a real
    regression once there is enough history to fit one honestly).

    Query parameter: ?month=2026-08 (defaults to the current month)
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

    this_month_key = f"{year}-{month:02d}"
    previous_year, previous_month = shift_month(year, month, -1)
    previous_month_key = f"{previous_year}-{previous_month:02d}"

    region = _user_region(g.uid) or "India"
    daily_temps = _fetch_daily_temperatures(region)

    if not daily_temps:
        return api_success({"status": "weather_unavailable", "region": region})

    daily_cdd = daily_cooling_degree_days(daily_temps)
    cdd_by_month = monthly_cdd_totals(daily_cdd)
    temp_by_month = monthly_mean_temp(daily_temps)

    electricity_by_month = {}
    for record in fetch_user_records(g.uid):
        if record["category"] != "electricity":
            continue
        key = record["recordedDate"][:7]
        electricity_by_month[key] = electricity_by_month.get(key, 0.0) + record["emissionKgco2"]
    electricity_by_month = {k: round(v, 2) for k, v in electricity_by_month.items()}

    context = weather_context(
        electricity_by_month, cdd_by_month, temp_by_month, this_month_key, previous_month_key
    )
    regression = weather_adjusted_electricity(electricity_by_month, cdd_by_month)

    if context is None:
        status = "insufficient_data"
    elif regression is not None:
        status = "regression"
    else:
        status = "context_only"

    return api_success({
        "status": status,
        "region": region,
        "cityLabel": city_label_for_region(region),
        "baseTempC": BASE_TEMP_C,
        "context": context,
        "regression": regression,
    })
