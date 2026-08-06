# EcoTrack/backend/routes/assistant.py
"""
The EcoTrack Assistant - an AI guide and report writer, powered by Google Gemini.

WHY GEMINI
Google AI Studio offers a genuinely free API tier with no card required, which
is what makes this feature possible on a student budget. The provider is the
only thing that is specific to Google: the routes, the grounding logic, and the
entire React chat panel are provider-agnostic. Swapping to a different model
service later means rewriting only the two _call_model blocks in this file.

HOW THIS IS WIRED, AND WHY IT MATTERS FOR SECURITY
---------------------------------------------------
The React app NEVER talks to Google directly. Every request goes:

    browser  ->  Flask (verifies the Firebase token)
             ->  Gemini  (using the server's secret API key)
             ->  Flask
             ->  browser

If the API key were in the frontend, anyone could open DevTools and copy it.
Keeping it server-side is the whole reason this file exists rather than the
React app calling Gemini itself.

GROUNDING - the reason the assistant does not invent numbers
------------------------------------------------------------
Before each request, Flask reads the signed-in user's real Firestore data and
puts it in the system instruction. The assistant is then told, explicitly, to
use only those figures and to say so when it does not know something. It reads
that snapshot and nothing else: it cannot see other users' data, and it has no
ability to write, edit, or delete anything at all.

Mounted at /api/assistant
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
    is_admin,
    month_bounds,
    parse_date_string,
    require_auth,
    shift_month,
    total_emission,
)

# Imported defensively so a missing dependency degrades to "assistant
# unavailable" instead of stopping the whole server from booting.
try:
    from google import genai
    from google.genai import errors as genai_errors
    from google.genai import types as genai_types

    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

assistant_bp = Blueprint("assistant", __name__, url_prefix="/api/assistant")

# Keep replies short - this is a helper panel beside a dashboard, not an essay
MAX_REPLY_TOKENS = 900
MAX_SUMMARY_TOKENS = 1400

# How much conversation to send back. The API is stateless, so every past turn
# is re-sent on each request - an uncapped history means a request that grows
# with the length of the chat.
MAX_HISTORY_MESSAGES = 10

MAX_MESSAGE_LENGTH = 2000

# The personal carbon budget consistent with 1.5 C of warming
MONTHLY_BUDGET_KG = 2000 / 12

# Gemini finish reasons that mean "there is no usable answer in this response".
# response.text is None or empty in these cases, so they must be checked before
# reading it.
BLOCKED_FINISH_REASONS = {
    "SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "SPII",
    "RECITATION",
}


def _get_client():
    """
    Build the Gemini client, or return an error response if it cannot be.

    Returns (client, None) on success, or (None, error_response).
    """
    if not GENAI_AVAILABLE:
        return None, api_error(
            "The assistant is not installed on this server. "
            "Run: pip install -r requirements.txt",
            503,
            code="assistant_unavailable",
        )

    if not Config.GEMINI_API_KEY:
        return None, api_error(
            "The assistant is not configured. Add GEMINI_API_KEY to backend/.env.",
            503,
            code="assistant_not_configured",
        )

    # Passing the key explicitly rather than relying on the ambient environment
    # keeps this behaving the same way locally and on Render
    return genai.Client(api_key=Config.GEMINI_API_KEY), None


def _build_admin_context():
    """
    Platform-wide figures, for admins only.

    Added on TOP of the admin's own context so they can ask "how many users
    signed up this month" or "how much has been donated" and get a real answer
    instead of a guess.

    SCOPE, deliberately: totals and aggregates, plus names and emails, because
    an admin can already see all of that in the console. It does NOT include
    per-user records, goals or feedback text - those stay behind the drill-down,
    where reading them is an explicit act rather than something that quietly
    ends up in a third-party model's prompt on every unrelated question.

    The caller MUST have checked is_admin first. This function does no checking
    of its own.
    """
    db = get_db()
    today = date.today()
    this_month_prefix = today.strftime("%Y-%m")

    # --- users ---
    users = []
    for doc in db.collection(Config.COLLECTION_USERS).stream():
        data = doc.to_dict()
        created = data.get("createdAt")
        users.append({
            "name": data.get("name", ""),
            "email": data.get("email", ""),
            "region": data.get("region", ""),
            "created": created.isoformat() if created else "",
        })

    new_this_month = sum(1 for u in users if u["created"].startswith(this_month_prefix))

    # --- emissions across everyone ---
    record_count = 0
    platform_emission = 0.0
    month_emission = 0.0
    category_totals = {}
    for doc in db.collection(Config.COLLECTION_CARBON_RECORDS).stream():
        data = doc.to_dict()
        amount = float(data.get("emissionKgco2", 0) or 0)
        recorded = str(data.get("recordedDate", ""))
        record_count += 1
        platform_emission += amount
        if recorded.startswith(this_month_prefix):
            month_emission += amount
        category = data.get("category", "other")
        category_totals[category] = category_totals.get(category, 0.0) + amount

    # --- donations ---
    donation_count = 0
    donated_paise = 0
    for doc in db.collection("donations").stream():
        data = doc.to_dict()
        donation_count += 1
        amount = data.get("amount")
        if isinstance(amount, (int, float)):
            donated_paise += int(amount)

    # --- feedback ---
    ratings = []
    feedback_count = 0
    for doc in db.collection("feedback").stream():
        data = doc.to_dict()
        feedback_count += 1
        if data.get("rating"):
            ratings.append(data["rating"])

    lines = [
        "",
        "=== PLATFORM DATA (this user is an ADMIN) ===",
        "You may answer questions about these platform-wide figures.",
        "",
        f"Users: {len(users)} total, {new_this_month} joined this month "
        f"({today.strftime('%B %Y')}).",
        f"Carbon records: {record_count} total.",
        f"Emissions logged: {round(platform_emission, 2)} kg CO2 all time, "
        f"{round(month_emission, 2)} kg this month.",
    ]

    if category_totals:
        ranked = sorted(category_totals.items(), key=lambda kv: kv[1], reverse=True)
        lines.append(
            "Emissions by category: "
            + ", ".join(f"{name} {round(value, 1)} kg" for name, value in ranked)
        )

    lines.append(
        f"Donations: {donation_count} verified, Rs {donated_paise / 100:,.2f} raised in total."
    )

    average_rating = round(sum(ratings) / len(ratings), 1) if ratings else None
    lines.append(
        f"Feedback: {feedback_count} messages"
        + (f", average rating {average_rating} out of 5." if average_rating else ".")
    )

    if users:
        lines.append("")
        lines.append("Registered users (name, email, region, joined):")
        # Newest first, so "who joined recently" is answerable
        for user in sorted(users, key=lambda u: u["created"], reverse=True):
            lines.append(
                f"  - {user['name'] or 'unnamed'} <{user['email']}>"
                f" {user['region'] or 'region unknown'}"
                f" joined {user['created'][:10] or 'unknown'}"
            )

    return "\n".join(lines)


def _build_user_context(uid):
    """
    Gather the signed-in user's real data into a compact text block.

    This is what makes the assistant's answers specific rather than generic.
    Every number the assistant is allowed to quote comes from here, and it is
    scoped to a single uid - there is no path by which one user's context can
    include another user's records.
    """
    db = get_db()
    today = date.today()

    # --- profile ---
    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    profile = user_doc.to_dict() if user_doc.exists else {}

    # --- this month and last month ---
    previous_year, previous_month = shift_month(today.year, today.month, -1)
    this_start, this_end = month_bounds(today.year, today.month)
    previous_start, previous_end = month_bounds(previous_year, previous_month)

    all_records = fetch_user_records(uid)
    this_month = [r for r in all_records if this_start <= r["recordedDate"] <= this_end]
    last_month = [
        r for r in all_records if previous_start <= r["recordedDate"] <= previous_end
    ]

    this_total = total_emission(this_month)
    last_total = total_emission(last_month)
    year_total = total_emission(
        [r for r in all_records if r["recordedDate"].startswith(str(today.year))]
    )
    breakdown = group_by_category(this_month)

    # --- goals ---
    goal_docs = (
        db.collection(Config.COLLECTION_GOALS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .stream()
    )
    goals = []
    for doc in goal_docs:
        data = doc.to_dict()
        if data.get("status") != "active":
            continue
        baseline = float(data.get("baselineEmission", 0))
        percent = float(data.get("targetReductionPercent", 0))
        goals.append(
            f"  - {data.get('category')}: cut {percent:.0f}% from "
            f"{baseline:.1f} kg (target {baseline * (1 - percent / 100):.1f} kg "
            f"per month) by {data.get('targetDate')}"
        )

    # --- recent activity ---
    recent = [
        f"  - {record['recordedDate']}: {record['subType'].replace('_', ' ')} "
        f"({record['category']}), {record['quantity']:g} {record['unit']} "
        f"= {record['emissionKgco2']:.2f} kg CO2"
        for record in all_records[:8]
    ]

    # --- assemble ---
    active_categories = {c: v for c, v in breakdown.items() if v > 0}
    if active_categories:
        top_category = max(active_categories, key=lambda c: active_categories[c])
        breakdown_lines = "\n".join(
            f"  - {category}: {value:.2f} kg"
            for category, value in sorted(
                active_categories.items(), key=lambda item: item[1], reverse=True
            )
        )
    else:
        top_category = None
        breakdown_lines = "  (nothing logged this month)"

    if last_total > 0:
        change = ((this_total - last_total) / last_total) * 100
        change_line = f"{change:+.1f}% versus last month"
    else:
        change_line = "no previous month to compare against"

    return f"""THIS USER'S ECOTRACK DATA (today is {today.isoformat()})

Profile:
  - Name: {profile.get('name', 'unknown')}
  - Region: {profile.get('region', 'unknown')}

Emissions:
  - This month so far: {this_total:.2f} kg CO2 ({change_line})
  - Last month total: {last_total:.2f} kg CO2
  - This year to date: {year_total:.2f} kg CO2
  - Entries logged all time: {len(all_records)}
  - Largest category this month: {top_category or 'none'}
  - Monthly budget for 1.5 C: {MONTHLY_BUDGET_KG:.0f} kg CO2 per person

This month by category:
{breakdown_lines}

Active goals:
{chr(10).join(goals) if goals else '  (none set)'}

Most recent entries:
{chr(10).join(recent) if recent else '  (none yet)'}"""


# The stable half of the system instruction. Kept separate from the user data
# so it is obvious in the code which half is policy and which half is facts.
#
# This is deliberately a full map of the product, not just the calculation.
# The assistant is the one place a user can ask "how do I..." about ANY part
# of EcoTrack and get a real answer instead of a guess - that only works if it
# actually knows every screen exists, not just the ones with numbers on them.
ASSISTANT_INSTRUCTIONS = """You are the EcoTrack Assistant, built into a carbon footprint tracking web app centred on UN Sustainable Development Goal 13: Climate Action.

HOW THE CORE CALCULATION WORKS
Users log everyday activities across seven categories - transport, electricity, fuel, diet, waste, water and consumption. Each entry is multiplied by a published emission factor to give kilograms of CO2:

    emission (kgCO2) = quantity x emissionFactor

Factors come from DEFRA 2023 (transport), the Central Electricity Authority of India 2023 (grid electricity at 0.710 kg per kWh), IPCC 2006 (fuels), Our World in Data (diet) and IPCC waste guidelines. A personal footprint consistent with 1.5 C of warming is about 2000 kg CO2 a year - roughly 167 kg a month.

EVERY SCREEN IN THE APP, so you can explain any of them
Public pages (no account needed):
  - Home: the landing page - live global emissions counter, the seven categories, how it works
  - About: the mission and the three principles the product is built to
  - Learn: short sourced explainers on where emissions come from
  - Gallery: a photo essay on the systems behind the numbers
  - Estimate: a 30-second, no-login footprint guess from four lifestyle questions - separate from and less precise than real logged data
  - Feedback: anyone can send a message or star rating, read by a real person
  - Donate: forwards money to real climate charities (One Tree Planted, Cool Earth, Clean Air Task Force, Gold Standard); EcoTrack keeps nothing
  - Login: has a "Forgot password?" link that emails a reset link via Firebase - works even if they never come back to ask you
  - Register: a three-step sign-up (details, password, region)
Signed-in pages (what this user, who you are talking to, actually has open):
  - Dashboard: this month/year at a glance, a six-month trend, category breakdown, and plain-English insights
  - Calculator: where every entry is logged - pick a category, enter a quantity, see the live emission preview before saving
  - Goals: per-category reduction targets with a live progress ring. One goal per category at a time; achieved or expired goals move to a "Completed" list
  - Reports: a written summary of any period - Today, This week, This month, This year, or a custom range - with a category breakdown and the biggest single contributors
  - Profile: edit name and region, a Preferences section (light/dark theme, and a reduce-motion toggle that adds calmer animation on top of whatever their operating system already asks for), and - only for an email/password account, not a Google sign-in - a Change password form

YOUR JOB
Answer questions about this specific user's footprint, explain how any part of the app works or where to find something, and suggest concrete reductions grounded in the real factors above.

RULES - these matter more than being helpful
1. Use ONLY the figures in the user data below. Never estimate, extrapolate, or invent a number that is not there. If the data does not answer the question, say exactly that and suggest what they could log to find out.
2. You are read-only. You cannot log entries, create goals, change settings, or reset a password for someone. Tell them which page and button to use instead - e.g. "Forgot password?" on the Login page, or Profile > Change password if they are signed in.
3. Be specific and short. Two or three sentences for a simple question. Quote real numbers from their data, with units.
4. When suggesting a reduction, tie it to a factor: "a bus seat is 0.082 kg per km against 0.141 for a petrol car, so that swap saves about 40%."
5. Never claim a trend from a single data point. If they have logged two entries, say the data is too thin to see a pattern.
6. Plain text only - no markdown headers, no asterisks, no bullet symbols, no bold. This renders in a small chat panel.
7. A question about how to use EcoTrack, what a page does, or where to find something is always in scope, even if it has no numbers in it - only refuse something that has nothing to do with EcoTrack or climate at all (e.g. general trivia, other software, personal advice unrelated to emissions)."""


# Appended to the system instruction ONLY when is_admin() has already returned
# true for this request's verified token - see the call site in /chat. A
# normal user's prompt never contains this text, so there is no answer for a
# non-admin to extract no matter how the question is phrased; the console's
# own structure is simply absent from what the model was ever given.
ADMIN_CONSOLE_GUIDE = """
=== THE ADMIN CONSOLE (this user is an ADMIN, on top of everything above) ===
You may also help this admin navigate /admin, using the platform data block below. The console has seven tabs:
  - Overview: platform-wide stat cards (total users, records, emissions, goal success rate) and the category split across every user combined
  - Insights: month-by-month sign-up growth, which regions users are in, and the five most active users by entries logged
  - Activity: one combined timeline of every sign-up, donation and feedback message across the whole platform, newest first
  - Users: a searchable table of every account; clicking a row opens a full drill-down of that person's own records, goals, reports, donations and feedback
  - Feedback: every message sent through the public Feedback page, with its star rating if one was given
  - Donations: every verified Razorpay donation, with the running total raised
  - System: a live health check of Firestore, Razorpay, the AI assistant itself, the admin access configuration, and the API's own environment. You do not have a live reading of it - if asked whether the system is healthy right now, say to check that tab and press its Refresh button, rather than guessing
Deleting a user, a feedback message, or a donation record is only possible from inside the console itself, by a person clicking delete and confirming - you cannot perform or trigger any of those actions."""


def _extract_reply(response):
    """
    Pull the text out of a Gemini response, or return None if it was blocked.

    Gemini returns HTTP 200 even when a safety filter stops the answer, so
    finish_reason has to be checked before reading .text - which is None in
    that case and would otherwise look like an empty reply.
    """
    candidates = response.candidates or []
    if candidates:
        finish_reason = getattr(candidates[0], "finish_reason", None)
        # finish_reason is an enum; .name gives the string form
        reason_name = getattr(finish_reason, "name", str(finish_reason or ""))
        if reason_name in BLOCKED_FINISH_REASONS:
            return None

    text = response.text
    return text.strip() if text else None


def _usage_of(response):
    """Token counts, returned so cost and quota use are visible rather than hidden."""
    usage = response.usage_metadata
    if not usage:
        return None
    return {
        "inputTokens": usage.prompt_token_count,
        "outputTokens": usage.candidates_token_count,
        "totalTokens": usage.total_token_count,
    }


# ---------------------------------------------------------------------------
# POST /api/assistant/chat
# ---------------------------------------------------------------------------

@assistant_bp.route("/chat", methods=["POST"])
@require_auth
def chat():
    """
    Ask the assistant a question.

    Body: {"message": "why did my transport go up?",
           "history": [{"role": "user", "content": "..."},
                       {"role": "assistant", "content": "..."}]}
    """
    client, error = _get_client()
    if error:
        return error

    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()

    if not message:
        return api_error("Please type a question.", 400, code="empty_message")

    if len(message) > MAX_MESSAGE_LENGTH:
        return api_error(
            f"Message too long. Please keep it under {MAX_MESSAGE_LENGTH} characters.",
            400,
            code="message_too_long",
        )

    # --- rebuild the conversation ---
    # The API is stateless: it has no memory of previous requests, so the whole
    # conversation is re-sent every time. The frontend holds it and passes it back.
    history = body.get("history") or []
    contents = []

    if isinstance(history, list):
        for entry in history[-MAX_HISTORY_MESSAGES:]:
            if not isinstance(entry, dict):
                continue
            role = entry.get("role")
            text = str(entry.get("content", "")).strip()
            if role not in ("user", "assistant") or not text:
                continue

            # Gemini calls the AI turn "model", not "assistant". The frontend
            # speaks the common chat vocabulary, so the translation happens here.
            contents.append(
                genai_types.Content(
                    role="model" if role == "assistant" else "user",
                    parts=[genai_types.Part.from_text(text=text[:MAX_MESSAGE_LENGTH])],
                )
            )

    # The conversation has to begin with a user turn
    while contents and contents[0].role != "user":
        contents.pop(0)

    contents.append(
        genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=message)])
    )

    # Checked once and reused - it is the same verified-token check either way,
    # and calling it twice would mean two lookups for one request.
    user_is_admin = is_admin(g.uid, g.email)

    # --- call Gemini ---
    try:
        response = client.models.generate_content(
            model=Config.ASSISTANT_MODEL,
            contents=contents,
            config=genai_types.GenerateContentConfig(
                # Fixed instructions, then this user's live data, then - for
                # admins only - the platform data block AND the console
                # navigation guide. The admin check runs on the server against
                # the verified token, so a normal user cannot talk their way
                # into it: the text simply is not in the prompt to extract.
                system_instruction=[
                    block
                    for block in [
                        ASSISTANT_INSTRUCTIONS,
                        _build_user_context(g.uid),
                        _build_admin_context() if user_is_admin else None,
                        ADMIN_CONSOLE_GUIDE if user_is_admin else None,
                    ]
                    if block
                ],
                max_output_tokens=MAX_REPLY_TOKENS,
                # Low temperature because this is grounded question answering
                # over the user's own figures - creativity is not wanted here
                temperature=0.3,
            ),
        )
    except genai_errors.ClientError as client_error:
        # 4xx - almost always a bad key, an unknown model name, or quota
        status = getattr(client_error, "code", 400)
        if status == 429:
            return api_error(
                "The assistant has hit its free-tier rate limit. "
                "Wait a minute and try again.",
                429,
                code="assistant_rate_limited",
            )
        return api_error(
            "The assistant rejected the request. Check GEMINI_API_KEY and "
            "ASSISTANT_MODEL in backend/.env.",
            503,
            code="assistant_config_error",
        )
    except genai_errors.ServerError:
        return api_error(
            "The assistant service is having problems. Please try again shortly.",
            502,
            code="assistant_error",
        )
    except genai_errors.APIError:
        return api_error(
            "Could not reach the assistant service.", 503, code="assistant_unreachable"
        )

    reply = _extract_reply(response)

    if reply is None:
        return api_success({
            "reply": "I am not able to answer that one. Try asking about your "
                     "emissions, your goals, or how a part of EcoTrack works.",
            "refused": True,
        })

    return api_success({
        "reply": reply,
        "refused": False,
        "usage": _usage_of(response),
        "model": Config.ASSISTANT_MODEL,
    })


# ---------------------------------------------------------------------------
# POST /api/assistant/summary
# ---------------------------------------------------------------------------

@assistant_bp.route("/summary", methods=["POST"])
@require_auth
def summary():
    """
    Write a personalised summary of a period.

    This is the AI counterpart to the rule-based summary already on the Reports
    page. The rule-based one always says the same thing about the same numbers;
    this one writes prose about what actually stands out.

    Body: {"periodStart": "2026-07-01", "periodEnd": "2026-07-31"}
    """
    client, error = _get_client()
    if error:
        return error

    body = request.get_json(silent=True) or {}

    period_start, start_error = parse_date_string(body.get("periodStart"), "periodStart")
    if start_error:
        return api_error(start_error, 400, code="invalid_period_start")

    period_end, end_error = parse_date_string(body.get("periodEnd"), "periodEnd")
    if end_error:
        return api_error(end_error, 400, code="invalid_period_end")

    if period_end < period_start:
        return api_error(
            "periodEnd cannot be before periodStart.", 400, code="invalid_period"
        )

    records = fetch_user_records(
        g.uid, period_start.isoformat(), period_end.isoformat()
    )

    if not records:
        return api_success({
            "summary": "There is nothing logged in this period, so there is "
                       "nothing to summarise yet.",
            "recordCount": 0,
        })

    days = (period_end - period_start).days + 1
    period_total = total_emission(records)
    breakdown = group_by_category(records)

    # Group by activity so the summary can name the worst specific habit
    by_activity = {}
    for record in records:
        key = f"{record['category']}/{record['subType']}"
        entry = by_activity.setdefault(key, {"emission": 0.0, "count": 0})
        entry["emission"] += record["emissionKgco2"]
        entry["count"] += 1

    top_activities = sorted(
        by_activity.items(), key=lambda item: item[1]["emission"], reverse=True
    )[:5]

    facts = f"""PERIOD: {period_start.isoformat()} to {period_end.isoformat()} ({days} days)
Total: {period_total:.2f} kg CO2
Daily average: {period_total / days:.2f} kg CO2
Entries: {len(records)}
Personal budget for 1.5 C: {MONTHLY_BUDGET_KG / 30:.2f} kg CO2 per day

By category:
{chr(10).join(f'  - {c}: {v:.2f} kg' for c, v in sorted(breakdown.items(), key=lambda i: i[1], reverse=True) if v > 0)}

Biggest contributors:
{chr(10).join(f"  - {k.split('/')[1].replace('_', ' ')} ({k.split('/')[0]}): {v['emission']:.2f} kg across {v['count']} entries" for k, v in top_activities)}"""

    try:
        response = client.models.generate_content(
            model=Config.ASSISTANT_MODEL,
            contents=[
                genai_types.Content(
                    role="user", parts=[genai_types.Part.from_text(text=facts)]
                )
            ],
            config=genai_types.GenerateContentConfig(
                system_instruction=[
                    ASSISTANT_INSTRUCTIONS,
                    "For this request, write a report summary in three short "
                    "paragraphs: what the period looked like, what stood out, "
                    "and the single change that would help most. Plain prose, "
                    "no headings or bullets. Use only the figures given.",
                ],
                max_output_tokens=MAX_SUMMARY_TOKENS,
                temperature=0.4,
            ),
        )
    except genai_errors.ClientError as client_error:
        status = getattr(client_error, "code", 400)
        if status == 429:
            return api_error(
                "The assistant has hit its free-tier rate limit. "
                "Wait a minute and try again.",
                429,
                code="assistant_rate_limited",
            )
        return api_error(
            "The assistant rejected the request. Check your backend/.env settings.",
            503,
            code="assistant_config_error",
        )
    except genai_errors.APIError:
        return api_error(
            "Could not reach the assistant service.", 503, code="assistant_unreachable"
        )

    text = _extract_reply(response)

    if text is None:
        return api_error(
            "The assistant could not write this summary.", 502, code="assistant_refused"
        )

    return api_success({
        "summary": text,
        "recordCount": len(records),
        "periodStart": period_start.isoformat(),
        "periodEnd": period_end.isoformat(),
        "usage": _usage_of(response),
        "model": Config.ASSISTANT_MODEL,
    })


# ---------------------------------------------------------------------------
# GET /api/assistant/status
# ---------------------------------------------------------------------------

@assistant_bp.route("/status", methods=["GET"])
@require_auth
def status():
    """
    Tell the frontend whether the assistant is usable.

    The React app calls this once so it can hide the assistant button entirely
    rather than showing a feature that errors the moment it is clicked.
    """
    return api_success({
        "available": bool(GENAI_AVAILABLE and Config.GEMINI_API_KEY),
        "sdkInstalled": GENAI_AVAILABLE,
        "keyConfigured": bool(Config.GEMINI_API_KEY),
        "model": Config.ASSISTANT_MODEL,
    })
