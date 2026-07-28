# EcoTrack/backend/routes/feedback.py
"""
Feedback route.

This is one of the few PUBLIC routes (no login needed), because a visitor who
has not signed up should still be able to send feedback from the landing site.

Because it is public and writes to the database, it validates strictly and caps
every field's length - an open write endpoint is a small spam risk, so we keep
the door narrow: text only, hard length limits, nothing that could be abused to
store large or malicious payloads.

Mounted at /api/feedback
"""

import re

from flask import Blueprint, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success

feedback_bp = Blueprint("feedback", __name__, url_prefix="/api/feedback")

# Feedback documents live in their own collection, separate from user data
COLLECTION_FEEDBACK = "feedback"

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MAX_NAME = 60
MAX_MESSAGE = 2000
MIN_MESSAGE = 3


@feedback_bp.route("", methods=["POST"])
def submit_feedback():
    """
    Store a piece of feedback.

    Body: {"name": "Aadi", "email": "a@b.com", "message": "...", "rating": 5}
    Only message is required; name, email and rating are optional.
    """
    body = request.get_json(silent=True) or {}

    # --- message (the only required field) ---
    message = str(body.get("message", "")).strip()
    if len(message) < MIN_MESSAGE:
        return api_error("Please write a little more before sending.", 400, code="message_too_short")
    if len(message) > MAX_MESSAGE:
        return api_error(
            f"Feedback must be {MAX_MESSAGE} characters or fewer.",
            400,
            code="message_too_long",
        )

    # --- optional name ---
    name = str(body.get("name", "")).strip()
    if len(name) > MAX_NAME:
        return api_error(f"Name must be {MAX_NAME} characters or fewer.", 400, code="invalid_name")

    # --- optional email (validated only if given) ---
    email = str(body.get("email", "")).strip().lower()
    if email and not EMAIL_PATTERN.match(email):
        return api_error("That email address does not look valid.", 400, code="invalid_email")

    # --- optional rating 1-5 ---
    rating = body.get("rating")
    if rating is not None:
        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return api_error("Rating must be a number from 1 to 5.", 400, code="invalid_rating")
        if rating < 1 or rating > 5:
            return api_error("Rating must be between 1 and 5.", 400, code="invalid_rating")

    db = get_db()
    db.collection(COLLECTION_FEEDBACK).add({
        "name": name or "Anonymous",
        "email": email,          # may be empty; never required
        "message": message,
        "rating": rating,        # may be None
        "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
    })

    return api_success(
        message="Thank you - your feedback has been received.",
        status=201,
    )
