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
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from notifications import send_push_to_user
from routes import api_error, api_success, fetch_user_records, total_emission
from routes.assistant import MONTHLY_BUDGET_KG
from routes.engagement import STREAK_LOOKBACK_DAYS, _compute_streak
from routes.goals import _serialize_goal

cron_bp = Blueprint("cron", __name__, url_prefix="/api/cron")

# The same personal-budget figure Insights.jsx's science-based target
# tracker and assistant.py's own MONTHLY_BUDGET_KG already use - imported
# rather than redefined, since this is a plain constant with nothing
# module-specific about it.
ANNUAL_BUDGET_KG = MONTHLY_BUDGET_KG * 12

# Stored on the user doc so this alert fires AT MOST ONCE PER CALENDAR
# MONTH, not every single day someone stays over pace - unlike the other
# three tiers below (a claimed goal, a logged streak, a logged reminder
# category), "projected over budget" has no natural day-to-day reset: it
# stays true for weeks once crossed, and a daily push saying the same thing
# would read as spam within 48 hours.
BUDGET_ALERT_MONTH_FIELD = "lastBudgetAlertMonth"


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
    Runs once a day. Every user with a registered push token gets AT MOST
    ONE push - four things are checked, in priority order, and the first
    one that applies is what gets sent:

      1. A goal that is achieved but not yet claimed (routes/goals.py's
         isAchieved true, stored status still "active") - "come collect
         what you already earned" is a stronger, more specific nudge than
         a generic reminder, and claiming it is also where
         POINTS_PER_GOAL_ACHIEVED actually gets credited (routes/goals.py's
         update_goal), so this doubles as a reward-system nudge.
      2. Otherwise, the original streak reminder: an active streak of at
         least 2 days with nothing logged yet today - the same closed loop
         the in-app streak flame and freeze mechanic already reward (see
         routes/engagement.py's _compute_streak).
      3. Otherwise, a user-configured activity reminder (routes/reminders.py)
         due today (today's weekday is in the reminder's daysOfWeek) for a
         category nothing has been logged in yet today. See reminders.py's
         own module docstring for why this is "which days", never a chosen
         time - this cron only runs once a day in the first place.
      4. Otherwise, a projected-over-budget alert: this calendar year's
         year-to-date total, extrapolated at its own pace to a full year,
         exceeds ANNUAL_BUDGET_KG - the same straight-line projection
         Insights.jsx's own science-based target tracker shows. Sent at
         most once per calendar month (see BUDGET_ALERT_MONTH_FIELD above),
         since unlike the other three tiers this one has no natural day-to-
         day reset once it starts being true.

    Deliberately at most one push, not one for each - two unrelated
    notifications landing back to back the same day reads as spam, not two
    real reasons to open the app.

    A FULL users-COLLECTION SCAN, NOT AN INDEXED QUERY
    Firestore cannot query "streak >= 2" or "isAchieved" - a streak and a
    goal's achieved state are both computed from a user's records, not
    stored anywhere as their own field. Scanning every user once a day is a
    genuine, stated small-scale assumption - the same honest reasoning
    cohort_deciles' k-anonymity floor already documents elsewhere in this
    project - not something that would still be reasonable at a very
    different user count.
    """
    db = get_db()
    window_start = (date.today() - timedelta(days=STREAK_LOOKBACK_DAYS)).isoformat()
    today = date.today()

    users_with_tokens = 0
    notified_for_goal = 0
    notified_for_streak = 0
    notified_for_reminder = 0
    notified_for_budget = 0
    today_weekday = today.weekday()
    this_month_key = today.strftime("%Y-%m")
    year_start = f"{today.year}-01-01"

    for user_doc in db.collection(Config.COLLECTION_USERS).stream():
        tokens = (user_doc.to_dict() or {}).get("fcmTokens") or []
        if not tokens:
            continue
        users_with_tokens += 1
        uid = user_doc.id

        # --- 1. an achieved, unclaimed goal takes priority ---
        active_goal_docs = list(
            db.collection(Config.COLLECTION_GOALS)
            .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
            .where(filter=gcloud_firestore.FieldFilter("status", "==", "active"))
            .stream()
        )
        achieved_goals = [
            _serialize_goal(doc, uid) for doc in active_goal_docs
        ]
        achieved_goals = [g for g in achieved_goals if g["isAchieved"]]

        if achieved_goals:
            first = achieved_goals[0]
            body = (
                f"Your {first['category']} goal is ready to claim!"
                if len(achieved_goals) == 1
                else f"{len(achieved_goals)} goals are ready to claim!"
            )
            sent = send_push_to_user(
                uid, "A goal is within reach", body, url="/goals"
            )
            if sent:
                notified_for_goal += 1
            continue

        # --- 2. otherwise, the streak reminder ---
        records = fetch_user_records(uid, start_date=window_start)
        result = _compute_streak(records, today)

        if result["currentStreak"] >= 2 and not result["loggedToday"]:
            sent = send_push_to_user(
                uid,
                "Keep your streak going",
                f"You're on a {result['currentStreak']}-day streak. "
                "Log something today before it resets.",
                url="/calculator",
            )
            if sent:
                notified_for_streak += 1
            continue

        # --- 3. otherwise, a user-configured reminder due today ---
        # NOT an early "continue" when there are none configured - a user
        # with zero reminders set up must still fall through to tier 4
        # below, not be skipped past it entirely.
        reminder_docs = list(
            db.collection(Config.COLLECTION_ACTIVITY_REMINDERS)
            .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
            .stream()
        )
        logged_today_categories = {r["category"] for r in records if r["recordedDate"] == today.isoformat()}
        due_today = [
            doc.to_dict()
            for doc in reminder_docs
            if today_weekday in doc.to_dict().get("daysOfWeek", [])
            and doc.to_dict().get("category") not in logged_today_categories
        ]
        if due_today:
            first = due_today[0]
            body = (
                f"Don't forget to log your {first['category']} today."
                if len(due_today) == 1
                else f"{len(due_today)} reminders are due today - starting with {first['category']}."
            )
            sent = send_push_to_user(uid, "Reminder", body, url="/calculator")
            if sent:
                notified_for_reminder += 1
            continue

        # --- 4. otherwise, a projected-over-budget alert, once a month ---
        already_alerted_this_month = (user_doc.to_dict() or {}).get(BUDGET_ALERT_MONTH_FIELD) == this_month_key
        if already_alerted_this_month:
            continue

        year_records = fetch_user_records(uid, start_date=year_start, end_date=today.isoformat())
        year_to_date_kg = total_emission(year_records)
        # today.month is 1-12, never 0, so this division is always safe -
        # January alone already reads as "1 month elapsed".
        projected_annual_kg = (year_to_date_kg / today.month) * 12

        if projected_annual_kg > ANNUAL_BUDGET_KG:
            percent_over = round(((projected_annual_kg - ANNUAL_BUDGET_KG) / ANNUAL_BUDGET_KG) * 100)
            sent = send_push_to_user(
                uid,
                "Off pace for a 1.5°C-aligned year",
                f"At your current pace, you're projected {percent_over}% over the "
                f"{round(ANNUAL_BUDGET_KG):,} kg CO2 budget for this year.",
                url="/insights",
            )
            if sent:
                # Recorded regardless of whether this exact push was the
                # very first one this month - the point is "do not send
                # this AGAIN this month", not "track delivery precisely".
                db.collection(Config.COLLECTION_USERS).document(uid).set(
                    {BUDGET_ALERT_MONTH_FIELD: this_month_key}, merge=True
                )
                notified_for_budget += 1

    return api_success({
        "usersWithTokens": users_with_tokens,
        "notifiedForGoal": notified_for_goal,
        "notifiedForStreak": notified_for_streak,
        "notifiedForReminder": notified_for_reminder,
        "notifiedForBudget": notified_for_budget,
    })
