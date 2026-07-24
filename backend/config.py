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

    # --- EcoTrack Assistant (Google Gemini) ---
    # This key is a REAL secret. It lives only on the server: the React app
    # never sees it and never talks to Google directly. Every assistant request
    # goes through Flask, which checks the user's Firebase token first.
    # Get one free (no card needed) at https://aistudio.google.com
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

    # Which Gemini model the assistant uses. The "flash" models are the fast,
    # free-tier-friendly ones. If this exact name is ever retired, the assistant
    # returns a clear config error - change it here rather than in the code.
    ASSISTANT_MODEL = os.getenv("ASSISTANT_MODEL", "gemini-2.5-flash")

    # Firestore collection names kept in one place so a typo can only happen once.
    COLLECTION_USERS = "users"
    COLLECTION_CARBON_RECORDS = "carbonRecords"
    COLLECTION_GOALS = "goals"
    COLLECTION_REPORTS = "reports"
    COLLECTION_EMISSION_FACTORS = "emissionFactors"
    COLLECTION_ADMINS = "admins"

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
