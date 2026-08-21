# EcoTrack/backend/routes/cron.py
"""
Scheduled jobs, triggered by Vercel Cron (see backend/vercel.json's "crons"
array) rather than a signed-in user - the one route group in this backend
that does not use @require_auth, per the security-rule docstring at the top
of routes/__init__.py (updated there to list this as the fourth documented
exception).

GUARDED BY A DIFFERENT KEY, NOT LEFT OPEN
Vercel signs every cron-triggered request with the CRON_SECRET env var as a
Bearer token automatically once it is set
(https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs) - so
checking it here is what stops anyone who finds this URL from POSTing it
themselves and spamming every user who has notifications on. See
config.py's own CRON_SECRET comment for why a blank value fails closed
(refuses every request) rather than running unauthenticated.

Mounted at /api/cron
"""

from datetime import date, timedelta
from functools import wraps

from flask import Blueprint, request

from config import Config, get_db
from notifications import send_push_to_user
from routes import api_error, api_success, fetch_user_records
from routes.engagement import STREAK_LOOKBACK_DAYS, _compute_streak

cron_bp = Blueprint("cron", __name__, url_prefix="/api/cron")


def require_cron_secret(view_function):
    @wraps(view_function)
    def wrapper(*args, **kwargs):
        if not Config.CRON_SECRET:
            return api_error("Cron is not configured.", 503, code="cron_not_configured")
        if request.headers.get("Authorization", "") != f"Bearer {Config.CRON_SECRET}":
            return api_error("Unauthorized.", 401, code="invalid_cron_secret")
        return view_function(*args, **kwargs)

    return wrapper


@cron_bp.route("/streak-reminders", methods=["GET", "POST"])
@require_cron_secret
def streak_reminders():
    """
    Runs once a day. Every user with a registered push token, an active
    streak of at least 2 days, and nothing logged yet today gets one push -
    the same closed loop the in-app streak flame and freeze mechanic
    already reward (see routes/engagement.py's _compute_streak), just
    reaching someone who has not opened the app yet today rather than only
    someone already looking at it.

    A FULL users-COLLECTION SCAN, NOT AN INDEXED QUERY
    Firestore cannot query "streak >= 2" since a streak is computed from a
    user's records, not stored anywhere as its own field. Scanning every
    user once a day is a genuine, stated small-scale assumption - the same
    honest reasoning cohort_deciles' k-anonymity floor already documents
    elsewhere in this project - not something that would still be
    reasonable at a very different user count.
    """
    db = get_db()
    window_start = (date.today() - timedelta(days=STREAK_LOOKBACK_DAYS)).isoformat()
    today = date.today()

    users_with_tokens = 0
    notified = 0

    for user_doc in db.collection(Config.COLLECTION_USERS).stream():
        tokens = (user_doc.to_dict() or {}).get("fcmTokens") or []
        if not tokens:
            continue
        users_with_tokens += 1

        records = fetch_user_records(user_doc.id, start_date=window_start)
        result = _compute_streak(records, today)

        if result["currentStreak"] >= 2 and not result["loggedToday"]:
            sent = send_push_to_user(
                user_doc.id,
                "Keep your streak going",
                f"You're on a {result['currentStreak']}-day streak. "
                "Log something today before it resets.",
                url="/calculator",
            )
            if sent:
                notified += 1

    return api_success({"usersWithTokens": users_with_tokens, "notified": notified})
