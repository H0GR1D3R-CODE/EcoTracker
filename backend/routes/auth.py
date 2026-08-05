# EcoTrack/backend/routes/auth.py
"""
Authentication and user profile routes.

THE SIGN-UP / SIGN-IN FLOW (worth memorising for the viva)
----------------------------------------------------------
  Registration:
    1. React Register page  -> POST /api/auth/register {name, email, password, region}
    2. Flask creates the Firebase Auth account with the Admin SDK
    3. Flask creates the matching profile document at users/{uid} in Firestore
    4. React then signs the user in with Firebase Auth in the browser

  Login:
    1. React calls Firebase signInWithEmailAndPassword() -> Firebase returns an ID token
    2. React sends that token: POST /api/auth/login {idToken}
    3. Flask verifies the token's signature against Google's public keys
    4. Flask returns the user's profile and whether they are an admin

  Every request after that:
    React attaches the same token as "Authorization: Bearer <token>" and
    @require_auth verifies it before the route runs.

Flask never stores or even sees a password after registration - Firebase Auth
handles password hashing, storage and reset emails.

All routes are mounted under /api/auth
"""

from flask import Blueprint, g, request
from firebase_admin import auth as firebase_auth
from google.cloud import firestore as gcloud_firestore  # installed with firebase-admin

from config import Config, get_db
from routes import (
    EMAIL_ERROR,
    api_error,
    api_success,
    is_admin,
    is_valid_email,
    require_auth,
    verify_token,
)

# A Blueprint is a group of related routes. app.py registers it on the real app.
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# Email validation lives in routes/__init__.py so registration, feedback and the
# React forms all apply one rule. Enforced here on the server too, so it holds
# even if someone bypasses the form and calls the API directly.
#
# Previously this demanded @gmail.com. That turned away anyone on Yahoo,
# Outlook, Proton or a university address such as @bcah.christuniversity.in -
# they could not create an account at all.

# Strong-password policy. These rules mirror PASSWORD_RULES in the frontend
# Register.jsx exactly, so the checklist the user sees is the policy the server
# enforces - the client cannot be bypassed to create a weak password.
PASSWORD_RULES = [
    ("at least 8 characters", lambda p: len(p) >= 8),
    ("an uppercase letter", lambda p: any(c.isupper() for c in p)),
    ("a lowercase letter", lambda p: any(c.islower() for c in p)),
    ("a number", lambda p: any(c.isdigit() for c in p)),
    ("a special character", lambda p: any(not c.isalnum() for c in p)),
]


def _password_problems(password):
    """Return the list of rule descriptions a password fails (empty = valid)."""
    return [label for label, test in PASSWORD_RULES if not test(password)]


def _join_with_and(items):
    """Join ["a", "b", "c"] into "a, b and c" for a readable error message."""
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


# ---------------------------------------------------------------------------
# Helpers used only inside this file
# ---------------------------------------------------------------------------

def _serialize_user(doc_id, data):
    """
    Convert a Firestore user document into plain JSON-safe values.

    Firestore hands back its own datetime type, which the json module cannot
    encode, so createdAt is turned into an ISO string like "2026-07-24T09:15:00+00:00".
    """
    created_at = data.get("createdAt")
    return {
        "uid": doc_id,
        "name": data.get("name", ""),
        "email": data.get("email", ""),
        "region": data.get("region", ""),
        # isoformat() only exists on datetime objects, so check before calling it
        "createdAt": created_at.isoformat() if created_at else None,
    }


def _clean_text(value, fallback=""):
    """Trim whitespace and guarantee we end up with a string."""
    if not isinstance(value, str):
        return fallback
    return value.strip()


def _validate_name(name):
    """Return an error message string, or None when the name is fine."""
    if len(name) < 2:
        return "Name must be at least 2 characters long."
    if len(name) > 60:
        return "Name must be 60 characters or fewer."
    return None


# ---------------------------------------------------------------------------
# POST /api/auth/register        (PUBLIC - no token, the account does not exist yet)
# ---------------------------------------------------------------------------

@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Create a brand new EcoTrack account.

    This is one of only three routes in the API without token verification, for
    an unavoidable reason: the user has no account, so there is no token to send.

    Body: {"name": "Aadi", "email": "a@b.com", "password": "secret123", "region": "India"}
    """
    body = request.get_json(silent=True) or {}  # silent=True avoids a crash on bad JSON

    name = _clean_text(body.get("name"))
    email = _clean_text(body.get("email")).lower()  # store emails lowercase for consistency
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    region = _clean_text(body.get("region"), "India") or "India"

    # --- validate every field before touching Firebase ---
    name_error = _validate_name(name)
    if name_error:
        return api_error(name_error, 400, code="invalid_name")

    if not is_valid_email(email):
        return api_error(
            EMAIL_ERROR,
            400,
            code="invalid_email",
        )

    problems = _password_problems(password)
    if problems:
        # e.g. "Password must contain a number and a special character."
        return api_error(
            "Password must contain " + _join_with_and(problems) + ".",
            400,
            code="weak_password",
        )

    if len(region) > 60:
        return api_error("Region must be 60 characters or fewer.", 400, code="invalid_region")

    # --- step 1: create the Firebase Authentication account ---
    try:
        user_record = firebase_auth.create_user(
            email=email,
            password=password,       # Firebase hashes this; we never store it ourselves
            display_name=name,
        )
    except firebase_auth.EmailAlreadyExistsError:
        # 409 Conflict is the correct status when a resource already exists
        return api_error(
            "An account with this email already exists. Please log in instead.",
            409,
            code="email_exists",
        )
    except ValueError as error:
        # Raised when Firebase rejects the email or password format
        return api_error(str(error), 400, code="invalid_credentials")
    except Exception:
        return api_error("Could not create account. Please try again.", 500, code="signup_failed")

    # --- step 2: create the Firestore profile document ---
    db = get_db()
    try:
        # The Firestore document id IS the Firebase uid - that is what links
        # the Authentication account to the profile data
        db.collection(Config.COLLECTION_USERS).document(user_record.uid).set({
            "name": name,
            "email": email,
            "region": region,
            # SERVER_TIMESTAMP asks Firestore to stamp the time on its own servers,
            # which is more trustworthy than a clock on the user's computer
            "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
        })
    except Exception:
        # Roll back so we never leave an Auth account without a profile.
        # Without this, the user could log in but the app would find no data.
        try:
            firebase_auth.delete_user(user_record.uid)
        except Exception:
            pass  # nothing more we can do; the login route can self-heal this case
        return api_error(
            "Could not save your profile. Please try again.",
            500,
            code="profile_save_failed",
        )

    return api_success(
        {
            "uid": user_record.uid,
            "name": name,
            "email": email,
            "region": region,
        },
        message="Account created successfully. You can now log in.",
        status=201,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------

@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Exchange a Firebase ID token for the user's EcoTrack profile.

    Flask does NOT check the password here - Firebase already did that in the
    browser. What this route proves is that the token React is holding is
    genuine, unexpired, and issued for this exact Firebase project.

    Body: {"idToken": "<token from Firebase signInWithEmailAndPassword>"}
    """
    body = request.get_json(silent=True) or {}
    id_token = _clean_text(body.get("idToken"))

    if not id_token:
        return api_error("idToken is required.", 400, code="missing_token")

    # Same verification the @require_auth decorator uses, just reading the token
    # from the request body instead of the Authorization header
    decoded_token, error = verify_token(id_token)
    if error:
        return error

    uid = decoded_token["uid"]
    email = decoded_token.get("email", "")

    db = get_db()
    user_ref = db.collection(Config.COLLECTION_USERS).document(uid)
    user_doc = user_ref.get()

    if not user_doc.exists:
        # A valid Auth account with no profile yet. Two ways to get here:
        #
        #   1. FIRST GOOGLE SIGN-IN - the normal path now. Google creates the
        #      Auth account without ever touching /register, so this is where
        #      their profile gets built, from the name and email in the token.
        #   2. A failed Firestore write during registration whose rollback also
        #      failed. Rare, but rebuilding here stops the user being locked out
        #      of an account they cannot re-register.
        fallback_name = decoded_token.get("name") or email.split("@")[0] or "EcoTrack User"
        user_ref.set({
            "name": fallback_name,
            "email": email,
            "region": "India",
            "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
        })
        user_doc = user_ref.get()

    profile = _serialize_user(uid, user_doc.to_dict())
    profile["isAdmin"] = is_admin(uid, email)  # lets React decide whether to show admin links

    return api_success(profile, message="Login successful.")


# ---------------------------------------------------------------------------
# GET /api/auth/profile
# ---------------------------------------------------------------------------

@auth_bp.route("/profile", methods=["GET"])
@require_auth
def get_profile():
    """Return the signed-in user's profile document."""
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(g.uid).get()

    if not user_doc.exists:
        # The frontend reacts to this code by sending the user back to login
        return api_error(
            "No profile found for this account.",
            404,
            code="profile_not_found",
        )

    profile = _serialize_user(g.uid, user_doc.to_dict())
    profile["isAdmin"] = is_admin(g.uid, g.email)
    return api_success(profile)


# ---------------------------------------------------------------------------
# PUT /api/auth/profile
# ---------------------------------------------------------------------------

@auth_bp.route("/profile", methods=["PUT"])
@require_auth
def update_profile():
    """
    Update the editable parts of the profile (name and region).

    Email is deliberately NOT editable here - changing an email address has to
    go through Firebase Auth itself, otherwise the Auth account and the Firestore
    profile would disagree about who the user is.

    Body: {"name": "Aadi S", "region": "Karnataka"}
    """
    body = request.get_json(silent=True) or {}

    db = get_db()
    user_ref = db.collection(Config.COLLECTION_USERS).document(g.uid)

    if not user_ref.get().exists:
        return api_error(
            "No profile found for this account.",
            404,
            code="profile_not_found",
        )

    # Only copy across the fields the user actually sent
    updates = {}

    if "name" in body:
        name = _clean_text(body.get("name"))
        name_error = _validate_name(name)
        if name_error:
            return api_error(name_error, 400, code="invalid_name")
        updates["name"] = name

    if "region" in body:
        region = _clean_text(body.get("region"))
        if not region or len(region) > 60:
            return api_error(
                "Region must be between 1 and 60 characters.",
                400,
                code="invalid_region",
            )
        updates["region"] = region

    if not updates:
        return api_error("Nothing to update. Send a name or a region.", 400, code="empty_update")

    user_ref.update(updates)  # update() only touches the listed fields

    refreshed = user_ref.get()
    profile = _serialize_user(g.uid, refreshed.to_dict())
    profile["isAdmin"] = is_admin(g.uid, g.email)

    return api_success(profile, message="Profile updated successfully.")
