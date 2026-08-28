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

import base64
import binascii
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, quote, urlparse

from flask import Blueprint, g, request
from firebase_admin import auth as firebase_auth
from google.cloud import firestore as gcloud_firestore  # installed with firebase-admin

from config import Config, get_db, get_storage_bucket
from email_service import send_password_reset_email, send_two_factor_code_email
from routes import (
    EMAIL_ERROR,
    api_error,
    api_success,
    check_rate_limit,
    client_ip,
    fetch_user_records,
    is_admin,
    is_valid_email,
    require_auth,
    verify_recaptcha,
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
        "twoFactorEnabled": bool(data.get("twoFactorEnabled", False)),
        # Off by default - see routes/community.py's get_leaderboard for what
        # opting in actually exposes (an alias and a points total, never the
        # real name unless the alias field is left blank).
        "leaderboardOptIn": bool(data.get("leaderboardOptIn", False)),
        "leaderboardAlias": data.get("leaderboardAlias", ""),
        # A separate opt-in from leaderboardOptIn above - someone might want
        # a shareable "my climate journey" page (routes/community.py's
        # get_journey) without wanting to be ranked against other users, or
        # the other way round. Reuses the same leaderboardAlias for its
        # display name rather than a third field, since both are "what
        # should strangers call me" and there is no reason for that answer
        # to differ between the two surfaces.
        "publicProfileOptIn": bool(data.get("publicProfileOptIn", False)),
        # null/null (the default for every account before this existed) means
        # "no avatar chosen yet" - Avatar.jsx falls back to plain initials.
        # See update_profile's own comment on what "preset" vs "custom" mean.
        "avatarType": data.get("avatarType"),
        "avatarValue": data.get("avatarValue"),
        # "off" (the default) / "weekly" / "monthly" - see routes/cron.py's
        # send_digest_emails for how this actually gets delivered (the same
        # daily cron run that already sends push notifications, just gated
        # on this field instead of a push token).
        "digestFrequency": data.get("digestFrequency", "off"),
    }


def _clean_text(value, fallback=""):
    """Trim whitespace and guarantee we end up with a string."""
    if not isinstance(value, str):
        return fallback
    return value.strip()


# The only punctuation a real name uses - a space, apostrophe, hyphen or
# period (initials like "J.R.", surnames like "O'Brien-Smith"). Everything
# else has to be a letter: no digits, no other symbols. This is what "only
# strings, no numbers" means for the name field in practice - mirrors
# NAME_PATTERN in frontend/src/utils/validation.js exactly, so the client
# never accepts a name the server would reject, or vice versa. Enforced here
# too (not just in React) because this route can be called directly.
_NAME_EXTRA_CHARS = " '.-"


def _validate_name(name):
    """Return an error message string, or None when the name is fine."""
    if len(name) < 2:
        return "Name must be at least 2 characters long."
    if len(name) > 60:
        return "Name must be 60 characters or fewer."
    if not name[0].isalpha():
        return "Name must start with a letter."
    if not all(ch.isalpha() or ch in _NAME_EXTRA_CHARS for ch in name):
        return "Name can only contain letters, spaces, hyphens, apostrophes and periods — no numbers or symbols."
    return None


# ---------------------------------------------------------------------------
# POST /api/auth/register        (PUBLIC - no token, the account does not exist yet)
# ---------------------------------------------------------------------------

@auth_bp.route("/check-email", methods=["POST"])
def check_email():
    """
    Whether an account already exists for this email - lets Register.jsx
    show "an account already exists" the moment someone leaves the email
    field, instead of only after a full three-step form and a submit.

    NOT A NEW ENUMERATION SURFACE, JUST AN EARLIER ONE
    register() below already reveals exactly this (via the email_exists
    code on a real submit attempt) to anyone willing to fill in a throwaway
    name/password - the property this route trades on already existed. What
    changes here is convenience, not what an attacker could already learn,
    so this gets the same rate-limit posture as register() (same bucket
    key even, deliberately: both routes answer the identical question, and
    sharing one budget between them is what actually caps how many times
    that question can be asked from one IP per hour, rather than each route
    quietly doubling the real limit).

    Body: {"email": "someone@example.com"}
    Always 200 with {"exists": true|false} - a malformed email is simply
    reported as not existing rather than as a 400, so the frontend does not
    need a second error path for a field it is already validating live.
    """
    if not check_rate_limit("register", client_ip(), max_attempts=8, window_seconds=3600):
        return api_error(
            "Too many requests from this connection. Please try again later.",
            429,
            code="rate_limited",
        )

    body = request.get_json(silent=True) or {}
    email = _clean_text(body.get("email")).lower()

    if not email or not is_valid_email(email):
        return api_success({"exists": False})

    try:
        firebase_auth.get_user_by_email(email)
        return api_success({"exists": True})
    except firebase_auth.UserNotFoundError:
        return api_success({"exists": False})
    except Exception:
        # A genuine infrastructure hiccup, not a signal either way - report
        # not-found so the frontend just quietly skips the early hint rather
        # than showing an error under a field that has not been submitted
        # yet, the same "degrade to no signal" reasoning forgot_password
        # uses further down this file.
        return api_success({"exists": False})


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Create a brand new EcoTrack account.

    This is one of only three routes in the API without token verification, for
    an unavoidable reason: the user has no account, so there is no token to send.

    Body: {"name": "Aadi", "email": "a@b.com", "password": "secret123", "region": "India"}
    """
    # This route has no auth token to key a rate limit on - the IP address is
    # the only identity available before an account exists. 8 accounts per
    # hour per IP is generous for a real person, tight for a scripted signup
    # flood aimed at, for example, spamming the Feedback/Donate flows next
    # with fresh accounts.
    if not check_rate_limit("register", client_ip(), max_attempts=8, window_seconds=3600):
        return api_error(
            "Too many accounts created from this connection recently. Please try again later.",
            429,
            code="rate_limited",
        )

    body = request.get_json(silent=True) or {}  # silent=True avoids a crash on bad JSON

    recaptcha_ok, _reason = verify_recaptcha(body.get("recaptchaToken"), "register")
    if not recaptcha_ok:
        return api_error(
            "Could not verify you're not a bot. Please refresh the page and try again.",
            403,
            code="recaptcha_failed",
        )

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

    # ---- two-step verification gate ----
    # Firebase has already fully authenticated this person by the time this
    # route runs (the token above proves it) - what this route decides is
    # only whether the SPA hands them their profile and lets them into the
    # app straight away, or makes them prove one more thing first. See
    # _issue_two_factor_code()'s own docstring for what happens when the code
    # cannot actually be delivered.
    if profile["twoFactorEnabled"]:
        issued = _issue_two_factor_code(uid, email)
        if issued:
            return api_success({"twoFactorRequired": True, "email": email})
        # Could not send a code at all (no RESEND_API_KEY, Resend rejected it,
        # rate-limited) - gating sign-in on a code nobody can receive would
        # lock the user out of their own account, so let them straight
        # through instead. Same "fail open" reasoning as verify_recaptcha().

    return api_success(profile, message="Login successful.")


# ---------------------------------------------------------------------------
# TWO-STEP VERIFICATION
#
# Enabled per-account from Profile (PUT /api/auth/2fa). Once on, login() above
# does not hand over the profile until POST /api/auth/2fa/verify confirms a
# short-lived, single-use code sent by email through send_two_factor_code_email().
#
# WHAT THIS DOES AND DOES NOT PROTECT AGAINST (worth knowing, not hiding)
# Every route in this file - like every other route in the backend - is
# protected by a valid Firebase ID token, which Firebase already issued the
# moment sign-in succeeded in the browser, before this gate runs at all. This
# feature does not, and architecturally cannot on top of Firebase's own
# session model, stop a token holder from calling other API routes directly
# without ever passing this check - the same "convenience, not security"
# ceiling ProtectedRoute.jsx documents on the frontend. What it genuinely adds
# is a second, time-boxed proof of email access before the SPA will show
# anyone's data or let them navigate anywhere - which is the same value a
# banking app's OTP step has always had: raising the bar past "knows the
# password" to "knows the password AND can read this inbox right now."
# ---------------------------------------------------------------------------

TWO_FACTOR_CODE_TTL_MINUTES = 10
TWO_FACTOR_MAX_ATTEMPTS = 5


def _hash_code(code):
    """One-way hash of a 6-digit code - never store the plain code at rest."""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _issue_two_factor_code(uid, email):
    """
    Generate a fresh 6-digit code, store its hash, and email it.

    Returns True once Resend has accepted the email, False if the code could
    not be sent for any reason (see login()'s own comment on what False means
    to its caller). Overwrites any code already pending for this uid - only
    the most recently sent code is ever valid, so requesting a new one
    invalidates the last.
    """
    code = f"{secrets.randbelow(1_000_000):06d}"  # 000000-999999, zero-padded
    now = datetime.now(timezone.utc)

    db = get_db()
    db.collection(Config.COLLECTION_TWO_FACTOR_CODES).document(uid).set({
        "codeHash": _hash_code(code),
        "expiresAt": now + timedelta(minutes=TWO_FACTOR_CODE_TTL_MINUTES),
        "attempts": 0,
    })

    return send_two_factor_code_email(email, code)


@auth_bp.route("/2fa", methods=["PUT"])
@require_auth
def set_two_factor():
    """
    Turn two-step verification on or off for the signed-in account.

    Body: {"enabled": true}
    """
    body = request.get_json(silent=True) or {}
    if "enabled" not in body or not isinstance(body.get("enabled"), bool):
        return api_error("enabled (true or false) is required.", 400, code="invalid_body")

    db = get_db()
    user_ref = db.collection(Config.COLLECTION_USERS).document(g.uid)
    if not user_ref.get().exists:
        return api_error("No profile found for this account.", 404, code="profile_not_found")

    user_ref.update({"twoFactorEnabled": body["enabled"]})

    # Turning it off should also clear any code left mid-flow from a moment
    # ago, so a stale one cannot be replayed against a future sign-in.
    if not body["enabled"]:
        db.collection(Config.COLLECTION_TWO_FACTOR_CODES).document(g.uid).delete()

    refreshed = user_ref.get()
    profile = _serialize_user(g.uid, refreshed.to_dict())
    profile["isAdmin"] = is_admin(g.uid, g.email)

    message = "Two-step verification turned on." if body["enabled"] else "Two-step verification turned off."
    return api_success(profile, message=message)


@auth_bp.route("/2fa/resend", methods=["POST"])
@require_auth
def resend_two_factor():
    """
    Send a fresh code, replacing whichever one was issued at login.

    Rate-limited per account rather than per IP: this always follows a
    successful password check, so the account, not the connection, is what
    needs protecting from being hammered with emails.
    """
    if not check_rate_limit("2fa-resend", g.uid, max_attempts=3, window_seconds=600):
        return api_error(
            "Too many codes requested. Please wait a few minutes and try again.",
            429,
            code="rate_limited",
        )

    issued = _issue_two_factor_code(g.uid, g.email)
    return api_success({"sent": issued})


@auth_bp.route("/2fa/verify", methods=["POST"])
@require_auth
def verify_two_factor():
    """
    Check a submitted code and, on success, hand over the profile that
    login() withheld.

    Body: {"code": "482913"}
    """
    if not check_rate_limit("2fa-verify", g.uid, max_attempts=10, window_seconds=600):
        return api_error(
            "Too many attempts. Please wait a few minutes and try again.",
            429,
            code="rate_limited",
        )

    body = request.get_json(silent=True) or {}
    code = _clean_text(body.get("code"))

    if not code:
        return api_error("code is required.", 400, code="missing_code")

    db = get_db()
    code_ref = db.collection(Config.COLLECTION_TWO_FACTOR_CODES).document(g.uid)
    code_doc = code_ref.get()

    if not code_doc.exists:
        return api_error(
            "That code has expired. Request a new one.",
            400,
            code="code_expired",
        )

    stored = code_doc.to_dict()
    now = datetime.now(timezone.utc)

    if now > stored.get("expiresAt"):
        code_ref.delete()
        return api_error("That code has expired. Request a new one.", 400, code="code_expired")

    if stored.get("attempts", 0) >= TWO_FACTOR_MAX_ATTEMPTS:
        code_ref.delete()
        return api_error(
            "Too many incorrect attempts. Request a new code.",
            400,
            code="too_many_attempts",
        )

    # secrets.compare_digest avoids leaking timing information about how much
    # of the hash matched - the same reason password checks never use ==.
    if not secrets.compare_digest(_hash_code(code), stored.get("codeHash", "")):
        code_ref.update({"attempts": gcloud_firestore.Increment(1)})
        return api_error("Incorrect code. Please try again.", 400, code="wrong_code")

    # Correct and unused - consume it immediately so it cannot be replayed.
    code_ref.delete()

    user_doc = db.collection(Config.COLLECTION_USERS).document(g.uid).get()
    if not user_doc.exists:
        return api_error("No profile found for this account.", 404, code="profile_not_found")

    profile = _serialize_user(g.uid, user_doc.to_dict())
    profile["isAdmin"] = is_admin(g.uid, g.email)
    return api_success(profile, message="Verified.")


# ---------------------------------------------------------------------------
# POST /api/auth/forgot-password        (PUBLIC - this is for someone locked out)
# ---------------------------------------------------------------------------

def _link_generation_failure_hides_account(error):
    """
    Whether a failure from generate_password_reset_link() is (or safely
    might be) Firebase's own way of saying "no account has this email" -
    see forgot_password()'s docstring for why that case has to look
    identical to a real success, and why isinstance-checking
    firebase_auth.UserNotFoundError does not actually catch it.

    Firebase's REST API answers a nonexistent email with HTTP 200 and no
    oobLink field, rather than a distinct error, so this inspects the
    underlying HTTP response the Admin SDK attaches to the exception instead
    of the exception's class. Anything that doesn't match this exact shape
    (no response at all, a non-200 status, a response with no valid JSON
    body) is treated as a genuine infrastructure problem instead, so a real
    account never silently loses its email fallback because of this.
    """
    if isinstance(error, firebase_auth.UserNotFoundError):
        return True

    response = getattr(error, "http_response", None)
    if response is None or response.status_code != 200:
        return False

    try:
        body = response.json()
    except ValueError:
        return False

    return isinstance(body, dict) and "oobLink" not in body


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    Send EcoTrack's own branded password-reset email, if that is configured.

    Body: {"email": "someone@example.com"}

    Returns {"sent": true} when the branded email genuinely went out (or,
    deliberately, when the address does not exist at all - see the note
    below). Returns {"sent": false} whenever the custom email path is not
    available right now, for ANY reason: no RESEND_API_KEY configured, or
    Resend itself rejected the send. Either way the frontend's job is the
    same - fall back to calling Firebase's sendPasswordResetEmail() directly,
    which is what AuthContext.resetPassword() does. This route never returns
    an error status for that fallback case; a plain flag is enough for the
    caller to act on, and a 200 with sent:false is what makes the fall-through
    automatic on the frontend rather than something a network error handler
    has to notice and interpret.

    ACCOUNT ENUMERATION, again - see AuthContext.resetPassword()'s own
    comment for the fuller reasoning. A nonexistent email must produce a
    response indistinguishable from a real success.

    THIS USED TO CATCH firebase_auth.UserNotFoundError, WHICH IS WRONG.
    Firebase's own REST API answers a nonexistent email with HTTP 200 and no
    oobLink field, not a distinct "not found" error - the Admin SDK surfaces
    that as a generic UnexpectedResponseError with no dedicated exception
    type of its own. UserNotFoundError is real, but it is not what this call
    actually raises for that case, so the old code fell into the generic
    `except Exception` branch instead - which returned sent:false. That went
    unnoticed for days because, before RESEND_API_KEY was set, every real
    account ALSO got sent:false (Resend wasn't configured), so there was
    nothing to tell apart. The moment the branded email started actually
    sending, a real account returned sent:true and a fake one sent:false - a
    live, observable leak. Confirmed both ways against a real service
    account before this fix. See _link_generation_failure_hides_account()
    for how this route now tells "no such account" apart from a genuine
    infrastructure failure (bad settings, credentials, network) - the latter
    still has to return sent:false, or a real user hits a backend hiccup and
    silently gets no email at all instead of falling back to Firebase's own.
    """
    body = request.get_json(silent=True) or {}
    email = _clean_text(body.get("email")).lower()

    if not email or not is_valid_email(email):
        return api_error(EMAIL_ERROR, 400, code="invalid_email")

    # Two separate limits, because they guard against two different attacks.
    # By IP: stops one source hammering this route at all (each call sends a
    # real email and costs an Admin SDK link-generation request). By email:
    # stops that same flood from a botnet/rotating-IP source that targets one
    # specific victim's inbox instead - the IP limit alone would not catch
    # that. Checked before the enumeration-safe branches below on purpose:
    # both limiter responses are 429s with no mention of whether the account
    # exists, so being rate-limited reveals nothing an attacker could use.
    if not check_rate_limit("forgot-password-ip", client_ip(), max_attempts=6, window_seconds=900):
        return api_error(
            "Too many requests from this connection. Please wait a few minutes and try again.",
            429,
            code="rate_limited",
        )
    if not check_rate_limit("forgot-password-email", email, max_attempts=3, window_seconds=900):
        return api_error(
            "Too many reset requests for this address. Please wait a few minutes and try again.",
            429,
            code="rate_limited",
        )

    try:
        # generate_password_reset_link() is still the only way to mint a
        # real, valid oobCode - but the URL it RETURNS always routes through
        # Firebase's own generic hosted action page
        # (https://{authDomain}/__/auth/action) first, no matter what
        # ActionCodeSettings says. Confirmed live: handle_code_in_app is for
        # MOBILE deep-linking, not a web bypass switch - opening a real
        # generated link showed Firebase's own unstyled FirebaseUI reset form
        # every time. The actual web bypass (a Console-level "custom action
        # URL") turned out to need a DNS-verified custom domain connected
        # through Firebase Hosting - not available for a project on a plain
        # *.web.app domain, and not something to gate this feature on.
        #
        # So this route does not use Firebase's own link at all - only the
        # oobCode Firebase generates inside it, pulled out below and placed
        # into a URL THIS APP builds and controls, pointing straight at
        # pages/ResetPassword.jsx. Verified live that a code reaches
        # verifyPasswordResetCode()/confirmPasswordReset() identically either
        # way - Firebase validates the code itself, not how the browser got
        # hold of it.
        raw_link = firebase_auth.generate_password_reset_link(email)
        oob_code = parse_qs(urlparse(raw_link).query).get("oobCode", [None])[0]
        if not oob_code:
            raise ValueError("generate_password_reset_link returned no oobCode")
        reset_link = f"{Config.PUBLIC_APP_URL}/reset-password?mode=resetPassword&oobCode={oob_code}"
    except Exception as error:
        if _link_generation_failure_hides_account(error):
            # sent:True here does not mean an email went out - it means
            # "nothing for the caller to learn from this," the same response
            # a real success produces.
            return api_success({"sent": True})
        # A genuine infrastructure problem (bad settings, credentials,
        # network) rather than a signal about whether the account exists -
        # report unavailable so the frontend falls back to Firebase's own
        # email instead of a real user silently getting nothing.
        return api_success({"sent": False})

    sent = send_password_reset_email(email, reset_link)
    return api_success({"sent": sent})


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


# The exact preset set frontend/src/components/Avatar.jsx and AvatarPicker.jsx
# render - kept here too, as a whitelist, because avatarValue for a "preset"
# avatar is otherwise just a client-supplied string with no server-side check
# at all. Every entry here MUST have a matching entry in that frontend list;
# neither file imports the other (one is Python, one is JS), so keep them in
# sync by hand if this set ever changes.
AVATAR_PRESET_IDS = {"leaf", "sprout", "sun", "droplets", "mountain", "flower", "tree", "bird"}


# ---------------------------------------------------------------------------
# PUT /api/auth/profile
# ---------------------------------------------------------------------------

@auth_bp.route("/profile", methods=["PUT"])
@require_auth
def update_profile():
    """
    Update the editable parts of the profile (name, region, the two
    leaderboard-privacy fields, and the avatar).

    Email is deliberately NOT editable here - changing an email address has to
    go through Firebase Auth itself, otherwise the Auth account and the Firestore
    profile would disagree about who the user is.

    Body: {"name": "Aadi S", "region": "Karnataka", "leaderboardOptIn": true,
           "leaderboardAlias": "EcoWarrior", "avatarType": "preset",
           "avatarValue": "leaf"}

    avatarType here is only ever null (clear it, back to plain initials) or
    "preset" (avatarValue must be one of AVATAR_PRESET_IDS). A "custom"
    (uploaded-photo) avatar is deliberately NOT settable through this route
    at all - see POST /api/auth/avatar below, which is the only place
    avatarType ever becomes "custom", using a URL this backend just built
    from its own Storage upload, never one a client could hand it directly.
    An UPDATE here to a "custom" avatarType is rejected for the same reason.
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

    if "leaderboardOptIn" in body:
        updates["leaderboardOptIn"] = bool(body.get("leaderboardOptIn"))

    if "leaderboardAlias" in body:
        alias = _clean_text(body.get("leaderboardAlias"))
        if len(alias) > 24:
            return api_error(
                "Leaderboard name must be 24 characters or fewer.",
                400,
                code="invalid_alias",
            )
        updates["leaderboardAlias"] = alias

    if "publicProfileOptIn" in body:
        updates["publicProfileOptIn"] = bool(body.get("publicProfileOptIn"))

    if "digestFrequency" in body:
        digest_frequency = body.get("digestFrequency")
        if digest_frequency not in ("off", "weekly", "monthly"):
            return api_error(
                "digestFrequency must be off, weekly, or monthly.", 400, code="invalid_digest_frequency"
            )
        updates["digestFrequency"] = digest_frequency

    # avatarType and avatarValue are only ever meaningfully set TOGETHER -
    # checking for either key's presence (not both) is deliberate: it is what
    # lets AvatarPicker.jsx's "Remove" action send just
    # {"avatarType": null, "avatarValue": null} and have both actually clear.
    if "avatarType" in body or "avatarValue" in body:
        avatar_type = body.get("avatarType")
        avatar_value = body.get("avatarValue")

        if avatar_type is None:
            updates["avatarType"] = None
            updates["avatarValue"] = None
        elif avatar_type == "preset":
            if avatar_value not in AVATAR_PRESET_IDS:
                return api_error(
                    "That is not a real avatar option.", 400, code="invalid_avatar_preset"
                )
            updates["avatarType"] = "preset"
            updates["avatarValue"] = avatar_value
        else:
            # Covers "custom" (see this route's own docstring on why that is
            # only ever set by POST /api/auth/avatar, never here) and any
            # other unrecognised value.
            return api_error("Unrecognised avatar type.", 400, code="invalid_avatar_type")

    if not updates:
        return api_error("Nothing to update. Send a name, region, or leaderboard preference.", 400, code="empty_update")

    user_ref.update(updates)  # update() only touches the listed fields

    refreshed = user_ref.get()
    profile = _serialize_user(g.uid, refreshed.to_dict())
    profile["isAdmin"] = is_admin(g.uid, g.email)

    return api_success(profile, message="Profile updated successfully.")


# ---------------------------------------------------------------------------
# POST /api/auth/avatar
# ---------------------------------------------------------------------------

# Matches storage.rules' own 2MB cap - a backstop, not the primary size
# control. AvatarPicker.jsx always downscales+re-encodes to a small square
# JPEG client-side before ever sending it here (the same canvas-based resize
# BillScanner.jsx already does for a bill photo), so a real upload is
# typically well under this; this exists for a request that skips that step.
MAX_AVATAR_BYTES = 2 * 1024 * 1024

# A photo is a slower, heavier ask than a plain profile edit, so it gets its
# own, tighter rate-limit bucket rather than sharing update_profile's.
AVATAR_RATE_LIMIT_MAX = 10
AVATAR_RATE_LIMIT_WINDOW_SECONDS = 3600


@auth_bp.route("/avatar", methods=["POST"])
@require_auth
def upload_avatar():
    """
    Upload a custom avatar photo.

    Body: {"imageBase64": "<base64, no data: prefix>", "mimeType": "image/jpeg"}

    The ONLY route that ever sets avatarType to "custom" - see
    update_profile's own docstring on why that matters (a client can never
    hand this backend an arbitrary external image URL and have it accepted
    as someone's avatar). Uploads to Firebase Storage at a FIXED,
    uid-named path (avatars/{uid}.jpg - AvatarPicker.jsx always re-encodes
    to JPEG before sending, precisely so this path never varies), so a
    second upload always overwrites the first rather than accumulating
    orphaned files. The resulting URL is written straight into the
    Firestore profile in this same request - no separate PUT
    /api/auth/profile call needed afterward.
    """
    if not check_rate_limit("avatar-upload", g.uid, AVATAR_RATE_LIMIT_MAX, AVATAR_RATE_LIMIT_WINDOW_SECONDS):
        return api_error(
            "Too many avatar uploads for now. Try again in a while.",
            429,
            code="avatar_rate_limited",
        )

    body = request.get_json(silent=True) or {}
    mime_type = str(body.get("mimeType", "")).strip().lower()
    image_base64 = body.get("imageBase64")

    # image/jpeg only - see this route's own docstring on why a fixed
    # extension matters. Rejecting anything else here catches a caller that
    # skipped AvatarPicker.jsx's own re-encode step, rather than silently
    # creating a second file at a different path.
    if mime_type != "image/jpeg":
        return api_error("mimeType must be image/jpeg.", 400, code="invalid_mime_type")
    if not image_base64 or not isinstance(image_base64, str):
        return api_error("imageBase64 is required.", 400, code="missing_image")

    try:
        # validate=True rejects anything that is not clean base64 outright,
        # rather than silently dropping bad characters
        image_bytes = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError):
        return api_error("imageBase64 is not valid base64.", 400, code="invalid_base64")

    if len(image_bytes) > MAX_AVATAR_BYTES:
        return api_error(
            f"That image is too large ({len(image_bytes) // 1024} KB). "
            f"Please use one under {MAX_AVATAR_BYTES // (1024 * 1024)} MB.",
            413,
            code="image_too_large",
        )
    if len(image_bytes) == 0:
        return api_error("That image appears to be empty.", 400, code="empty_image")

    db = get_db()
    user_ref = db.collection(Config.COLLECTION_USERS).document(g.uid)
    if not user_ref.get().exists:
        return api_error("No profile found for this account.", 404, code="profile_not_found")

    blob_path = f"avatars/{g.uid}.jpg"

    try:
        bucket = get_storage_bucket()
        blob = bucket.blob(blob_path)
        blob.upload_from_string(image_bytes, content_type="image/jpeg")
    except Exception as error:
        return api_error(f"Could not upload that image: {error}", 502, code="avatar_upload_failed")
    finally:
        # Explicit, even though Python's own garbage collector would get to
        # it anyway - the same statement ingest.py's bill-photo route makes:
        # the bytes are not kept around a moment longer than needed.
        del image_bytes

    # The Firebase Storage REST download URL - governed by storage.rules
    # (allow read: if true for this exact path), not by the underlying GCS
    # bucket's own ACLs, which is why this is built by hand rather than via
    # Blob.public_url (a different, rules-independent access path that a
    # uniform-bucket-level-access bucket like this project's may not even
    # honour). No download token needed: a token is Firebase's bypass for
    # when rules do NOT already allow public read - this path's rule already
    # does, so an anonymous request needs nothing else.
    download_url = (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/"
        f"{quote(blob_path, safe='')}?alt=media"
    )

    user_ref.update({"avatarType": "custom", "avatarValue": download_url})

    refreshed = user_ref.get()
    profile = _serialize_user(g.uid, refreshed.to_dict())
    profile["isAdmin"] = is_admin(g.uid, g.email)

    return api_success(profile, message="Avatar updated.")


# ---------------------------------------------------------------------------
# Data export and account deletion
# ---------------------------------------------------------------------------

def _json_safe(value):
    """
    Recursively turn Firestore's own return types (DatetimeWithNanoseconds,
    plain datetime) into plain JSON-safe values, the same conversion
    _serialize_user already does by hand for a single field. Every OTHER
    route in this backend only ever serializes one flat, known shape at a
    time, so a hand-written field-by-field serializer has always been
    enough; export_data below is the first route returning several whole,
    differently-shaped Firestore documents verbatim, which is what makes a
    generic walker worth having here rather than four more hand-written ones.
    """
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


def _docs_for_user(collection_name, uid, field="userId"):
    """Every document in a collection belonging to this uid, as plain,
    JSON-safe dicts with their document id included."""
    db = get_db()
    docs = (
        db.collection(collection_name)
        .where(filter=gcloud_firestore.FieldFilter(field, "==", uid))
        .stream()
    )
    return [_json_safe({"id": doc.id, **(doc.to_dict() or {})}) for doc in docs]


@auth_bp.route("/export", methods=["GET"])
@require_auth
def export_data():
    """
    Every piece of this account's own data, as one JSON download.

    Reports.jsx's own CSV export covers one chosen period at a time; this is
    everything, ever, in one response - the "download all my data" half of
    the same privacy control delete_account below provides the other half of.
    """
    db = get_db()
    uid = g.uid

    user_doc = db.collection(Config.COLLECTION_USERS).document(uid).get()
    profile = _json_safe(user_doc.to_dict()) if user_doc.exists else {}
    # Never leaked to anyone else via this same shape - see _serialize_user -
    # but this IS the user's own export of their own account, so nothing is
    # stripped from it the way the public-facing profile shape strips things.

    return api_success({
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        # fetch_user_records with no date bounds returns full, unbounded history
        "carbonRecords": fetch_user_records(uid),
        "goals": _docs_for_user(Config.COLLECTION_GOALS, uid),
        "reports": _docs_for_user(Config.COLLECTION_REPORTS, uid),
        "challenges": _docs_for_user(Config.COLLECTION_CHALLENGES, uid),
        "activityReminders": _docs_for_user(Config.COLLECTION_ACTIVITY_REMINDERS, uid),
    })


@auth_bp.route("/account", methods=["DELETE"])
@require_auth
def delete_account():
    """
    Permanently delete this account and every piece of data tied to it.

    ORDER MATTERS: APPLICATION DATA FIRST, THE FIREBASE AUTH IDENTITY LAST
    If the Firebase Auth deletion below ran first and something after it
    then failed, the account would be unrecoverable (no way to sign back in
    to retry) while its data sat orphaned in Firestore forever. Deleting
    every Firestore trace first means the worst failure mode is "the Auth
    account still exists but every trace of the person is already gone" -
    recoverable by simply calling this route again.

    WHAT IS DELETED VS. WHAT IS KEPT
    carbonRecords, goals, reports, challenges, interventions, activity
    templates, activity reminders, the twoFactorCodes doc, and household
    membership (via the exact same _leave_household_for household.py's own
    /leave route uses) are all removed outright. A
    donations row (routes/payments.py) is NOT deleted - it is a real,
    Razorpay-verified financial transaction, and most jurisdictions'
    accounting rules expect those kept - but its userId is cleared, the
    same "keep the record, drop the personal link" treatment a shredded
    paper receipt gets in a filing cabinet.
    """
    db = get_db()
    uid = g.uid

    # --- household membership, via the exact same rules /leave uses ---
    from routes.household import _leave_household_for
    _leave_household_for(uid)

    # --- every collection keyed by userId ---
    for collection_name in (
        Config.COLLECTION_CARBON_RECORDS,
        Config.COLLECTION_GOALS,
        Config.COLLECTION_REPORTS,
        Config.COLLECTION_CHALLENGES,
        Config.COLLECTION_INTERVENTIONS,
        Config.COLLECTION_ACTIVITY_TEMPLATES,
        Config.COLLECTION_ACTIVITY_REMINDERS,
    ):
        for doc in (
            db.collection(collection_name)
            .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
            .stream()
        ):
            doc.reference.delete()

    # --- disassociate, don't delete, financial records ---
    for doc in (
        db.collection("donations")
        .where(filter=gcloud_firestore.FieldFilter("userId", "==", uid))
        .stream()
    ):
        doc.reference.update({"userId": None})

    # --- the two documents keyed directly by uid, not by a userId field ---
    db.collection(Config.COLLECTION_TWO_FACTOR_CODES).document(uid).delete()
    db.collection(Config.COLLECTION_USERS).document(uid).delete()
    db.collection(Config.COLLECTION_ADMINS).document(uid).delete()

    # --- the identity itself, last ---
    try:
        firebase_auth.delete_user(uid)
    except firebase_auth.UserNotFoundError:
        pass  # already gone - not an error from this route's point of view

    return api_success({"deleted": True}, message="Your account and all associated data have been deleted.")
