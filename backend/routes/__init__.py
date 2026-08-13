    # EcoTrack/backend/routes/__init__.py
"""
Shared helpers for every route file in the EcoTrack backend.

This module has four sections:
    1. Response helpers   - so every route replies in the same JSON shape
    2. Security           - @require_auth and @require_admin token verification
    3. Date helpers       - month maths used by dashboard, goals and reports
    4. Data helpers       - shared Firestore queries and totalling functions

SECURITY RULE
-------------
Every route in this project is protected with @require_auth or @require_admin,
with exactly three documented exceptions:
    GET  /api/health          - server status check, returns no user data
    POST /api/auth/register   - the user has no account yet, so no token exists
    GET  /api/factors         - published scientific constants, not user data
"""

import re
from datetime import date, datetime, timedelta, timezone
from functools import wraps

import requests
from flask import g, jsonify, request
from firebase_admin import auth as firebase_auth
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db

RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"

# Short month names used in chart labels, e.g. "Jul 2026"
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# The one email rule for the whole backend, mirroring frontend/src/utils/
# validation.js exactly. Defined here so registration and feedback cannot drift
# apart and judge the same address differently.
#
# Any provider is accepted - Gmail, Yahoo, Outlook, Proton, and university
# domains such as @bcah.christuniversity.in - at any subdomain depth. What it
# still rejects is the shapes that are simply typing mistakes: "asdasd",
# "user@site", "user@.com", "user@site." and "user@site..com".
EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$"
)

# The one wording used wherever an email fails validation.
EMAIL_ERROR = "That email address does not look valid."


def is_valid_email(value):
    """Whether a string looks like a usable email address. Trims first."""
    return bool(EMAIL_PATTERN.match(str(value or "").strip()))


# ===========================================================================
# 1. RESPONSE HELPERS
# ===========================================================================

def api_success(data=None, message="", status=200):
    """Build a consistent success response: {"success": true, "data": ...}."""
    body = {"success": True}
    if message:
        body["message"] = message
    if data is not None:
        body["data"] = data
    return jsonify(body), status


def api_error(message, status=400, code=None):
    """
    Build a consistent error response: {"success": false, "error": "..."}.

    'code' is an optional short machine-readable string (for example
    "profile_not_found") that the React app can check with an if statement
    instead of comparing English error messages.
    """
    body = {"success": False, "error": message}
    if code:
        body["code"] = code
    return jsonify(body), status


# ===========================================================================
# 2. SECURITY
# ===========================================================================

def _extract_bearer_token():
    """
    Pull the raw token out of the "Authorization: Bearer <token>" header.

    Returns None when the header is missing or malformed.
    """
    header = request.headers.get("Authorization", "")
    if not header:
        return None

    parts = header.split()
    # A valid header is exactly two words: the scheme and the token
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    return parts[1]


def verify_token(token):
    """
    Check a Firebase ID token and translate any failure into an API response.

    Returns a tuple of (decoded_token, error_response):
        success -> (dict, None)
        failure -> (None, (json_response, status_code))

    Two different routes need this: the @require_auth decorator (token arrives
    in the Authorization header) and POST /api/auth/login (token arrives in the
    request body). Keeping the logic in one function means both produce exactly
    the same error messages.
    """
    try:
        # This checks the signature, the expiry time, the audience and the
        # issuer against Google's public keys. If any check fails it raises.
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token, None
    except firebase_auth.ExpiredIdTokenError:
        return None, api_error(
            "Your session has expired. Please sign in again.",
            401,
            code="token_expired",
        )
    except firebase_auth.RevokedIdTokenError:
        return None, api_error(
            "Your session was revoked. Please sign in again.",
            401,
            code="token_revoked",
        )
    except firebase_auth.UserDisabledError:
        return None, api_error("This account has been disabled.", 403, code="user_disabled")
    except firebase_auth.InvalidIdTokenError:
        return None, api_error("Invalid authentication token.", 401, code="invalid_token")
    except Exception:
        # Catch-all for network problems while fetching Google's public keys
        return None, api_error("Could not verify authentication token.", 401, code="auth_failed")


def is_admin(uid, email=None):
    """
    Whether this user is an admin.

    When ADMIN_EMAILS is configured (the normal case for this deployment) it is
    the sole authority: exactly those addresses are admins, nothing else. The
    email is read from the verified Firebase token, so it cannot be forged.

    When ADMIN_EMAILS is empty, fall back to the admins/{uid} Firestore
    collection - a document there grants admin. That keeps role data separate
    from profile data, so a user cannot promote themselves by editing their own
    profile.
    """
    # 1. Email allowlist takes over completely when configured
    if Config.ADMIN_EMAILS:
        return bool(email and email.strip().lower() in Config.ADMIN_EMAILS)

    # 2. No allowlist: fall back to the admins/{uid} collection
    db = get_db()
    admin_doc = db.collection(Config.COLLECTION_ADMINS).document(uid).get()
    return admin_doc.exists


def require_auth(view_function):
    """
    Decorator that blocks the request unless a valid Firebase ID token is sent.

    On success it stores these values on Flask's per-request object 'g':
        g.uid          - the Firebase user id (use this as the Firestore doc id)
        g.email        - the signed-in user's email address
        g.token_claims - the full decoded token, if you ever need more fields

    Usage:
        @carbon_bp.route("/records")
        @require_auth
        def list_records():
            return api_success({"userId": g.uid})
    """

    @wraps(view_function)  # keeps the original function name, which Flask needs
    def wrapper(*args, **kwargs):
        token = _extract_bearer_token()
        if not token:
            return api_error(
                "Missing or malformed Authorization header. "
                "Send 'Authorization: Bearer <firebase-id-token>'.",
                401,
                code="missing_token",
            )

        decoded_token, error = verify_token(token)
        if error:
            return error

        # Store the verified identity for the route function to use
        g.uid = decoded_token["uid"]
        g.email = decoded_token.get("email", "")
        g.token_claims = decoded_token

        return view_function(*args, **kwargs)

    return wrapper


def verify_recaptcha(token, action):
    """
    Check a Google reCAPTCHA v3 token, or pass everything through when the
    feature has no secret key configured yet.

    NOT CONFIGURED -> (True, None). Deliberately open, not deliberately
    closed: the same "optional until you add your own key" pattern as the AI
    assistant and the branded reset email elsewhere in this app. A bot check
    that is half set up and blocks every real signup because nobody added a
    secret key yet would be a worse outcome than the bot traffic it was
    meant to stop.

    CONFIGURED -> Google is asked to score the token 0.0 (bot) to 1.0
    (human). 'action' must match what the frontend told grecaptcha.execute()
    it was doing (e.g. "register") - reCAPTCHA ties the score to that label,
    and a mismatch is itself a signal something is wrong (a token minted for
    one action being replayed against a different one).

    Returns (passed: bool, reason: str | None) - reason is only for server
    logs, never sent to the client, so it cannot help an attacker learn which
    specific check they failed.
    """
    if not Config.RECAPTCHA_SECRET_KEY:
        return True, None

    if not token or not isinstance(token, str):
        return False, "missing_token"

    try:
        response = requests.post(
            RECAPTCHA_VERIFY_URL,
            data={"secret": Config.RECAPTCHA_SECRET_KEY, "response": token},
            timeout=5,
        )
        result = response.json()
    except (requests.RequestException, ValueError):
        # Google's own service being unreachable is not the caller's fault -
        # fail open rather than lock out every real user over a network blip
        # on a third party this app does not control.
        return True, "verification_unreachable"

    if not result.get("success"):
        return False, f"google_rejected:{result.get('error-codes')}"
    if result.get("action") != action:
        return False, "action_mismatch"
    if result.get("score", 0.0) < Config.RECAPTCHA_MIN_SCORE:
        return False, f"low_score:{result.get('score')}"

    return True, None


_RATE_LIMIT_COLLECTION = "rateLimits"


def client_ip():
    """
    The caller's real IP address.

    Vercel (like any platform running Flask behind a proxy/edge network) puts
    the real client address in X-Forwarded-For, not request.remote_addr -
    that header would just be the proxy's own address. The first entry in a
    comma-separated X-Forwarded-For is the original client; anything after it
    was added by intermediate proxies.
    """
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def check_rate_limit(bucket, key, max_attempts, window_seconds):
    """
    A sliding-window rate limit, backed by Firestore.

    WHY FIRESTORE AND NOT AN IN-MEMORY COUNTER
    The obvious approach - a dict of counters kept in a module-level variable,
    which is what Flask-Limiter does by default - does not work on Vercel.
    Every request can land on a fresh serverless function instance with its
    own empty memory; a counter that resets on every cold start is not a rate
    limit, it just look like one in local testing where the process actually
    stays warm. Firestore is already this app's persistent store, so it
    stands in as the shared counter with no new infrastructure, no Redis
    add-on, and no extra cost.

    'bucket' names the thing being limited (e.g. "register", "forgot-password"),
    'key' identifies who (an IP address or an email address) - the two are
    combined into one document id so different buckets never collide.

    Returns True and records this attempt if the caller is still under the
    limit, False (without recording anything further) if they are over it.
    """
    db = get_db()
    doc_ref = db.collection(_RATE_LIMIT_COLLECTION).document(f"{bucket}:{key}")
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=window_seconds)

    doc = doc_ref.get()
    attempts = []
    if doc.exists:
        stored = doc.to_dict().get("attempts") or []
        # Firestore returns timestamps as timezone-aware datetimes already,
        # so this is a plain comparison, not a conversion.
        attempts = [ts for ts in stored if ts > window_start]

    if len(attempts) >= max_attempts:
        return False

    attempts.append(now)
    doc_ref.set({"attempts": attempts})
    return True


def require_admin(view_function):
    """
    Decorator for admin-only routes.

    It runs the normal token check first, then confirms the user has a document
    in the separate 'admins' collection. Regular users get a 403, which the
    React app turns into a redirect back to the dashboard.
    """

    @wraps(view_function)
    @require_auth  # verify the token before we bother touching Firestore
    def wrapper(*args, **kwargs):
        if not is_admin(g.uid, g.email):
            return api_error(
                "Admin access required.",
                403,
                code="admin_required",
            )

        g.is_admin = True
        return view_function(*args, **kwargs)

    return wrapper


# ===========================================================================
# 3. DATE HELPERS
#
# Dates are stored as plain "YYYY-MM-DD" strings in Firestore. That format was
# chosen deliberately: because the year comes first, sorting the strings
# alphabetically gives the same answer as sorting them by date, so date ranges
# can be compared with simple < and > operators and there is no timezone
# confusion between the browser, Flask and Firestore.
# ===========================================================================

def today_string():
    """Today's date as "YYYY-MM-DD"."""
    return date.today().isoformat()


def parse_date_string(value, field_name="date"):
    """
    Validate a "YYYY-MM-DD" string.

    Returns (date_object, None) when valid, or (None, error_message) when not.
    """
    if not isinstance(value, str) or not value.strip():
        return None, f"{field_name} is required in YYYY-MM-DD format."
    try:
        # strptime raises ValueError on anything that is not exactly this format
        parsed = datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None, f"{field_name} must be a valid date in YYYY-MM-DD format."
    return parsed, None


def parse_month_string(value):
    """
    Validate a "YYYY-MM" string (used by the ?month= query parameter).

    Returns ((year, month), None) when valid, or (None, error_message) when not.
    """
    if not isinstance(value, str) or not value.strip():
        return None, "month must be in YYYY-MM format."
    try:
        parsed = datetime.strptime(value.strip(), "%Y-%m")
    except ValueError:
        return None, "month must be a valid month in YYYY-MM format."
    return (parsed.year, parsed.month), None


def month_bounds(year, month):
    """
    First and last day of a month as strings, e.g. (2026, 7) -> ("2026-07-01", "2026-07-31").

    Working out the last day without a calendar library: jump to the first day
    of the NEXT month, then step back one day.
    """
    first_day = date(year, month, 1)
    if month == 12:
        next_month_first = date(year + 1, 1, 1)
    else:
        next_month_first = date(year, month + 1, 1)
    last_day = next_month_first - timedelta(days=1)
    return first_day.isoformat(), last_day.isoformat()


def shift_month(year, month, delta):
    """
    Move a number of months backwards or forwards.

    shift_month(2026, 1, -1) -> (2025, 12)

    The maths converts the year/month pair into a single running month number,
    adds the offset, then converts it back. That avoids a pile of if statements
    for the December-to-January rollover.
    """
    total_months = year * 12 + (month - 1) + delta
    return total_months // 12, (total_months % 12) + 1


def month_label(year, month):
    """Human-friendly chart label, e.g. (2026, 7) -> "Jul 2026"."""
    return f"{MONTH_NAMES[month - 1]} {year}"


def month_key_of(date_string):
    """Take the "YYYY-MM" part out of a "YYYY-MM-DD" string."""
    return date_string[:7] if isinstance(date_string, str) and len(date_string) >= 7 else ""


# ===========================================================================
# 4. DATA HELPERS
#
# NOTE ON QUERY DESIGN (a deliberate trade-off, worth defending in the viva):
# These helpers filter by userId in Firestore (a single equality filter, which
# needs no special index) and then narrow the dates in Python. Combining an
# equality filter with a range filter in Firestore would require a custom
# composite index to be created and deployed for every query shape in the app.
# At this project's expected data volume - a few hundred records per user -
# filtering in Python costs nothing noticeable and keeps deployment simple.
# ===========================================================================

def serialize_record(doc):
    """Turn one carbonRecords document into a plain dictionary for JSON."""
    data = doc.to_dict()
    created_at = data.get("createdAt")
    return {
        "id": doc.id,
        "userId": data.get("userId", ""),
        "category": data.get("category", ""),
        "subType": data.get("subType", ""),
        "quantity": float(data.get("quantity", 0)),
        "unit": data.get("unit", ""),
        "emissionKgco2": float(data.get("emissionKgco2", 0)),
        "recordedDate": data.get("recordedDate", ""),
        "createdAt": created_at.isoformat() if created_at else None,
    }


def fetch_user_records(uid, start_date=None, end_date=None):
    """
    Load a user's carbon records, optionally limited to a date range.

    start_date and end_date are inclusive "YYYY-MM-DD" strings. Because of the
    sortable date format, the range check is a plain string comparison.
    """
    db = get_db()
    query = db.collection(Config.COLLECTION_CARBON_RECORDS).where(
        # FieldFilter is the current way to write Firestore filters; the older
        # .where("userId", "==", uid) style still works but is deprecated.
        filter=gcloud_firestore.FieldFilter("userId", "==", uid)
    )

    records = []
    for doc in query.stream():
        record = serialize_record(doc)
        recorded = record["recordedDate"]
        if start_date and recorded < start_date:
            continue
        if end_date and recorded > end_date:
            continue
        records.append(record)

    # Newest first - the same order the frontend table displays
    records.sort(key=lambda item: item["recordedDate"], reverse=True)
    return records


def total_emission(records):
    """Add up emissionKgco2 across a list of records."""
    return round(sum(record["emissionKgco2"] for record in records), 2)


def group_by_category(records):
    """
    Total emissions per category, e.g. {"transport": 42.5, "diet": 18.0}.

    Every one of the seven categories is included even when it has no records,
    so the frontend charts always draw the same set of slices.
    """
    totals = {category: 0.0 for category in Config.CATEGORIES}
    for record in records:
        category = record["category"]
        totals[category] = totals.get(category, 0.0) + record["emissionKgco2"]
    return {category: round(value, 2) for category, value in totals.items()}
