# EcoTrack/backend/config.py
"""
Central configuration for the EcoTrack Flask backend.

This file does three jobs:
  1. Loads the .env file so secrets never sit inside the source code.
  2. Exposes a Config class that Flask reads its settings from.
  3. Starts the Firebase Admin SDK and hands out the Firestore client.

Every other file in the backend imports from here instead of reading
environment variables on its own.
"""

import json
import os

import firebase_admin
from firebase_admin import credentials, firestore, storage
from dotenv import load_dotenv

# Absolute path to the folder this file lives in (EcoTrack/backend).
# Using absolute paths means the app works no matter which folder you run it from.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Read .env and copy its values into the environment variables of this process.
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _split_origins(raw_value):
    """Turn "http://a.com, http://b.com" into ["http://a.com", "http://b.com"]."""
    if not raw_value:
        return []
    # strip() removes stray spaces the user may have typed around the commas
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


class Config:
    """Plain settings container. Flask loads this with app.config.from_object()."""

    # Used by Flask to sign session cookies. Must be secret in production.
    SECRET_KEY = os.getenv("SECRET_KEY", "unsafe-development-key")

    FLASK_ENV = os.getenv("FLASK_ENV", "development")

    # DEBUG shows full error pages and auto-reloads code. Never enable in production.
    DEBUG = FLASK_ENV == "development"

    # Render supplies its own PORT environment variable when it starts the app.
    PORT = int(os.getenv("PORT", 5000))

    FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "ecotrack-carbon-tracker")

    # Option A - local development: path to the downloaded service account file
    FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "")

    # Option B - Render: the whole service account JSON pasted into one variable
    FIREBASE_SERVICE_ACCOUNT_JSON = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")

    # Which frontend URLs are allowed to call this API from a browser
    CORS_ORIGINS = _split_origins(os.getenv("CORS_ORIGINS", "http://localhost:5173"))

    # --- Admin access ---
    # Comma-separated list of email addresses allowed into the admin panel.
    # When this is set, it is the ONLY way to be an admin: exactly these emails,
    # nothing else. The email is read from the verified Firebase token, so it
    # cannot be faked. Leave blank to fall back to the admins/{uid} Firestore
    # collection instead. Stored lowercased so the comparison is case-insensitive.
    ADMIN_EMAILS = {
        e.strip().lower()
        for e in os.getenv("ADMIN_EMAILS", "").split(",")
        if e.strip()
    }

    # --- EcoTrack Assistant (Groq) ---
    # This key is a REAL secret. It lives only on the server: the React app
    # never sees it and never talks to Groq directly. Every assistant request
    # goes through Flask, which checks the user's Firebase token first.
    # Get one free (no card needed) at https://console.groq.com
    #
    # WHY GROQ, NOT GEMINI (as of August 2026)
    # This app ran on Google Gemini's free tier first - genuinely free, no
    # card needed, which is what made the feature possible on a student
    # budget in the first place. It moved to Groq after a real, confirmed
    # Gemini outage (generativelanguage.googleapis.com itself returning
    # 503/504 - verified directly against Google's API, bypassing this
    # backend entirely, before deciding it was not a bug in this code) made
    # the case for a faster, more reliable free tier. Groq is not a model -
    # it is an inference provider running open-weight models on hardware
    # built specifically for low-latency inference, which is also why
    # responses are now noticeably faster than Gemini's ever were.
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

    # Text chat, JSON extraction (voice logging, the AI reduction plan), and
    # report summaries all use this one model - openai/gpt-oss-120b supports
    # strict JSON-schema structured output (see routes/assistant.py's
    # _call_groq) alongside ordinary conversation, so one model covers every
    # text-only surface without switching per route.
    ASSISTANT_MODEL = os.getenv("ASSISTANT_MODEL", "openai/gpt-oss-120b")

    # The bill scanner (routes/ingest.py) needs a model that can actually
    # read an image, which ASSISTANT_MODEL above cannot - qwen/qwen3.8-27b is
    # the one Groq-hosted model that supports both vision input AND JSON-
    # schema structured output at once, which the extraction needs together.
    # UNLIKE GEMINI, THIS MODEL DOES NOT READ PDFS - only image formats
    # (JPEG/PNG/WEBP). See ingest.py's own ALLOWED_MIME_TYPES for where PDF
    # support was deliberately dropped rather than silently degraded.
    VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")

    # --- Razorpay (donations / "Support EcoTrack") ---
    # These power the public donation flow (routes/payments.py). They are
    # TEST-MODE keys, so no real money moves.
    #   RAZORPAY_KEY_ID     is safe to hand to the browser - Razorpay Checkout
    #                       needs it, and the create-order route returns it.
    #   RAZORPAY_KEY_SECRET is a REAL secret. It signs orders and verifies the
    #                       payment signature, and must live only on the server -
    #                       never in frontend/.env or any committed file.
    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")

    # Sanity bounds for the open donation endpoint, in paise (100 paise = ₹1).
    # A floor of 100 is Razorpay's minimum; the ceiling stops anyone abusing a
    # public, no-login endpoint to create absurd orders.
    DONATION_MIN_PAISE = 100          # ₹1
    DONATION_MAX_PAISE = 10_000_000   # ₹1,00,000

    # --- Password reset email (Resend) ---
    # Optional, same pattern as GROQ_API_KEY above: "forgot password" works
    # completely without this - routes/auth.py's /forgot-password route simply
    # reports the custom email as unavailable, and AuthContext.resetPassword()
    # on the frontend falls back to Firebase's own built-in reset email, exactly
    # as it did before this existed. Set it to send EcoTrack's own branded
    # design instead of Firebase's plain default.
    # Free, no card, at https://resend.com - without verifying your own sending
    # domain there, Resend only delivers to the address the account was
    # created with, so this is worth configuring for real use beyond testing.
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "EcoTrack <onboarding@resend.dev>")

    # The live frontend, used to build the link a reset/notification email
    # sends the user back to once they are done. ecotrackapp.web.app was the
    # deploy target until 2026-08-18, when it moved to the shorter ecotrk.web.app
    # (see firebase.json) - kept in sync here since this only affects the
    # default; PUBLIC_APP_URL itself should still be set explicitly on Vercel.
    PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "https://ecotrk.web.app")

    # --- Bot protection (Google reCAPTCHA v3) ---
    # Same optional pattern as GROQ_API_KEY and RESEND_API_KEY above: every
    # route that checks this works completely without it configured - it just
    # skips verification rather than blocking real users, because a half-set-up
    # bot check that locks everyone out is worse than no bot check at all.
    # Free, no card, at https://www.google.com/recaptcha/admin - register a
    # v3 (score-based, invisible) site, set the site key as
    # VITE_RECAPTCHA_SITE_KEY in frontend/.env and the secret key here.
    RECAPTCHA_SECRET_KEY = os.getenv("RECAPTCHA_SECRET_KEY", "")

    # Google scores each token 0.0 (almost certainly a bot) to 1.0 (almost
    # certainly human). 0.5 is Google's own documented starting point.
    RECAPTCHA_MIN_SCORE = float(os.getenv("RECAPTCHA_MIN_SCORE", "0.5"))

    # --- Push notifications (Firebase Cloud Messaging + Vercel Cron) ---
    # Sending a push needs no secret of its own - firebase_admin.messaging
    # rides on the same service-account credentials get_db() already
    # authenticates with. The one thing this deployment is actually missing
    # is a way to tell a real Vercel Cron request apart from anyone else who
    # discovers the URL and POSTs it themselves to spam every user's phone.
    # Vercel signs every cron invocation with this value as a Bearer token
    # automatically once it is set as a Vercel env var - see routes/cron.py.
    # Generate one the same way SECRET_KEY's own comment suggests:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    # Blank means the cron route refuses every request rather than silently
    # running unauthenticated - same fail-closed reasoning as the rest of
    # this file's optional secrets, just inverted, because an unauthenticated
    # bulk-notification endpoint is a worse failure mode than a disabled one.
    CRON_SECRET = os.getenv("CRON_SECRET", "")

    # Firestore collection names kept in one place so a typo can only happen once.
    COLLECTION_USERS = "users"
    COLLECTION_CARBON_RECORDS = "carbonRecords"
    COLLECTION_GOALS = "goals"
    COLLECTION_REPORTS = "reports"
    COLLECTION_EMISSION_FACTORS = "emissionFactors"
    COLLECTION_ADMINS = "admins"
    COLLECTION_TWO_FACTOR_CODES = "twoFactorCodes"
    # One pending email-change request per account, keyed by uid - the same
    # single-document-per-uid, most-recent-wins shape COLLECTION_TWO_FACTOR_CODES
    # already uses. Holds a hashed confirmation token (never the raw token,
    # same reasoning as _hash_code for 2FA), the requested new email, and an
    # expiry - see routes/auth.py's request_email_change/confirm_email_change
    # and email_service.py's own "EMAIL CHANGE CONFIRMATION" section for why
    # this exists as its own flow rather than Firebase's built-in one.
    COLLECTION_EMAIL_CHANGE_REQUESTS = "emailChangeRequests"
    # A read-only role, one notch below admin: access to the anonymised
    # research export/stats (routes/admin.py's research_export and
    # research_stats) without the ability to delete a user, edit a factor,
    # or do anything else an admin can. A document here grants it, the same
    # admins/{uid}-collection pattern is_admin already uses - see
    # routes/__init__.py's is_researcher/require_researcher.
    COLLECTION_RESEARCHERS = "researchers"

    # --- Insights / closed-loop feedback (forecast, swaps, templates, streaks) ---
    COLLECTION_ACTIVITY_TEMPLATES = "activityTemplates"
    # The evaluation harness spine: every recommendation the app shows anyone
    # is logged here, along with whether they acted on it. Without this,
    # "did the swap engine work" is a matter of opinion; with it, it is a
    # query. See insights_engine.py and routes/engagement.py.
    COLLECTION_INTERVENTIONS = "interventions"
    COLLECTION_CHALLENGES = "challenges"
    # Cached aggregate only - {region}_{YYYY-MM} documents holding deciles and
    # a count, never a single user's figure. See routes/insights.py:_get_cohort_stats.
    COLLECTION_COHORT_STATS = "cohortStats"
    # Cached daily temperature series per region - see weather_engine.py and
    # routes/insights.py's weather route. One document per region is shared
    # by every user in it, the same "Firestore as shared cache" reasoning as
    # COLLECTION_COHORT_STATS just above.
    COLLECTION_WEATHER_CACHE = "weatherCache"
    # Cached current air-quality reading per region - same "Firestore as
    # shared cache" pattern as COLLECTION_WEATHER_CACHE, a shorter TTL
    # since AQI moves faster than a daily temperature series. See
    # air_quality_engine.py and routes/insights.py's air-quality route.
    COLLECTION_AIR_QUALITY_CACHE = "airQualityCache"
    # Household/group mode - see routes/household.py. A user belongs to at
    # most one household at a time (users/{uid}.householdId points back here).
    COLLECTION_HOUSEHOLDS = "households"
    # A weekly, combined-emissions challenge for a whole household, the same
    # shape as COLLECTION_CHALLENGES but keyed by householdId instead of
    # userId - see routes/household.py's _ensure_week_household_challenge.
    COLLECTION_HOUSEHOLD_CHALLENGES = "householdChallenges"
    # One document per (record, member who cheered) so a cheer is naturally
    # idempotent - see routes/household.py's cheer routes.
    COLLECTION_HOUSEHOLD_CHEERS = "householdCheers"

    # A tier above a classroom: a campus green cell or eco-club lead running
    # several classroom groups as one institution, aggregate-only (never a
    # single student's row) - see routes/institution.py. A classroom household
    # document optionally carries an institutionId pointing back here, the
    # same "child points at parent" shape COLLECTION_HOUSEHOLDS itself uses
    # for users/{uid}.householdId. A coordinator is just a normal user who
    # owns one of these documents (users/{uid}.institutionId), not a new
    # Firebase-level role - see routes/institution.py's own module docstring.
    COLLECTION_INSTITUTIONS = "institutions"

    # One document per recurring "remind me to log X" reminder a user sets
    # up - see routes/reminders.py. Delivered through the SAME once-daily
    # cron job routes/cron.py already runs (Vercel's Hobby tier caps how
    # many cron jobs and how often they can fire), so a reminder is scoped
    # to "which days of the week", never a chosen time of day.
    COLLECTION_ACTIVITY_REMINDERS = "activityReminders"

    # The seven emission categories EcoTrack supports.
    # Routes validate incoming data against this list, and the ORDER here is the
    # order the Calculator page shows its tabs in - so keep it stable.
    CATEGORIES = [
        "transport",
        "electricity",
        "fuel",
        "diet",
        "waste",
        "water",
        "consumption",
    ]


def _build_credentials():
    """
    Work out how to authenticate with Firebase and return a credentials object.

    Tries the pasted-JSON variable first (that is what Render uses), then falls
    back to the service account file on disk (that is what you use locally).
    """
    raw_json = Config.FIREBASE_SERVICE_ACCOUNT_JSON.strip()

    if raw_json:
        # json.loads turns the pasted text back into a Python dictionary
        service_account_info = json.loads(raw_json)
        return credentials.Certificate(service_account_info)

    if Config.FIREBASE_CREDENTIALS_PATH:
        key_path = Config.FIREBASE_CREDENTIALS_PATH
        # Allow the .env file to hold either a bare filename or a full path
        if not os.path.isabs(key_path):
            key_path = os.path.join(BASE_DIR, key_path)

        if not os.path.exists(key_path):
            raise FileNotFoundError(
                f"Firebase service account key not found at: {key_path}\n"
                "Download it from Firebase Console > Project settings > "
                "Service accounts > Generate new private key, then save it in "
                "the backend folder as serviceAccountKey.json"
            )
        return credentials.Certificate(key_path)

    raise RuntimeError(
        "No Firebase credentials configured. Set FIREBASE_CREDENTIALS_PATH "
        "(local) or FIREBASE_SERVICE_ACCOUNT_JSON (Render) in your .env file."
    )


def init_firebase():
    """
    Start the Firebase Admin SDK exactly once.

    Calling firebase_admin.initialize_app() twice raises an error, so we first
    check whether an app already exists. This matters because Flask's auto-reloader
    can import this module more than once during development.
    """
    if not firebase_admin._apps:  # _apps is empty until an app is initialised
        firebase_admin.initialize_app(
            _build_credentials(),
            {
                "projectId": Config.FIREBASE_PROJECT_ID,
                # Needed for storage.bucket() (routes/auth.py's avatar
                # upload) to work with no arguments - without this, every
                # call would have to pass the bucket name by hand. New
                # Firebase projects are provisioned with this exact
                # {project-id}.firebasestorage.app bucket name; matches
                # VITE_FIREBASE_STORAGE_BUCKET in frontend/.env.
                "storageBucket": f"{Config.FIREBASE_PROJECT_ID}.firebasestorage.app",
            },
        )
    return firebase_admin.get_app()


def get_db():
    """
    Return the Firestore database client.

    Every route calls this instead of creating its own client, so the whole
    backend shares a single connection.
    """
    init_firebase()  # safe to call repeatedly - it returns early if already started
    return firestore.client()


def get_storage_bucket():
    """
    Return the default Firebase Storage bucket.

    Only used by the avatar upload route (routes/auth.py) - every other
    piece of user-submitted media in this app (a bill photo, a voice
    transcript) is sent straight to Groq and never persisted anywhere, which
    is why this did not exist until an avatar was the first thing that
    genuinely needed to be stored and served back. See storage.rules for the
    actual access control - this Admin SDK client bypasses those rules
    entirely (it authenticates as the service account, not as the end user),
    so every check on WHO may set WHOSE avatar has to happen in this route's
    own Python code, not by relying on rules the Admin SDK never consults.
    """
    init_firebase()
    return storage.bucket()
