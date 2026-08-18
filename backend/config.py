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
from firebase_admin import credentials, firestore
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

    # --- EcoTrack Assistant (Google Gemini) ---
    # This key is a REAL secret. It lives only on the server: the React app
    # never sees it and never talks to Google directly. Every assistant request
    # goes through Flask, which checks the user's Firebase token first.
    # Get one free (no card needed) at https://aistudio.google.com
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

    # Which Gemini model the assistant uses. "gemini-flash-latest" is an alias
    # Google keeps pointed at a current fast model, so it survives the retirement
    # of any specific version. Override in .env if you want to pin a version.
    ASSISTANT_MODEL = os.getenv("ASSISTANT_MODEL", "gemini-flash-latest")

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
    # Optional, same pattern as GEMINI_API_KEY above: "forgot password" works
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
    # Same optional pattern as GEMINI_API_KEY and RESEND_API_KEY above: every
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

    # Firestore collection names kept in one place so a typo can only happen once.
    COLLECTION_USERS = "users"
    COLLECTION_CARBON_RECORDS = "carbonRecords"
    COLLECTION_GOALS = "goals"
    COLLECTION_REPORTS = "reports"
    COLLECTION_EMISSION_FACTORS = "emissionFactors"
    COLLECTION_ADMINS = "admins"
    COLLECTION_TWO_FACTOR_CODES = "twoFactorCodes"

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
            {"projectId": Config.FIREBASE_PROJECT_ID},
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
