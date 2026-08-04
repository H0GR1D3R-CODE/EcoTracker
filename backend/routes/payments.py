# EcoTrack/backend/routes/payments.py
"""
Razorpay donation routes - the "Support EcoTrack" flow.

TWO PUBLIC endpoints (no login needed - a visitor should be able to donate):
    POST /api/create-order    ask Razorpay to open an order, return its id
    POST /api/verify-payment  check the signature Razorpay hands back

WHY THE SIGNATURE CHECK MATTERS (worth stating in the viva)
-----------------------------------------------------------
Razorpay Checkout runs in the browser, so its "payment succeeded" callback
cannot be trusted on its own - anyone could POST a fake success to our server.
After a real payment Razorpay signs "order_id|payment_id" with our SECRET key
(which only this server holds). We recompute that HMAC-SHA256 here and compare.
Only a matching signature proves the payment is genuine and untampered, so a
donation is recorded ONLY after that check passes.

TEST vs LIVE
------------
Whichever key pair is in the environment decides the mode - the code is
identical either way. The frontend reads the rzp_test_/rzp_live_ prefix to
decide whether to show its "nothing is really charged" notice.

On test keys, pay with Netbanking (any bank, then Success on the simulated
page) or UPI id success@razorpay. The 4111 1111 1111 1111 test card is REJECTED
on this account with "International cards are not supported": it is registered
as an international Visa, and Indian Razorpay accounts have international
payments off by default.

The KEY_SECRET is read from the environment (config.Config) and never leaves
this server - it is not returned in any response and not sent to the browser.

Mounted at /api (so the paths are /api/create-order and /api/verify-payment).
"""

import hashlib
import hmac
import time

import requests
from flask import Blueprint, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, verify_token

payments_bp = Blueprint("payments", __name__, url_prefix="/api")

# Razorpay's REST endpoint for creating an order. We call it directly rather
# than pulling in the razorpay SDK: it is a single authenticated POST, and
# keeping the dependency list small keeps the serverless build fast and robust.
RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"

# Verified donations are recorded here (the project already uses Firestore, so
# this adds one small collection rather than a whole new datastore).
COLLECTION_DONATIONS = "donations"

MAX_NAME = 60
MAX_EMAIL = 120


def _optional_uid():
    """
    The signed-in donor's uid, or None when nobody is signed in.

    Donating deliberately does not require an account, so this must never block
    the request: a missing, expired or malformed token simply means the donation
    is recorded without an owner.

    The token is still fully verified before its uid is trusted. Taking a uid
    straight from the request body instead would let anyone credit a donation to
    another person's account.
    """
    header = request.headers.get("Authorization", "")
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    decoded_token, error = verify_token(parts[1])
    if error:
        return None

    return decoded_token.get("uid")


def _to_int(value):
    """Best-effort int() that returns None instead of raising."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@payments_bp.route("/create-order", methods=["POST"])
def create_order():
    """
    Create a Razorpay order for a donation.

    Body: {"amount": <paise int>, "currency"?: "INR", "receipt"?: "..."}
    Returns: {"order_id", "amount", "currency", "key"}  (key = public key_id)
    """
    # Server not set up for donations - fail clearly rather than 500 later.
    if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
        return api_error(
            "Donations are not configured on the server.",
            503,
            code="razorpay_unconfigured",
        )

    body = request.get_json(silent=True) or {}

    # --- amount (whole paise) ---
    amount = _to_int(body.get("amount"))
    if amount is None:
        return api_error("Amount must be a whole number of paise.", 400, code="invalid_amount")
    if amount < Config.DONATION_MIN_PAISE:
        return api_error(
            f"Minimum donation is {Config.DONATION_MIN_PAISE} paise (₹1).",
            400,
            code="amount_too_small",
        )
    if amount > Config.DONATION_MAX_PAISE:
        return api_error("That amount is larger than this demo allows.", 400, code="amount_too_large")

    currency = (str(body.get("currency", "INR")).strip().upper() or "INR")[:3]

    # Razorpay caps the receipt field at 40 characters.
    receipt = (str(body.get("receipt", "")).strip() or f"ecotrack_{int(time.time())}")[:40]

    payload = {
        "amount": amount,
        "currency": currency,
        "receipt": receipt,
        "notes": {"purpose": "EcoTrack donation"},
    }

    # --- ask Razorpay to open the order (HTTP Basic auth: key_id / key_secret) ---
    try:
        response = requests.post(
            RAZORPAY_ORDERS_URL,
            json=payload,
            auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET),
            timeout=20,
        )
    except requests.RequestException:
        return api_error(
            "Could not reach the payment provider. Please try again.",
            502,
            code="razorpay_unreachable",
        )

    if response.status_code == 401:
        # Bad / rotated keys on the server side.
        return api_error(
            "Payment provider rejected the server credentials.",
            401,
            code="razorpay_auth_failed",
        )

    if response.status_code >= 400:
        # Surface Razorpay's own description when it gives one.
        detail = ""
        try:
            detail = response.json().get("error", {}).get("description", "")
        except ValueError:
            detail = ""
        return api_error(detail or "Could not create the payment order.", 500, code="razorpay_error")

    order = response.json()
    return api_success(
        {
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            # The public key_id the browser needs to open Checkout. Returning it
            # here means the frontend build does not have to hard-code it.
            "key": Config.RAZORPAY_KEY_ID,
        },
        status=201,
    )


@payments_bp.route("/verify-payment", methods=["POST"])
def verify_payment():
    """
    Verify the signature Razorpay returns after a successful payment.

    Body: {"razorpay_order_id", "razorpay_payment_id", "razorpay_signature", ...}
    Returns 200 only when the signature matches; 400 otherwise (and nothing is
    ever recorded as paid on a mismatch).
    """
    if not Config.RAZORPAY_KEY_SECRET:
        return api_error(
            "Donations are not configured on the server.",
            503,
            code="razorpay_unconfigured",
        )

    body = request.get_json(silent=True) or {}
    order_id = str(body.get("razorpay_order_id", "")).strip()
    payment_id = str(body.get("razorpay_payment_id", "")).strip()
    signature = str(body.get("razorpay_signature", "")).strip()

    # --- all three confirmation fields are required ---
    if not order_id or not payment_id or not signature:
        return api_error("Missing payment confirmation fields.", 400, code="missing_fields")

    # --- recompute the signature: HMAC-SHA256(order_id + "|" + payment_id, secret) ---
    expected = hmac.new(
        Config.RAZORPAY_KEY_SECRET.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # compare_digest is constant-time, so it does not leak how much of the
    # signature matched via timing - the standard way to compare secrets/HMACs.
    if not hmac.compare_digest(expected, signature):
        return api_error("Payment could not be verified.", 400, code="signature_mismatch")

    # Verified. Record the donation as best-effort: a Firestore hiccup must not
    # turn a real, verified payment into an error for the person who just paid.
    try:
        db = get_db()
        db.collection(COLLECTION_DONATIONS).add({
            "razorpayOrderId": order_id,
            "razorpayPaymentId": payment_id,
            "amount": _to_int(body.get("amount")),      # paise; may be None
            "currency": (str(body.get("currency", "INR")).strip().upper() or "INR")[:3],
            "name": str(body.get("name", "")).strip()[:MAX_NAME] or "Anonymous",
            "email": str(body.get("email", "")).strip().lower()[:MAX_EMAIL],
            # None for an anonymous donor. When present it comes from a verified
            # token, never from the request body, so it cannot be spoofed - this
            # is what lets the admin console show a user's own giving history.
            "userId": _optional_uid(),
            "createdAt": gcloud_firestore.SERVER_TIMESTAMP,
        })
    except Exception:
        # Swallow deliberately - the payment is real regardless of our logging.
        pass

    return api_success(
        {"orderId": order_id, "paymentId": payment_id},
        message="Payment verified. Thank you for supporting EcoTrack!",
        status=200,
    )
