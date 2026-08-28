# EcoTrack/backend/routes/assistant.py
"""
The EcoTrack Assistant - an AI guide and report writer, powered by Groq.

WHY GROQ (moved from Google Gemini in August 2026)
This app ran on Gemini's free tier first - genuinely free, no card needed,
which is what made the feature possible on a student budget in the first
place. It moved after a real, CONFIRMED Gemini outage: a direct request to
generativelanguage.googleapis.com, bypassing this backend entirely, took
194.8 seconds to succeed, and Vercel's own function logs showed Google's own
servers returning 503/504 - a genuine upstream outage, not a bug anywhere in
this code. Groq is not a model, it is an inference provider running
open-weight models on hardware built specifically for low latency, which is
also why the assistant is now noticeably faster than it ever was on Gemini.
See config.py's GROQ_API_KEY comment for the model choices.

HOW THIS IS WIRED, AND WHY IT MATTERS FOR SECURITY
---------------------------------------------------
The React app NEVER talks to Groq directly. Every request goes:

    browser  ->  Flask (verifies the Firebase token)
             ->  Groq  (using the server's secret API key)
             ->  Flask
             ->  browser

If the API key were in the frontend, anyone could open DevTools and copy it.
Keeping it server-side is the whole reason this file exists rather than the
React app calling Groq itself.

GROUNDING - the reason the assistant does not invent numbers
------------------------------------------------------------
Before each request, Flask reads the signed-in user's real Firestore data and
puts it in the system instruction. The assistant is then told, explicitly, to
use only those figures and to say so when it does not know something. It reads
that snapshot and nothing else: it cannot see other users' data, and it has no
ability to write, edit, or delete anything at all.

Mounted at /api/assistant
"""

import json
import time
from datetime import date, timedelta

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from insights_engine import generate_swaps
from routes import (
    api_error,
    api_success,
    check_rate_limit,
    client_ip,
    fetch_user_records,
    group_by_category,
    is_admin,
    month_bounds,
    parse_date_string,
    require_auth,
    shift_month,
    total_emission,
    verify_recaptcha,
)
from routes.goals import MIN_REDUCTION_PERCENT
from routes.insights import _load_factor_lookup, _user_region

# Imported defensively so a missing dependency degrades to "assistant
# unavailable" instead of stopping the whole server from booting.
try:
    from groq import Groq
    from groq import (
        APIConnectionError as GroqAPIConnectionError,
        APIError as GroqAPIError,
        APIStatusError as GroqAPIStatusError,
        APITimeoutError as GroqAPITimeoutError,
        InternalServerError as GroqInternalServerError,
        RateLimitError as GroqRateLimitError,
    )

    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

assistant_bp = Blueprint("assistant", __name__, url_prefix="/api/assistant")

# Room enough for a real code answer or a worked explanation, not just a
# one-liner - this is a genuine general-purpose assistant now (see
# ASSISTANT_INSTRUCTIONS), not only a short-answer helper panel, though it
# still is not asked to write essays for their own sake.
MAX_REPLY_TOKENS = 2048
MAX_SUMMARY_TOKENS = 1400

# How much conversation to send back. The API is stateless, so every past turn
# is re-sent on each request - an uncapped history means a request that grows
# with the length of the chat.
MAX_HISTORY_MESSAGES = 10

# openai/gpt-oss-120b's own reasoning-depth control (see config.py's
# ASSISTANT_MODEL comment) - "low" is the fastest of the three supported
# levels. This is grounded QA over figures already handed to the model in
# the prompt, not a task that benefits from deep reasoning, so the fastest
# setting is also the right one, not just the cheapest.
ASSISTANT_REASONING_EFFORT = "low"

MAX_MESSAGE_LENGTH = 2000

# The personal carbon budget consistent with 1.5 C of warming
MONTHLY_BUDGET_KG = 2000 / 12

# The OpenAI-compatible finish_reason string that means "a content filter
# stopped this response" - the Groq equivalent of Gemini's SAFETY /
# PROHIBITED_CONTENT / BLOCKLIST family. message.content is empty in this
# case and must be checked before reading it.
BLOCKED_FINISH_REASON = "content_filter"


def _get_client():
    """
    Build the Groq client, or return an error response if it cannot be.

    Returns (client, None) on success, or (None, error_response).
    """
    if not GROQ_AVAILABLE:
        return None, api_error(
            "The assistant is not installed on this server. "
            "Run: pip install -r requirements.txt",
            503,
            code="assistant_unavailable",
        )

    if not Config.GROQ_API_KEY:
        return None, api_error(
            "The assistant is not configured. Add GROQ_API_KEY to backend/.env.",
            503,
            code="assistant_not_configured",
        )

    # Passing the key explicitly rather than relying on the ambient
    # environment keeps this behaving the same way locally and on Vercel.
    # timeout matches GROQ_CALL_TIMEOUT_SECONDS below - set once here rather
    # than per-call, since every route in this file uses the same client.
    return Groq(api_key=Config.GROQ_API_KEY, timeout=GROQ_CALL_TIMEOUT_SECONDS), None


# One retry, after a short pause, for a genuine server-side or timeout
# failure only - not for a 4xx (a bad key or bad request fails identically
# on a second try). Groq is dramatically faster than Gemini ever was in
# practice, but the same "an upstream provider can still have a bad moment"
# reasoning that justified this retry originally still applies to any
# hosted API.
GROQ_RETRY_DELAY_SECONDS = 1.5

# Generous for a provider whose whole premise is sub-second responses - this
# is a ceiling for a genuinely bad moment, not the expected latency. Still
# comfortably inside Vercel's 60s function budget even after one retry.
GROQ_CALL_TIMEOUT_SECONDS = 18


def _call_groq(client, **completion_kwargs):
    """
    client.chat.completions.create(...), transparently retried once on a
    transient server error or a timeout - the direct Groq equivalent of
    this file's old _call_gemini, kept as the one function every route
    calls through rather than reaching the SDK directly (see this file's
    own module docstring on why that matters for ever swapping providers
    again).
    """
    try:
        return client.chat.completions.create(**completion_kwargs)
    except (GroqInternalServerError, GroqAPITimeoutError):
        time.sleep(GROQ_RETRY_DELAY_SECONDS)
        return client.chat.completions.create(**completion_kwargs)


def _history_to_messages(history):
    """
    Turn the frontend's [{"role": "user"|"assistant", "content": "..."}]
    history into the same shape Groq's chat.completions API already
    expects - unlike Gemini, which called the AI turn "model" and needed a
    translation step, the OpenAI-compatible wire format uses "assistant"
    natively, so this is a straight validate-and-trim rather than a role
    rename.
    """
    messages = []
    if not isinstance(history, list):
        return messages

    for entry in history[-MAX_HISTORY_MESSAGES:]:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        text = str(entry.get("content", "")).strip()
        if role not in ("user", "assistant") or not text:
            continue
        messages.append({"role": role, "content": text[:MAX_MESSAGE_LENGTH]})

    # The conversation has to begin with a user turn
    while messages and messages[0]["role"] != "user":
        messages.pop(0)

    return messages


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


# The stable half of the system instruction, shared by both the signed-in
# assistant and the signed-out one below - identity, the calculation, and the
# full map of the product. Kept separate from the per-audience JOB/RULES text
# and from the user data so it is obvious in the code which part is which,
# and so the two assistants cannot describe the app differently just because
# one of them got edited and the other did not.
#
# This is deliberately a full map of the product, not just the calculation.
# The assistant is the one place a person can ask "how do I..." about ANY part
# of EcoTrack and get a real answer instead of a guess - that only works if it
# actually knows every screen exists, not just the ones with numbers on them.
ASSISTANT_APP_KNOWLEDGE = """You are the EcoTrack Assistant, built into a carbon footprint tracking web app centred on UN Sustainable Development Goal 13: Climate Action.

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
Signed-in pages (need an account):
  - Dashboard: this month/year at a glance, a six-month trend, category breakdown, and plain-English insights
  - Calculator: where every entry is logged - pick a category, enter a quantity, see the live emission preview before saving
  - Goals: per-category reduction targets with a live progress ring. One goal per category at a time; achieved or expired goals move to a "Completed" list
  - Reports: a written summary of any period - Today, This week, This month, This year, or a custom range - with a category breakdown and the biggest single contributors
  - Profile: edit name and region, a Preferences section (light/dark theme, and a reduce-motion toggle that adds calmer animation on top of whatever their operating system already asks for), a Two-step verification toggle, and - only for an email/password account, not a Google sign-in - a Change password form"""


ASSISTANT_INSTRUCTIONS = (
    ASSISTANT_APP_KNOWLEDGE
    + """

YOUR JOB
Two things, and neither is secondary:
  1. Answer questions about this specific user's footprint, explain how any part of the app works or where to find something, and suggest concrete reductions grounded in the real factors above.
  2. Beyond that, be a genuinely capable general-purpose assistant. A person chatting with you does not have to be asking about EcoTrack at all - code, maths, writing, explaining a concept, translating something, planning something - answer it properly, the way a competent assistant would anywhere else. Being embedded in a carbon-tracking app is where you live, not the limit of what you are willing to help with.

RULES - these matter more than being agreeable
1. Two different kinds of claim need two different standards of evidence:
   - Anything about THIS USER'S OWN ECOTRACK DATA - their emissions, their goals, their history - must come ONLY from the figures in the data block below. Never estimate, extrapolate, or invent a number that is not there. If it does not answer the question, say exactly that and suggest what they could log to find out.
   - Everything else - general knowledge, how something works, code, world facts, unrelated questions - answer from what you actually know, the same as you would with no app data in front of you at all. Do not refuse or deflect a question just because it has nothing to do with EcoTrack.
2. You are read-only inside EcoTrack itself. You cannot log entries, create goals, change settings, or reset a password for someone. Tell them which page and button to use instead - e.g. "Forgot password?" on the Login page, or Profile > Change password if they are signed in. This has no bearing on questions that are not about EcoTrack at all.
3. Match length and depth to the question. A quick fact gets a sentence or two. Something that genuinely needs room - working code, a multi-step explanation, a structured comparison - gets the room it needs; do not truncate a real answer just to stay short for its own sake.
4. When discussing their own footprint, quote real numbers with units, and tie any suggested reduction to a factor: "a bus seat is 0.082 kg per km against 0.141 for a petrol car, so that swap saves about 40%."
5. Never claim a trend from a single data point. If they have logged two entries, say the data is too thin to see a pattern.
6. Format for what the content actually is - this renders through a real markdown reader, not a plain-text box, so use it properly: fenced code blocks with a language tag for any code, numbered or bulleted lists for steps or options, a table when comparing structured rows of data, **bold** for the one or two things that matter most, plain prose everywhere else. When you point at a specific EcoTrack page, write it as a real markdown link using its path, e.g. [Calculator](/calculator) or [Profile](/profile) - it renders as a clickable in-app link, not just a name to go look for. Do not decorate a two-sentence answer with headers and bullets it does not need.
7. Refuse only what an honest assistant should refuse anywhere - content designed to harm someone, help commit a crime, or similar. Topic alone is never a reason to refuse."""
)


# The signed-out counterpart, used by /public-chat below. Same app knowledge
# and the same "answer anything, refuse only genuine harm" posture as the
# signed-in assistant - the difference is entirely about what data exists to
# ground an answer in: there is no signed-in user here, so there is no
# personal footprint to quote and nothing for rule 1's stricter half to apply
# to. Kept as a fully separate constant rather than a runtime if-branch on
# ASSISTANT_INSTRUCTIONS, so a normal user's prompt can never contain
# "you are talking to a visitor with no account" phrasing and vice versa.
PUBLIC_ASSISTANT_INSTRUCTIONS = (
    ASSISTANT_APP_KNOWLEDGE
    + """

YOUR JOB
You are talking to someone who has NOT signed in - there is no account, no logged data, nothing personal to read. Two things, and neither is secondary:
  1. Answer questions about EcoTrack itself - what it does, how the calculation works, where to find something, whether it costs anything (it does not) - and point them to creating a free account when that is genuinely what they need next (to log real activities, not just estimate).
  2. Beyond that, be a genuinely capable general-purpose assistant, the same as any other AI assistant would be. A visitor does not have to be asking about EcoTrack at all - code, maths, writing, explaining a concept, translating something, planning something - answer it properly.

RULES - these matter more than being agreeable
1. Never claim to know anything about "this person's" emissions, goals, or history - there is none to know. If asked about "my footprint", explain that nothing is logged yet because they are not signed in, and point to Register (real tracking) or Estimate (a rough 30-second guess, no account needed).
2. You cannot create an account, log anything, or perform any action inside EcoTrack on someone's behalf - tell them which page and button to use instead.
3. Match length and depth to the question, the same as any competent assistant - a quick fact gets a sentence or two, something that genuinely needs room gets the room it needs.
4. Format for what the content actually is - this renders through a real markdown reader, not a plain-text box: fenced code blocks with a language tag for code, numbered or bulleted lists for steps or options, a table for structured comparisons, **bold** for the one or two things that matter most, plain prose everywhere else. When you point at a specific EcoTrack page, write it as a real markdown link using its path, e.g. [Register](/register) or [Estimate](/estimate) - it renders as a clickable in-app link, not just a name to go look for.
5. Refuse only what an honest assistant should refuse anywhere - content designed to harm someone, help commit a crime, or similar. Topic alone is never a reason to refuse."""
)


# Appended to the system instruction ONLY when is_admin() has already returned
# true for this request's verified token - see the call site in /chat. A
# normal user's prompt never contains this text, so there is no answer for a
# non-admin to extract no matter how the question is phrased; the console's
# own structure is simply absent from what the model was ever given.
ADMIN_CONSOLE_GUIDE = """
=== THE ADMIN CONSOLE (this user is an ADMIN, on top of everything above) ===
You may also help this admin navigate /admin, using the platform data block below. The console has ten tabs:
  - Overview: platform-wide stat cards (total users, records, emissions, goal success rate) and the category split across every user combined
  - Insights: month-by-month sign-up growth, which regions users are in, and the five most active users by entries logged
  - Activity: one combined timeline of every sign-up, donation and feedback message across the whole platform, newest first
  - Users: a searchable table of every account; clicking a row opens a full drill-down of that person's own records, goals, reports, donations and feedback
  - Feedback: every message sent through the public Feedback page, with its star rating if one was given
  - Donations: every verified Razorpay donation, with the running total raised
  - System: a live health check of Firestore, Razorpay, the AI assistant itself, the admin access configuration, and the API's own environment. You do not have a live reading of it - if asked whether the system is healthy right now, say to check that tab and press its Refresh button, rather than guessing
  - Research: adoption-rate figures for AI-suggested swaps and other recommendations
  - Factors: create, edit or delete the published emission factors every calculation in the app is built on
  - API: reference documentation for the two public, unauthenticated GET endpoints (aggregate impact figures and the opt-in leaderboard) other tools or research can pull from
Deleting a user, a feedback message, or a donation record is only possible from inside the console itself, by a person clicking delete and confirming - you cannot perform or trigger any of those actions."""


def _extract_reply(response):
    """
    Pull the text out of a Groq chat completion, or return None if it was
    blocked by a content filter.

    A response can also stop mid-sentence if it hits the output token cap
    (finish_reason == "length") - proven reachable in testing on the
    original Gemini integration when thinking/reasoning tokens ate the
    whole budget before any visible text, which is exactly why
    ASSISTANT_REASONING_EFFORT above is set to the fastest, lowest-token
    setting rather than left at the model default. Returning a truncated
    answer with no indication it was cut off would be worse than the
    honest, if less complete, alternative - someone reading a chat panel
    has no way to tell a real full stop from a chopped-off one.
    """
    choice = response.choices[0] if response.choices else None
    if choice is None:
        return None

    if choice.finish_reason == BLOCKED_FINISH_REASON:
        return None

    text = choice.message.content
    if not text:
        return None
    text = text.strip()

    if choice.finish_reason == "length":
        text += " [Reply cut short - try asking again, or split it into a shorter question.]"

    return text


def _usage_of(response):
    """Token counts, returned so cost and quota use are visible rather than hidden."""
    usage = response.usage
    if not usage:
        return None
    return {
        "inputTokens": usage.prompt_tokens,
        "outputTokens": usage.completion_tokens,
        "totalTokens": usage.total_tokens,
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

    # Checked once and reused - it is the same verified-token check either way,
    # and calling it twice would mean two lookups for one request.
    user_is_admin = is_admin(g.uid, g.email)

    system_text = "\n\n".join(
        block
        for block in [
            ASSISTANT_INSTRUCTIONS,
            _build_user_context(g.uid),
            _build_admin_context() if user_is_admin else None,
            ADMIN_CONSOLE_GUIDE if user_is_admin else None,
        ]
        if block
    )

    # The API is stateless: it has no memory of previous requests, so the
    # whole conversation is re-sent every time. The frontend holds it and
    # passes it back.
    messages = [{"role": "system", "content": system_text}]
    messages.extend(_history_to_messages(body.get("history")))
    messages.append({"role": "user", "content": message})

    try:
        response = _call_groq(
            client,
            model=Config.ASSISTANT_MODEL,
            messages=messages,
            max_completion_tokens=MAX_REPLY_TOKENS,
            # Low temperature because this is grounded question answering
            # over the user's own figures - creativity is not wanted here
            temperature=0.3,
            reasoning_effort=ASSISTANT_REASONING_EFFORT,
        )
    except GroqRateLimitError:
        return api_error(
            "The assistant has hit its free-tier rate limit. "
            "Wait a minute and try again.",
            429,
            code="assistant_rate_limited",
        )
    except GroqAPIStatusError:
        # Any other non-2xx from Groq - almost always a bad key, an unknown
        # model name, or a malformed request.
        return api_error(
            "The assistant rejected the request. Check GROQ_API_KEY and "
            "ASSISTANT_MODEL in backend/.env.",
            503,
            code="assistant_config_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return api_error(
            "The assistant service is having problems. Please try again shortly.",
            502,
            code="assistant_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
        return api_error(
            "Could not reach the assistant service.", 503, code="assistant_unreachable"
        )

    reply = _extract_reply(response)

    if reply is None:
        # By this point topic scope is not why anything gets refused (see
        # ASSISTANT_INSTRUCTIONS) - a None reply here means a content filter
        # stopped it (BLOCKED_FINISH_REASON), not that the question was out
        # of bounds for this app.
        return api_success({
            "reply": "I can't help with that one. Try rephrasing it, or ask "
                     "something else.",
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
        response = _call_groq(
            client,
            model=Config.ASSISTANT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": ASSISTANT_INSTRUCTIONS
                    + "\n\nFor this request, write a report summary in three short "
                    "paragraphs: what the period looked like, what stood out, "
                    "and the single change that would help most. Plain prose, "
                    "no headings or bullets. Use only the figures given.",
                },
                {"role": "user", "content": facts},
            ],
            max_completion_tokens=MAX_SUMMARY_TOKENS,
            temperature=0.4,
            reasoning_effort=ASSISTANT_REASONING_EFFORT,
        )
    except GroqRateLimitError:
        return api_error(
            "The assistant has hit its free-tier rate limit. "
            "Wait a minute and try again.",
            429,
            code="assistant_rate_limited",
        )
    except GroqAPIStatusError:
        return api_error(
            "The assistant rejected the request. Check your backend/.env settings.",
            503,
            code="assistant_config_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return api_error(
            "The assistant service is having problems. Please try again shortly.",
            502,
            code="assistant_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
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
# POST /api/assistant/plan
# ---------------------------------------------------------------------------

# A genuinely ambitious near-term target, but not "stop doing this category
# entirely" - kept well under goals.py's own MAX_REDUCTION_PERCENT (100).
PLAN_REDUCTION_CAP_PERCENT = 50

# Goals are evaluated against a calendar month's total (see goals.py's
# _current_month_total_for_category), so a deadline needs real runway
# against that, not a literal seven days.
PLAN_TARGET_DAYS_AHEAD = 30

PLAN_MAX_OUTPUT_TOKENS = 300


def _active_goal_categories(uid):
    """Categories the user already has an active goal in - see create_goal's
    own one-active-goal-per-category rule in routes/goals.py. A plan that
    suggested one of these would 409 the instant "accept" tried to post it."""
    db = get_db()
    docs = (
        db.collection(Config.COLLECTION_GOALS)
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .where(filter=gcloud_firestore.FieldFilter("status", "==", "active"))
        .stream()
    )
    return {doc.to_dict().get("category") for doc in docs}


def _reduction_percent_for(achievable_saving_kg, baseline_kg):
    """
    Turn a real achievable saving into a target percent, clamped between
    MIN_REDUCTION_PERCENT (goals.py's own floor - a goal must aim for a real
    reduction) and PLAN_REDUCTION_CAP_PERCENT (this feature's own ceiling -
    "genuinely ambitious", not "stop doing this category entirely"). The
    only pure piece of _plan_candidates' maths, pulled out so it is testable
    without touching Firestore - see test_assistant_plan.py.
    """
    if baseline_kg <= 0:
        return MIN_REDUCTION_PERCENT
    raw_percent = (achievable_saving_kg / baseline_kg) * 100
    return round(min(PLAN_REDUCTION_CAP_PERCENT, max(MIN_REDUCTION_PERCENT, raw_percent)))


def _plan_candidates(uid):
    """
    Real, backend-computed candidate categories for a reduction plan.

    Every figure here - this month's baseline, the achievable saving, the
    resulting target - comes from real logged records and the same
    swap-savings maths insights_engine.generate_swaps already uses for GET
    /api/insights/swaps. The model never sees this function; it only sees
    the numbers it already computed, so there is no path by which the model
    can invent a figure that ends up in a goal.
    """
    today = date.today()
    start, end = month_bounds(today.year, today.month)
    records = fetch_user_records(uid, start_date=start, end_date=end)
    baselines = group_by_category(records)

    factor_lookup = _load_factor_lookup(_user_region(uid))
    swap_list = generate_swaps(records, factor_lookup, today.year, today.month)
    savings_by_category = {}
    for swap in swap_list:
        savings_by_category[swap["category"]] = (
            savings_by_category.get(swap["category"], 0.0) + swap["savingKg"]
        )

    active_categories = _active_goal_categories(uid)

    candidates = []
    for category, baseline in baselines.items():
        if baseline <= 0 or category in active_categories:
            continue
        saving = savings_by_category.get(category, 0.0)
        if saving <= 0:
            continue
        reduction_percent = _reduction_percent_for(saving, baseline)
        target_emission = round(baseline * (1 - reduction_percent / 100), 2)
        candidates.append({
            "category": category,
            "baselineEmission": round(baseline, 2),
            "achievableSavingKg": round(saving, 2),
            "targetReductionPercent": reduction_percent,
            "targetEmission": target_emission,
        })

    # Biggest real opportunity first - both for the no-response fallback pick
    # below and so the strongest candidates lead the facts block the model sees.
    candidates.sort(key=lambda item: item["achievableSavingKg"], reverse=True)
    return candidates


@assistant_bp.route("/plan", methods=["POST"])
@require_auth
def plan():
    """
    Propose ONE near-term reduction goal, grounded entirely in real data.

    Every number in the response - baseline, target percent, target
    emission, target date - is computed server-side in _plan_candidates
    above, never by the model. The model's only job (via a strict JSON
    schema, not free text) is to pick which of the real candidates is worth
    focusing on and write a short, human rationale.

    The response is shaped to map directly onto POST /api/goals
    ({category, baselineEmission, targetReductionPercent, targetDate}), so
    "accept this plan" on the frontend is one real goal-creation call, not
    a second, parallel system.
    """
    client, error = _get_client()
    if error:
        return error

    candidates = _plan_candidates(g.uid)
    if not candidates:
        return api_success({
            "available": False,
            "reason": "Not enough logged activity with a real reduction opportunity yet. "
                      "Keep logging, or check Insights for swap ideas.",
        })

    target_date = (date.today() + timedelta(days=PLAN_TARGET_DAYS_AHEAD)).isoformat()

    facts_lines = [f"Today is {date.today().isoformat()}. Candidate categories, ranked by real achievable saving:"]
    for candidate in candidates:
        facts_lines.append(
            f"  - {candidate['category']}: {candidate['baselineEmission']:.1f} kg this month so far, "
            f"a real {candidate['achievableSavingKg']:.1f} kg/month achievable via logged swap "
            f"opportunities ({candidate['targetReductionPercent']}% cut -> "
            f"{candidate['targetEmission']:.1f} kg target)."
        )
    facts = "\n".join(facts_lines)

    eligible_categories = [candidate["category"] for candidate in candidates]
    # Strict structured output (Groq's own json_schema mode - see
    # GROQ_REASONING quick reference in this file's imports): every property
    # must be listed as required, and additionalProperties must be false, in
    # exchange for a guarantee the response actually validates against this
    # exact shape rather than needing the try/except fallback below to work
    # as hard as it used to.
    plan_schema = {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": eligible_categories},
            "rationale": {"type": "string"},
        },
        "required": ["category", "rationale"],
        "additionalProperties": False,
    }

    try:
        response = _call_groq(
            client,
            model=Config.ASSISTANT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are choosing ONE category for this user's next reduction goal, "
                        "from the real candidates given. Pick whichever has the best mix of a "
                        "large achievable saving and being realistic to actually change soon. "
                        "Write a short one or two sentence rationale, in second person, that "
                        "names the real saving figure already given for that category. Do not "
                        "invent or restate any number that was not given to you."
                    ),
                },
                {"role": "user", "content": facts},
            ],
            max_completion_tokens=PLAN_MAX_OUTPUT_TOKENS,
            temperature=0.4,
            reasoning_effort=ASSISTANT_REASONING_EFFORT,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "reduction_plan", "strict": True, "schema": plan_schema},
            },
        )
    except GroqRateLimitError:
        return api_error(
            "The assistant has hit its free-tier rate limit. Wait a minute and try again.",
            429,
            code="assistant_rate_limited",
        )
    except GroqAPIStatusError:
        return api_error(
            "The assistant rejected the request. Check your backend/.env settings.",
            503,
            code="assistant_config_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return api_error(
            "The assistant service is having problems. Please try again shortly.",
            502,
            code="assistant_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
        return api_error(
            "Could not reach the assistant service.", 503, code="assistant_unreachable"
        )

    # Any failure to parse a usable choice out of the response - a content
    # filter, malformed JSON, or a category outside the list it was given -
    # falls back to the biggest real opportunity computed above, rather than
    # dead-ending the whole feature over one bad model response.
    chosen = None
    rationale = ""
    try:
        parsed = json.loads(response.choices[0].message.content)
        chosen_category = parsed.get("category")
        rationale = str(parsed.get("rationale", "")).strip()
        chosen = next((c for c in candidates if c["category"] == chosen_category), None)
    except (ValueError, TypeError, AttributeError, IndexError):
        chosen = None

    if chosen is None or not rationale:
        chosen = candidates[0]
        rationale = (
            f"Your {chosen['category']} emissions have the largest real reduction "
            f"opportunity right now, based on the swaps already found for you."
        )

    return api_success({
        "available": True,
        "rationale": rationale,
        "targetDate": target_date,
        "candidateCount": len(candidates),
        **chosen,
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
        "available": bool(GROQ_AVAILABLE and Config.GROQ_API_KEY),
        "sdkInstalled": GROQ_AVAILABLE,
        "keyConfigured": bool(Config.GROQ_API_KEY),
        "model": Config.ASSISTANT_MODEL,
    })


# ---------------------------------------------------------------------------
# PUBLIC / SIGNED-OUT VISITOR CHAT
#
# The "EcoTrack Guide" a signed-out visitor sees (frontend/src/components/
# PublicHelper.jsx) used to be pure keyword matching against a fixed topic
# list - no login, no API key, no per-request cost, nothing to abuse. This is
# what replaced it: a real model, so a visitor can ask literally anything and
# get a real answer, not just whichever of a dozen canned topics happened to
# match their wording.
#
# That capability has a cost this app did not have before: every request here
# has NO Firebase token to key anything on, because the whole point is that
# nobody has signed in yet. IP address is the only identity available, the
# same situation /register and /forgot-password are already in - and the same
# fix applies: a tight rate limit plus, when RECAPTCHA_SECRET_KEY is set, a
# score check. Deliberately tighter than the signed-in assistant's effectively
# unlimited use, because there is no account here to hold accountable and
# every message still costs a real API call against this project's shared
# free-tier quota.
# ---------------------------------------------------------------------------

PUBLIC_MAX_REPLY_TOKENS = 1536


@assistant_bp.route("/public-status", methods=["GET"])
def public_status():
    """The signed-out counterpart to /status - same shape, no token required."""
    return api_success({
        "available": bool(GROQ_AVAILABLE and Config.GROQ_API_KEY),
        "sdkInstalled": GROQ_AVAILABLE,
        "keyConfigured": bool(Config.GROQ_API_KEY),
        "model": Config.ASSISTANT_MODEL,
    })


@assistant_bp.route("/public-chat", methods=["POST"])
def public_chat():
    """
    Ask the signed-out guide a question. No @require_auth - there is no
    account to verify a token against.

    Body: {"message": "...", "history": [...], "recaptchaToken": "..."}
    Same message/history shape as POST /api/assistant/chat.
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

    # Two limits for two different abuse shapes, same reasoning as
    # forgot_password(): one connection hammering this endpoint, or the same
    # message flooding in from a rotating-IP source - checked before anything
    # else runs, so a rate-limited request never reaches Groq at all.
    ip = client_ip()
    if not check_rate_limit("public-assistant-ip", ip, max_attempts=20, window_seconds=3600):
        return api_error(
            "Too many messages from this connection. Please wait a while and try again.",
            429,
            code="rate_limited",
        )

    recaptcha_ok, _reason = verify_recaptcha(body.get("recaptchaToken"), "public_assistant")
    if not recaptcha_ok:
        return api_error(
            "Could not verify you're not a bot. Please refresh the page and try again.",
            403,
            code="recaptcha_failed",
        )

    # No user/admin data blocks - there is nothing signed in to read.
    # PUBLIC_ASSISTANT_INSTRUCTIONS is a complete, separate system
    # instruction, not this one with something appended.
    messages = [{"role": "system", "content": PUBLIC_ASSISTANT_INSTRUCTIONS}]
    messages.extend(_history_to_messages(body.get("history")))
    messages.append({"role": "user", "content": message})

    try:
        response = _call_groq(
            client,
            model=Config.ASSISTANT_MODEL,
            messages=messages,
            max_completion_tokens=PUBLIC_MAX_REPLY_TOKENS,
            temperature=0.3,
            reasoning_effort=ASSISTANT_REASONING_EFFORT,
        )
    except GroqRateLimitError:
        return api_error(
            "The assistant has hit its free-tier rate limit. "
            "Wait a minute and try again.",
            429,
            code="assistant_rate_limited",
        )
    except GroqAPIStatusError:
        return api_error(
            "The assistant rejected the request. Please try again.",
            503,
            code="assistant_config_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return api_error(
            "The assistant service is having problems. Please try again shortly.",
            502,
            code="assistant_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
        return api_error(
            "Could not reach the assistant service.", 503, code="assistant_unreachable"
        )

    reply = _extract_reply(response)

    if reply is None:
        return api_success({
            "reply": "I can't help with that one. Try rephrasing it, or ask "
                     "something else.",
            "refused": True,
        })

    return api_success({
        "reply": reply,
        "refused": False,
        "usage": _usage_of(response),
        "model": Config.ASSISTANT_MODEL,
    })
