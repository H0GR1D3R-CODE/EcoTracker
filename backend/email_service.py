"""
EcoTrack/backend/email_service.py

Sends EcoTrack's own branded transactional emails, currently just the
password-reset email, through Resend's REST API.

WHY THIS FILE EXISTS AT ALL
Firebase Auth can already send a password-reset email on its own - that is
what AuthContext.resetPassword() called before this existed, and it is still
the fallback if this is not configured. But Firebase's own email is fixed:
plain text, no styling, and its "from" line shows the raw project number
("project-551206390925") rather than "EcoTrack" until the Firebase project's
own public-facing name is set - see the console-side fix documented alongside
this feature. This file exists to send something that actually looks like it
came from EcoTrack, once an admin has provided the means to send it.

HOW THE LINK ITSELF IS BUILT
Firebase Admin SDK's auth.generate_password_reset_link() creates a real,
working reset link WITHOUT sending any email - which is exactly the split
this needs: the backend generates the link, then hands it to Resend instead
of letting Firebase email it automatically. routes/auth.py's forgot_password
does NOT use that generated link's own URL, though - it always routes
through Firebase's generic hosted action page first
(https://{authDomain}/__/auth/action), confirmed live, regardless of
ActionCodeSettings. Instead, forgot_password pulls just the oobCode out of
that link and builds its own URL pointing straight at THIS app's
/reset-password page - see that route's own comment for the fuller story of
why (a Console-level "custom action URL" was the documented way around
Firebase's hosted page, and it needs a DNS-verified custom domain this
project does not have). See frontend/src/pages/ResetPassword.jsx for what
happens once someone lands there.

THIS IS OPTIONAL, NOT REQUIRED
Every function here degrades honestly: if RESEND_API_KEY is not set,
send_password_reset_email() returns False immediately and touches the network
not at all. The caller (routes/auth.py) is expected to treat False as "the
custom email path is unavailable right now", not as an error - the same shape
as how routes/assistant.py treats a missing GROQ_API_KEY.
"""

import base64
import re
from datetime import datetime

import requests

from config import Config

RESEND_API_URL = "https://api.resend.com/emails"

# Served as a static file from frontend/public/email/ (Vite copies public/ into
# the build untouched), so this is live at PUBLIC_APP_URL/email/... the moment
# the frontend is deployed - no separate asset host needed. Built by
# generate_reset_animation.py: a ring draws itself closed, in the brand green,
# with an amber leading dot matching the calibration rail's own needle, then a
# checkmark draws inside it - "request received", not "password already
# changed", which the marker line beside it in the email says outright so the
# two can never be read as the same thing.
RESET_EMAIL_ANIMATION_PATH = "/email/reset-confirm.gif"

# Resend, like most transactional email APIs, times out slowly under load
# rather than failing fast - capped so a slow provider cannot hang a request
# that a user is actively waiting on.
REQUEST_TIMEOUT_SECONDS = 10


def _reset_email_html(reset_link, recipient_email):
    """
    The branded HTML body for a password-reset email.

    Built to survive real email clients, not just a browser: a single
    centred table-free block, inline styles only (Gmail and Outlook both
    strip <style> blocks in the <head>), an email-safe font stack standing in
    for the site's actual display face (custom @font-face is unreliable in
    mail), and a plain-text fallback link under the button for clients that
    do not render it as a link at all.

    Colours are the LIGHT theme's values, not whichever theme the app is
    currently in for this user - there is no reliable way to read a
    recipient's OS/app theme preference from inside an email client, and a
    light background is the safe default every mail client renders correctly.
    """
    return f"""\
<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background-color:#f5f3ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px; text-align:center;">
          <span style="font-size:22px; font-weight:700; color:#1f7a44; letter-spacing:-0.02em;">
            &#127807; EcoTrack
          </span>
        </td>
      </tr>
      <tr>
        <td style="background-color:#fdfcf8; border:1px solid rgba(31,42,26,0.12); border-radius:14px; padding:36px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
            <tr>
              <td align="center">
                <img src="{Config.PUBLIC_APP_URL}{RESET_EMAIL_ANIMATION_PATH}"
                     width="88" height="88" alt=""
                     style="display:block; width:88px; height:88px; border:0;" />
              </td>
            </tr>
          </table>
          <p style="margin:0 0 20px; text-align:center; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
            Request received
          </p>
          <p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
            Password reset
          </p>
          <h1 style="margin:0 0 16px; font-size:26px; line-height:1.2; font-weight:700; color:#1e2a1d;">
            Reset your password
          </h1>
          <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#5f6b58;">
            Someone asked to reset the password for the EcoTrack account at
            <strong style="color:#1e2a1d;">{recipient_email}</strong>. If that
            was you, choose a new one below.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td style="border-radius:10px; background-color:#1f7a44;">
                <a href="{reset_link}"
                   style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
                  Choose a new password
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 4px; font-size:13px; color:#5f6b58;">
            Or paste this link into your browser:
          </p>
          <p style="margin:0 0 24px; font-size:12px; line-height:1.6; word-break:break-all; font-family:'Courier New',Courier,monospace; color:#966000;">
            {reset_link}
          </p>
          <p style="margin:0; padding-top:20px; border-top:1px solid rgba(31,42,26,0.1); font-size:13px; line-height:1.6; color:#5f6b58;">
            This link expires soon and can only be used once. If you did not
            request this, no action is needed - your password has not been
            changed and you can safely ignore this email.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#5f6b58;">
            EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG&nbsp;13
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _reset_email_text(reset_link, recipient_email):
    """The plain-text half of the email, for clients that show it and for
    anyone whose mail client renders text before (or instead of) HTML."""
    return (
        f"Reset your EcoTrack password\n\n"
        f"Someone asked to reset the password for the EcoTrack account at "
        f"{recipient_email}. If that was you, open this link to choose a new one:\n\n"
        f"{reset_link}\n\n"
        f"This link expires soon and can only be used once. If you did not "
        f"request this, no action is needed - your password has not been "
        f"changed."
    )


def send_password_reset_email(recipient_email, reset_link):
    """
    Send the branded reset email through Resend.

    Returns True once Resend has accepted the email for delivery, False if
    the custom email path is unavailable or the send itself failed for any
    reason. False is not an error the caller needs to report - see this
    file's own module docstring for why: the caller always has Firebase's
    default email as a working fallback.
    """
    if not Config.RESEND_API_KEY:
        return False

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": "Reset your EcoTrack password",
        "html": _reset_email_html(reset_link, recipient_email),
        "text": _reset_email_text(reset_link, recipient_email),
    }

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {Config.RESEND_API_KEY}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        # Network trouble reaching Resend - fall back rather than fail the request
        return False

    # 2xx means Resend accepted it. Anything else (401 bad key, 403 the
    # recipient is outside an unverified sandbox domain, 422 bad payload) is
    # logged for whoever reads the server console, but still degrades to the
    # Firebase fallback rather than leaving the user with no email at all.
    if response.status_code >= 200 and response.status_code < 300:
        return True

    print(
        f"[EcoTrack] Resend could not send the reset email "
        f"(HTTP {response.status_code}): {response.text[:300]}"
    )
    return False


# ---------------------------------------------------------------------------
# TWO-STEP VERIFICATION CODE
#
# Sent from routes/auth.py's login() when the signing-in account has 2FA
# turned on (see Profile). No animation like the other two emails: the code
# itself is the whole point of opening this email fast, so the design puts it
# straight in a large mono readout - the exact same visual language
# (--readout amber, tabular-nums) the live app uses for every measured
# number - rather than making someone wait on an illustration first.
# ---------------------------------------------------------------------------


def _two_factor_email_html(code):
    """The branded HTML body for a two-step verification code email."""
    spaced_code = " ".join(code)  # "482913" -> "4 8 2 9 1 3", easier to read at a glance
    return f"""\
<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background-color:#f5f3ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px; text-align:center;">
          <span style="font-size:22px; font-weight:700; color:#1f7a44; letter-spacing:-0.02em;">
            &#127807; EcoTrack
          </span>
        </td>
      </tr>
      <tr>
        <td style="background-color:#fdfcf8; border:1px solid rgba(31,42,26,0.12); border-radius:14px; padding:36px 32px; text-align:center;">
          <p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
            Two-step verification
          </p>
          <h1 style="margin:0 0 20px; font-size:24px; line-height:1.3; font-weight:700; color:#1e2a1d;">
            Your sign-in code
          </h1>
          <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#5f6b58;">
            Enter this code on the sign-in screen to finish getting into your EcoTrack account.
          </p>
          <div style="margin:0 0 24px; padding:18px; background-color:#f5f3ec; border-radius:10px; font-family:'Courier New',Courier,monospace; font-size:34px; font-weight:700; letter-spacing:0.15em; color:#966000;">
            {spaced_code}
          </div>
          <p style="margin:0; font-size:13px; line-height:1.6; color:#5f6b58;">
            This code expires in 10 minutes and can only be used once. If you
            did not just try to sign in to EcoTrack, you can safely ignore this
            email - your account is still secure.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#5f6b58;">
            EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG&nbsp;13
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _two_factor_email_text(code):
    return (
        f"Your EcoTrack sign-in code is: {code}\n\n"
        f"Enter it on the sign-in screen to finish getting into your account. "
        f"It expires in 10 minutes and can only be used once.\n\n"
        f"If you did not just try to sign in to EcoTrack, you can safely ignore "
        f"this email - your account is still secure."
    )


def send_two_factor_code_email(recipient_email, code):
    """
    Send a two-step verification code through Resend.

    Same degrade-honestly shape as send_password_reset_email(): returns False
    with no network call when RESEND_API_KEY is not set, and False on any send
    failure. UNLIKE the other two emails, the caller (routes/auth.py's login())
    does NOT treat False as "fall back to a different delivery path" - there is
    no equivalent to Firebase's own reset email for a one-off numeric code, so
    it treats False as "the code could not be delivered, do not gate this
    sign-in on a code nobody can receive" and lets the sign-in through instead.
    A half-delivered security feature that permanently locks someone out of
    their own account is worse than the feature not applying that one time -
    the same reasoning RECAPTCHA_SECRET_KEY and GROQ_API_KEY already use
    elsewhere in this backend.
    """
    if not Config.RESEND_API_KEY:
        return False

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": f"{code} is your EcoTrack verification code",
        "html": _two_factor_email_html(code),
        "text": _two_factor_email_text(code),
    }

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {Config.RESEND_API_KEY}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return False

    if response.status_code >= 200 and response.status_code < 300:
        return True

    print(
        f"[EcoTrack] Resend could not send the verification code email "
        f"(HTTP {response.status_code}): {response.text[:300]}"
    )
    return False


# ---------------------------------------------------------------------------
# DONATION THANK-YOU EMAIL
#
# Sent from routes/payments.py's verify_payment(), best-effort, only once a
# donation has already passed Razorpay's signature check - this email never
# gates or delays the verified-payment response, same pattern as the
# Firestore write beside it.
# ---------------------------------------------------------------------------

# Built by generate_donation_animation.py: a stem grows out of the soil and
# two leaves unfurl, in the brand green - "your donation, growing into
# something" - a deliberately different animation from the reset email's
# ring-and-checkmark so the two do not read as the same template re-skinned.
DONATION_EMAIL_ANIMATION_PATH = "/email/donation-thanks.gif"

# Same two photos already curated for the on-site thank-you screen
# (frontend/src/utils/photos.js: PHOTOS.ancientTree / PHOTOS.seedlings) -
# reused here rather than re-picked, so the email and the page tell the same
# visual story. Unsplash's own CDN, same url pattern photoUrl() builds there.
_DONATION_HERO_PHOTO = (
    "https://images.unsplash.com/photo-1518495973542-4542c06a5843"
    "?auto=format&fit=crop&w=1200&q=70"
)
_DONATION_SEEDLING_PHOTO = (
    "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735"
    "?auto=format&fit=crop&w=800&q=70"
)

# The same four organisations Donate.jsx forwards contributions to, with the
# same one-line descriptions - keep these in sync with PARTNERS in
# frontend/src/pages/Donate.jsx if that copy ever changes.
_DONATION_PARTNERS = [
    ("One Tree Planted", "Reforestation",
     "Plants trees worldwide to restore habitat and pull carbon back out of the air."),
    ("Cool Earth", "Rainforest protection",
     "Backs the people who live in rainforests to keep them standing."),
    ("Clean Air Task Force", "Cutting emissions",
     "Pushes the clean-energy technology and policy that drives emissions down at scale."),
    ("Gold Standard", "Verified offsets",
     "Certifies offset projects, so a contribution provably removes greenhouse gases."),
]

# One Tree Planted's own published rate is one tree per US$1; Donate.jsx's own
# PRESETS convert that at roughly Rs88/$1 and round down so the page never
# over-promises. This mirrors that exact rule for arbitrary custom amounts.
_RUPEES_PER_TREE = 88


def _tree_impact(rupees):
    """About how many trees a rupee amount becomes, or None below one tree."""
    trees = int(rupees // _RUPEES_PER_TREE)
    return trees if trees > 0 else None


def _receipt_number(payment_id, when=None):
    """
    The exact same rule as Donate.jsx's own receiptNumber(), in Python.

    when is the donation's own timestamp, not "now" - Donate.jsx's version
    takes the same `when` argument for exactly this reason: a receipt
    requested or resent in a later calendar year than the donation itself
    (a delayed email retry, a "download receipt" click months on) must
    still show the year the money actually moved, or the same payment would
    carry two different receipt numbers depending only on when a document
    happened to be generated.
    """
    tail = re.sub(r"[^a-zA-Z0-9]", "", payment_id or "")[-6:].upper()
    year = (when or datetime.now()).year
    return f"ECO-{year}-{tail or '000000'}"


def _donation_email_html(name, rupees, currency, payment_id, when=None):
    """
    The branded HTML body for a donation thank-you email.

    Same email-safe constraints as the reset email (inline styles only,
    light-theme colours, no custom @font-face) - see _reset_email_html's own
    docstring for why.
    """
    display_name = name.strip() if name and name.strip() and name.strip().lower() != "anonymous" else "you"
    trees = _tree_impact(rupees) if currency.upper() == "INR" else None
    receipt = _receipt_number(payment_id, when)
    amount_display = f"{rupees:,.2f}"

    if trees:
        impact_line = (
            f"That is enough to fund about <strong style=\"color:#1e2a1d;\">{trees} "
            f"tree{'s' if trees != 1 else ''}</strong> through One Tree Planted, on top of "
            f"whatever Cool Earth, Clean Air Task Force and Gold Standard can do with the rest."
        )
    else:
        impact_line = (
            "Every rupee of it is on its way to reforestation, rainforest protection, "
            "clean-air work and verified carbon offsets - see exactly where below."
        )

    partner_rows = "".join(
        f"""
          <tr>
            <td style="padding:14px 0; border-top:1px solid rgba(31,42,26,0.1);">
              <p style="margin:0 0 3px; font-size:14px; font-weight:700; color:#1e2a1d;">{pname}
                <span style="font-weight:500; color:#5f6b58; font-size:12px;"> &middot; {focus}</span>
              </p>
              <p style="margin:0; font-size:13px; line-height:1.55; color:#5f6b58;">{body}</p>
            </td>
          </tr>"""
        for pname, focus, body in _DONATION_PARTNERS
    )

    return f"""\
<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background-color:#f5f3ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px; text-align:center;">
          <span style="font-size:22px; font-weight:700; color:#1f7a44; letter-spacing:-0.02em;">
            &#127807; EcoTrack
          </span>
        </td>
      </tr>
      <tr>
        <td style="background-color:#fdfcf8; border:1px solid rgba(31,42,26,0.12); border-radius:14px; padding:0; overflow:hidden;">
          <img src="{_DONATION_HERO_PHOTO}" width="480" alt="Sunlight bursting through the canopy of a huge old tree"
               style="display:block; width:100%; height:180px; object-fit:cover; border:0;" />
          <div style="padding:32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
              <tr>
                <td align="center">
                  <img src="{Config.PUBLIC_APP_URL}{DONATION_EMAIL_ANIMATION_PATH}"
                       width="96" height="96" alt=""
                       style="display:block; width:96px; height:96px; border:0;" />
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px; text-align:center; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
              Donation received
            </p>
            <h1 style="margin:0 0 16px; text-align:center; font-size:26px; line-height:1.2; font-weight:700; color:#1e2a1d;">
              Thank you, {display_name}.
            </h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#5f6b58;">
              Your gift of <strong style="color:#1e2a1d;">&#8377;{amount_display}</strong> to EcoTrack is
              being forwarded, minus only the payment processor's fee, to four established climate
              organisations. {impact_line}
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
              {partner_rows}
            </table>
          </div>
          <img src="{_DONATION_SEEDLING_PHOTO}" width="480" alt="Seedlings sprouting in a soil tray"
               style="display:block; width:100%; height:150px; object-fit:cover; border:0;" />
          <div style="padding:24px 32px 32px;">
            <p style="margin:0 0 4px; font-size:11px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:#5f6b58;">
              Receipt
            </p>
            <p style="margin:0; font-size:13px; line-height:1.8; color:#5f6b58;">
              No. <span style="color:#1e2a1d; font-family:'Courier New',Courier,monospace;">{receipt}</span><br />
              Payment ref <span style="color:#1e2a1d; font-family:'Courier New',Courier,monospace;">{payment_id}</span>
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#5f6b58;">
            EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG&nbsp;13
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _donation_email_text(name, rupees, currency, payment_id, when=None):
    display_name = name.strip() if name and name.strip() and name.strip().lower() != "anonymous" else "you"
    trees = _tree_impact(rupees) if currency.upper() == "INR" else None
    receipt = _receipt_number(payment_id, when)
    amount_display = f"{rupees:,.2f}"

    impact_line = (
        f"That funds about {trees} tree{'s' if trees != 1 else ''} through One Tree Planted, "
        f"plus whatever Cool Earth, Clean Air Task Force and Gold Standard can do with the rest."
        if trees
        else "It is on its way to reforestation, rainforest protection, clean-air work and verified carbon offsets."
    )

    partner_lines = "\n".join(
        f"- {pname} ({focus}): {body}" for pname, focus, body in _DONATION_PARTNERS
    )

    return (
        f"Thank you, {display_name}.\n\n"
        f"Your gift of Rs {amount_display} to EcoTrack is being forwarded, minus only the "
        f"payment processor's fee, to four established climate organisations. {impact_line}\n\n"
        f"{partner_lines}\n\n"
        f"Receipt no. {receipt}\n"
        f"Payment ref {payment_id}\n"
    )


def _leaf_path(canvas_obj, cx, cy, size):
    """A simple vesica/almond leaf shape (two mirrored bezier curves meeting
    at a point top and bottom) - the same construction generate_app_icons.py's
    _leaf_path uses for the mobile icon, redone here with reportlab's own
    Path object since PIL's polygon fill is not available inside a PDF
    canvas. Returns the Path so the caller decides fill colour."""
    path = canvas_obj.beginPath()
    path.moveTo(cx, cy - size)
    path.curveTo(cx + size * 0.95, cy - size * 0.35, cx + size * 0.95, cy + size * 0.35, cx, cy + size)
    path.curveTo(cx - size * 0.95, cy + size * 0.35, cx - size * 0.95, cy - size * 0.35, cx, cy - size)
    path.close()
    return path


def _donation_receipt_pdf_bytes(name, rupees, currency, payment_id, order_id, receipt, when):
    """
    A one-page, branded PDF of the donation receipt shown on Donate.jsx's
    own thank-you screen - built with reportlab (pure Python, no system
    libraries a serverless function would need to have preinstalled, unlike
    e.g. WeasyPrint's Cairo/Pango dependency).

    Deliberately the SAME document for two different callers: attached to
    the thank-you email below, and served standalone by
    GET /api/donation-receipt/<payment_id> for the "Download receipt"
    button - one design, not two documents that could quietly drift apart.

    Colours are the exact hex values _donation_email_html already uses, so
    the emailed PDF, the attached PDF and the on-screen receipt all read as
    the same document rather than three different ideas of "EcoTrack green".
    No custom fonts embedded, for the same reason the HTML email uses none -
    Helvetica is guaranteed present in any PDF reader without shipping font
    files into a serverless function's deploy bundle.
    """
    from io import BytesIO

    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    GREEN = colors.HexColor("#1f7a44")
    DARK = colors.HexColor("#1e2a1d")
    MUTED = colors.HexColor("#5f6b58")
    CARD = colors.HexColor("#fdfcf8")
    PAGE_BG = colors.HexColor("#f5f3ec")
    RULE = colors.HexColor("#e4e0d3")

    # The same four accent hues _DONATION_PARTNERS' rows use nowhere else
    # yet - straight off the app's own category ramp (index.css), so a
    # printed page still reads as this product's palette, not a generic one.
    PARTNER_ACCENTS = [GREEN, colors.HexColor("#2c6577"), colors.HexColor("#8a5116"), colors.HexColor("#6a5480")]

    page_width, page_height = A4
    header_height = 118
    buffer = BytesIO()

    def _draw_header(canvas_obj, _doc):
        canvas_obj.saveState()
        # Cream page background, full bleed - reportlab's default is white.
        canvas_obj.setFillColor(PAGE_BG)
        canvas_obj.rect(0, 0, page_width, page_height, fill=1, stroke=0)

        # The green header band.
        canvas_obj.setFillColor(GREEN)
        canvas_obj.rect(0, page_height - header_height, page_width, header_height, fill=1, stroke=0)

        # A small white leaf mark, left of the wordmark.
        canvas_obj.setFillColor(colors.white)
        leaf = _leaf_path(canvas_obj, 62, page_height - header_height / 2 + 2, 11)
        canvas_obj.drawPath(leaf, fill=1, stroke=0)

        canvas_obj.setFillColor(colors.white)
        canvas_obj.setFont("Helvetica-Bold", 20)
        canvas_obj.drawString(82, page_height - header_height / 2 - 3, "EcoTrack")

        canvas_obj.setFont("Helvetica", 9)
        canvas_obj.setFillColor(colors.HexColor("#d7ecdf"))
        canvas_obj.drawString(82, page_height - header_height / 2 - 18, "DONATION RECEIPT")

        canvas_obj.setFont("Helvetica-Bold", 11)
        canvas_obj.setFillColor(colors.white)
        canvas_obj.drawRightString(page_width - 50, page_height - header_height / 2 - 3, receipt)
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setFillColor(colors.HexColor("#d7ecdf"))
        canvas_obj.drawRightString(
            page_width - 50, page_height - header_height / 2 - 18,
            when.strftime("%d %b %Y, %H:%M"),
        )
        canvas_obj.restoreState()

    styles = {
        "headline": ParagraphStyle("headline", fontName="Helvetica-Bold", fontSize=22, textColor=DARK, leading=26),
        "amount": ParagraphStyle("amount", fontName="Helvetica-Bold", fontSize=34, textColor=GREEN, leading=38),
        "caption": ParagraphStyle("caption", fontName="Helvetica", fontSize=9, textColor=MUTED, leading=13),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10, textColor=MUTED, leading=15),
        "sectionLabel": ParagraphStyle(
            "sectionLabel", fontName="Helvetica-Bold", fontSize=9, textColor=MUTED, leading=12,
        ),
        "partnerName": ParagraphStyle("partnerName", fontName="Helvetica-Bold", fontSize=10.5, textColor=DARK, leading=14),
        "partnerBody": ParagraphStyle("partnerBody", fontName="Helvetica", fontSize=8.5, textColor=MUTED, leading=12.5),
        "footer": ParagraphStyle("footer", fontName="Helvetica", fontSize=7.5, textColor=MUTED, leading=11),
        "brand": ParagraphStyle("brand", fontName="Helvetica", fontSize=8, textColor=MUTED, alignment=TA_CENTER),
    }

    display_name = name.strip() if name and name.strip() and name.strip().lower() != "anonymous" else "you"
    trees = _tree_impact(rupees) if currency.upper() == "INR" else None
    # "Rs", not "₹" - the built-in Helvetica the PDF uses (no embedded font,
    # same reasoning as the HTML email's "no custom @font-face") only covers
    # WinAnsi/Latin-1, which has no rupee sign glyph; it silently renders as
    # a solid block instead of erroring, so this only shows up by looking.
    amount_display = f"Rs {rupees:,.2f}" if currency.upper() == "INR" else f"{currency.upper()} {rupees:,.2f}"

    story = [
        Spacer(1, 14),
        Paragraph(f"Thank you, {display_name}.", styles["headline"]),
        Spacer(1, 6),
        Paragraph(amount_display, styles["amount"]),
        Paragraph("forwarded in full, less the processing fee", styles["caption"]),
        Spacer(1, 16),
    ]

    if trees:
        story.append(
            Paragraph(
                f"That funds about <b><font color='#1e2a1d'>{trees} tree{'s' if trees != 1 else ''}</font></b> "
                f"through One Tree Planted, on top of whatever Cool Earth, Clean Air Task Force and "
                f"Gold Standard can do with the rest.",
                styles["body"],
            )
        )
        story.append(Spacer(1, 16))

    usable_width = page_width - 100  # page width minus the doc's own left+right margins

    detail_rows = [
        ["Receipt no.", receipt],
        ["Donor", name.strip() or "Anonymous"],
        ["Payment ref", payment_id],
        ["Order ref", order_id or "—"],
    ]
    detail_table = Table(
        [[Paragraph(label, styles["sectionLabel"]), Paragraph(str(value), styles["body"])] for label, value in detail_rows],
        colWidths=[110, usable_width - 110],
    )
    detail_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 0), (-1, -2), 0.5, RULE),
        ])
    )
    story.append(detail_table)
    story.append(Spacer(1, 20))
    story.append(Paragraph("WHERE THIS GOES", styles["sectionLabel"]))
    story.append(Spacer(1, 8))

    for index, (pname, focus, body) in enumerate(_DONATION_PARTNERS):
        accent = PARTNER_ACCENTS[index % len(PARTNER_ACCENTS)]
        text_cell = Paragraph(
            f"<font color='#1e2a1d'><b>{pname}</b></font> "
            f"<font color='#5f6b58' size='8'>&middot; {focus}</font><br/>"
            f"{body}",
            styles["partnerBody"],
        )
        # A coloured left accent bar next to the text, the same idea as the
        # on-screen partner cards' category-coloured left edge - one flat
        # 2-column row, not a table nested inside a table (which, at this
        # bar's 4pt width, leaves negative room once padding is subtracted
        # and reportlab raises rather than silently clipping).
        bar_and_text = Table([["", text_cell]], colWidths=[4, usable_width - 4])
        bar_and_text.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (0, 0), accent),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("RIGHTPADDING", (0, 0), (0, 0), 0),
            ("LEFTPADDING", (1, 0), (1, 0), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(bar_and_text)
        story.append(Spacer(1, 6))

    story.append(Spacer(1, 14))
    story.append(
        Paragraph(
            "This is a payment receipt, not a tax-exemption certificate - EcoTrack is a student "
            "project and is not registered for 80G. Donations are forwarded to the organisations "
            "listed above, less Razorpay's processing fee. Keep this reference for any query about "
            "the payment.",
            styles["footer"],
        )
    )
    story.append(Spacer(1, 18))
    story.append(Paragraph("EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG 13", styles["brand"]))

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=header_height + 24,
        leftMargin=50,
        rightMargin=50,
        bottomMargin=40,
        title=f"EcoTrack donation receipt {receipt}",
    )
    doc.build(story, onFirstPage=_draw_header, onLaterPages=_draw_header)

    return buffer.getvalue()


def build_donation_receipt_pdf(name, amount_paise, currency, payment_id, order_id, when):
    """
    Public entry point for both callers below - resolves the shared receipt
    number the same way _donation_email_html does, then hands off to the
    actual PDF builder. Kept separate from _donation_receipt_pdf_bytes so a
    caller never has to compute the receipt number itself and risk it
    drifting from _receipt_number's own rule.
    """
    rupees = (amount_paise or 0) / 100
    receipt = _receipt_number(payment_id, when)
    return _donation_receipt_pdf_bytes(name, rupees, currency or "INR", payment_id, order_id, receipt, when)


def send_donation_thank_you_email(recipient_email, name, amount_paise, currency, payment_id, order_id=None, when=None):
    """
    Send the branded donation thank-you email through Resend, with the same
    branded PDF receipt GET /api/donation-receipt/<payment_id> serves,
    attached - "thanks in the email" alone left the receipt itself only
    reachable by going back to the website, which defeats the point of
    emailing it in the first place.

    Degrades exactly like send_password_reset_email(): returns False with no
    network call when RESEND_API_KEY is not set, and False on any send
    failure - a missing thank-you email must never turn a verified payment
    into an error response for someone who has just paid.
    """
    if not Config.RESEND_API_KEY:
        return False

    rupees = (amount_paise or 0) / 100
    currency = currency or "INR"
    when = when or datetime.now()

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": "Thank you for your donation to EcoTrack",
        "html": _donation_email_html(name, rupees, currency, payment_id, when),
        "text": _donation_email_text(name, rupees, currency, payment_id, when),
    }

    # A failure building the PDF (a reportlab bug, a weird name/amount edge
    # case) must not cost the donor their thank-you email entirely - send it
    # without the attachment rather than not at all.
    try:
        pdf_bytes = build_donation_receipt_pdf(name, amount_paise, currency, payment_id, order_id, when)
        payload["attachments"] = [{
            "filename": f"EcoTrack-Receipt-{_receipt_number(payment_id, when)}.pdf",
            "content": base64.b64encode(pdf_bytes).decode("ascii"),
        }]
    except Exception as error:
        print(f"[EcoTrack] Could not build the donation receipt PDF: {error}")

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {Config.RESEND_API_KEY}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return False

    if response.status_code >= 200 and response.status_code < 300:
        return True

    print(
        f"[EcoTrack] Resend could not send the donation thank-you email "
        f"(HTTP {response.status_code}): {response.text[:300]}"
    )
    return False


# ---------------------------------------------------------------------------
# ADMIN INVITATION EMAIL
#
# Sent from routes/admin.py's invite_admin() - an existing admin adding
# someone new to ADMIN_EMAILS and telling them so, in one action. Unlike the
# other three emails, there is no Firebase-generated link and no fallback:
# this one is purely informational, so if RESEND_API_KEY is not set the
# route just says the address was granted access and to tell them yourself.
# ---------------------------------------------------------------------------

# Same two photos already curated for the site itself (frontend/src/utils/
# photos.js) - the console's own banner (PageBanner photo="adminBanner" on
# AdminDashboard.jsx) as the hero, so the email visually matches the exact
# page the recipient is about to open, then Earth from space (Dashboard's
# own "the bigger picture" framing) as the closing image - the console is
# instrumentation FOR that picture, not the point in itself.
_ADMIN_INVITE_HERO_PHOTO = (
    "https://images.unsplash.com/photo-1609609018625-afef0a259159"
    "?auto=format&fit=crop&w=1200&q=70"
)
_ADMIN_INVITE_MISSION_PHOTO = (
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa"
    "?auto=format&fit=crop&w=800&q=70"
)

# What ADMIN_CONSOLE_GUIDE in routes/assistant.py tells the in-app assistant
# about the console's own seven tabs - kept short and skimmable here, not
# copied verbatim, since an invite is read once and skimmed, not consulted.
_ADMIN_CONSOLE_CAPABILITIES = [
    "Platform-wide stats - users, records, emissions, goal success rate",
    "Growth trends - sign-ups over time, regions, the most active users",
    "One combined activity feed - every sign-up, donation and feedback message",
    "The full user directory, with a drill-down into any one account",
    "Feedback, donations, and a live health check of every service EcoTrack depends on",
    "The research dashboard - real adoption-rate figures from the evaluation harness",
]


def _greeting_name(name=None):
    """
    The invite's opening line, personalised only when a real name was
    actually given.

    Deliberately does NOT guess a name from the email's local part -
    tried exactly that against "kaustubhgr05@gmail.com" while building
    this, and a plain "first run of letters" match absorbed what are
    almost certainly surname initials into "Kaustubhgr", which is worse
    than no name at all. A wrong guess in a formal invite reads as
    careless in a way a generic-but-correct greeting does not.
    """
    if name and name.strip():
        return f", {name.strip().split()[0]}"
    return ""


def _admin_invite_email_html(recipient_email, invited_name, invited_by_email):
    """
    The branded HTML body for an admin-invitation email.

    Same email-safe constraints as every other template in this file (inline
    styles only, light-theme colours, no custom @font-face) - see
    _reset_email_html's own docstring for why.
    """
    greeting_name = _greeting_name(invited_name)
    login_url = f"{Config.PUBLIC_APP_URL}/login"
    register_url = f"{Config.PUBLIC_APP_URL}/register"

    capability_rows = "".join(
        f"""
          <tr>
            <td style="padding:9px 0; border-top:1px solid rgba(31,42,26,0.1); font-size:13px; line-height:1.55; color:#5f6b58;">
              <span style="color:#1f7a44;">&#10003;</span>&nbsp; {capability}
            </td>
          </tr>"""
        for capability in _ADMIN_CONSOLE_CAPABILITIES
    )

    return f"""\
<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background-color:#f5f3ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px; text-align:center;">
          <span style="font-size:22px; font-weight:700; color:#1f7a44; letter-spacing:-0.02em;">
            &#127807; EcoTrack
          </span>
        </td>
      </tr>
      <tr>
        <td style="background-color:#fdfcf8; border:1px solid rgba(31,42,26,0.12); border-radius:14px; padding:0; overflow:hidden;">
          <img src="{_ADMIN_INVITE_HERO_PHOTO}" width="480" alt="Aerial view of a city lit up at night"
               style="display:block; width:100%; height:180px; object-fit:cover; border:0;" />
          <div style="padding:32px;">
            <p style="margin:0 0 8px; text-align:center; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
              Admin access granted
            </p>
            <h1 style="margin:0 0 16px; text-align:center; font-size:26px; line-height:1.2; font-weight:700; color:#1e2a1d;">
              You're invited to help run EcoTrack{greeting_name}.
            </h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#5f6b58;">
              <strong style="color:#1e2a1d;">{invited_by_email}</strong> has added
              <strong style="color:#1e2a1d;">{recipient_email}</strong> as an administrator
              on EcoTrack - the carbon-tracking platform measuring real footprints against
              published DEFRA, IPCC and CEA emission factors, built around UN SDG&nbsp;13.
              As an admin you'll have access to:
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
              {capability_rows}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
              <tr>
                <td style="border-radius:10px; background-color:#1f7a44;">
                  <a href="{login_url}"
                     style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
                    Sign in to the console
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0; text-align:center; font-size:12px; line-height:1.6; color:#5f6b58;">
              New here? <a href="{register_url}" style="color:#1f7a44;">Create an account</a>
              at this exact address first - admin access applies the moment you sign in
              with it, nothing further to set up.
            </p>
          </div>
          <img src="{_ADMIN_INVITE_MISSION_PHOTO}" width="480" alt="The Earth seen from space"
               style="display:block; width:100%; height:150px; object-fit:cover; border:0;" />
          <div style="padding:24px 32px 32px;">
            <p style="margin:0; font-size:13px; line-height:1.6; color:#5f6b58;">
              Admin access is scoped to the console only - it cannot see anyone's password,
              and every action taken there is logged. If this was not something you expected,
              you can simply ignore this email; nothing further happens automatically.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#5f6b58;">
            EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG&nbsp;13
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _admin_invite_email_text(recipient_email, invited_name, invited_by_email):
    greeting_name = _greeting_name(invited_name)
    capability_lines = "\n".join(f"- {c}" for c in _ADMIN_CONSOLE_CAPABILITIES)
    return (
        f"You're invited to help run EcoTrack{greeting_name}.\n\n"
        f"{invited_by_email} has added {recipient_email} as an administrator on "
        f"EcoTrack. As an admin you'll have access to:\n\n"
        f"{capability_lines}\n\n"
        f"Sign in: {Config.PUBLIC_APP_URL}/login\n"
        f"New here? Create an account at this exact address first - admin access "
        f"applies the moment you sign in with it: {Config.PUBLIC_APP_URL}/register\n\n"
        f"Admin access is scoped to the console only and every action taken there "
        f"is logged. If this was not something you expected, you can ignore this "
        f"email; nothing further happens automatically.\n"
    )


def send_admin_invite_email(recipient_email, invited_by_email, invited_name=None):
    """
    Send the branded admin-invitation email through Resend.

    Unlike the other three send_* functions, a False return here is surfaced
    to the admin who triggered it (see routes/admin.py's invite_admin) rather
    than silently swallowed - there is no working fallback path for this one
    (Firebase has no equivalent built-in email), so the admin needs to know
    to tell the new admin some other way.
    """
    if not Config.RESEND_API_KEY:
        return False

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": "You've been added as an EcoTrack admin",
        "html": _admin_invite_email_html(recipient_email, invited_name, invited_by_email),
        "text": _admin_invite_email_text(recipient_email, invited_name, invited_by_email),
    }

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {Config.RESEND_API_KEY}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return False

    if response.status_code >= 200 and response.status_code < 300:
        return True

    print(
        f"[EcoTrack] Resend could not send the admin invite email "
        f"(HTTP {response.status_code}): {response.text[:300]}"
    )
    return False


# ---------------------------------------------------------------------------
# ACTIVITY DIGEST (weekly or monthly)
#
# Sent from routes/cron.py's send_digest_emails() - the same daily cron run
# that already sends streak/goal/reminder/budget PUSH notifications, just a
# second, independent pass over every user's own digestFrequency preference
# (Profile > Notifications) rather than their push-token registration. No
# animation asset like the reset/donation emails - the numbers are the whole
# point, the same reasoning the two-factor code email's own comment gives for
# skipping one.
# ---------------------------------------------------------------------------


def _digest_email_html(name, period_label, period_adjective, total_kg, top_categories, budget_kg):
    """
    The branded HTML body for a weekly/monthly digest email.

    TWO DIFFERENT GRAMMATICAL FORMS OF THE SAME PERIOD, ON PURPOSE
    period_label is a noun phrase for headings like "{period_label} total" -
    "This week" or a month name like "August", both of which read correctly
    there. period_adjective ("weekly"/"monthly") is for anywhere the
    sentence needs an adjective instead - "Your {adjective} summary" reads
    fine either way, but "Your {label.lower()} summary" produced "Your this
    week summary" for the weekly case, caught rendering a real preview of
    this exact template before ever sending one for real.

    top_categories is a list of (label, kg) tuples, already sorted and
    already capped to at most 3 by the caller - this function only renders
    what it is given, the same "no maths in the template" rule every other
    email here follows.
    """
    display_name = name.strip() if name and name.strip() else "there"

    category_rows = "".join(
        f"""
          <tr>
            <td style="padding:10px 0; border-top:1px solid rgba(31,42,26,0.1); font-size:14px; color:#1e2a1d;">{label}</td>
            <td style="padding:10px 0; border-top:1px solid rgba(31,42,26,0.1); font-size:14px; text-align:right; font-family:'Courier New',Courier,monospace; color:#1e2a1d;">{kg:.1f} kg</td>
          </tr>"""
        for label, kg in top_categories
    )

    if budget_kg > 0:
        percent = round((total_kg / budget_kg) * 100)
        budget_line = (
            f"That's <strong style=\"color:#1e2a1d;\">{percent}%</strong> of your "
            f"{budget_kg:.0f} kg CO&#8322; budget for a 1.5&nbsp;&deg;C-aligned {period_adjective} pace."
        )
    else:
        budget_line = ""

    return f"""\
<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background-color:#f5f3ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px; text-align:center;">
          <span style="font-size:22px; font-weight:700; color:#1f7a44; letter-spacing:-0.02em;">
            &#127807; EcoTrack
          </span>
        </td>
      </tr>
      <tr>
        <td style="background-color:#fdfcf8; border:1px solid rgba(31,42,26,0.12); border-radius:14px; padding:36px 32px;">
          <p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
            Your {period_adjective} summary
          </p>
          <h1 style="margin:0 0 20px; font-size:26px; line-height:1.2; font-weight:700; color:#1e2a1d;">
            Hi {display_name}
          </h1>

          <p style="margin:0 0 6px; font-size:12px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#5f6b58;">
            {period_label} total
          </p>
          <p style="margin:0 0 8px; font-size:40px; line-height:1; font-weight:700; font-family:'Courier New',Courier,monospace; color:#1f7a44;">
            {total_kg:.1f} <span style="font-size:18px; font-weight:600; color:#5f6b58;">kg CO&#8322;</span>
          </p>
          {f'<p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#5f6b58;">{budget_line}</p>' if budget_line else '<div style="margin-bottom:24px;"></div>'}

          {f'''<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
            {category_rows}
          </table>''' if category_rows else ''}

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="border-radius:10px; background-color:#1f7a44;">
                <a href="{Config.PUBLIC_APP_URL}/reports"
                   style="display:inline-block; padding:13px 26px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
                  View full report
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px; text-align:center;">
          <p style="margin:0 0 6px; font-size:12px; color:#5f6b58;">
            EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG&nbsp;13
          </p>
          <p style="margin:0; font-size:11px; color:#8a938a;">
            Turn this off any time in Profile &rarr; Notifications.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _digest_email_text(name, period_label, period_adjective, total_kg, top_categories, budget_kg):
    display_name = name.strip() if name and name.strip() else "there"
    lines = [
        f"Hi {display_name},",
        "",
        f"Your {period_adjective} summary: {period_label} total, {total_kg:.1f} kg CO2.",
    ]
    if budget_kg > 0:
        percent = round((total_kg / budget_kg) * 100)
        lines.append(f"That's {percent}% of your {budget_kg:.0f} kg CO2 budget for a 1.5C-aligned {period_adjective} pace.")
    if top_categories:
        lines.append("")
        lines.append("By category:")
        lines.extend(f"  - {label}: {kg:.1f} kg" for label, kg in top_categories)
    lines.append("")
    lines.append(f"View your full report: {Config.PUBLIC_APP_URL}/reports")
    lines.append("")
    lines.append("Turn this off any time in Profile -> Notifications.")
    return "\n".join(lines)


def send_digest_email(recipient_email, recipient_name, period_label, period_adjective, total_kg, top_categories, budget_kg=0):
    """
    Send a weekly/monthly activity digest through Resend.

    period_label is a noun phrase ("This week", or a month name like
    "August"); period_adjective is "weekly" or "monthly" - see
    _digest_email_html's own docstring for why both exist rather than
    deriving one from the other with .lower().

    Returns True once Resend has accepted it, False if the custom email path
    is unavailable or the send failed for any reason - the caller
    (routes/cron.py's send_digest_emails) treats False as "skip this user
    this run", not an error worth surfacing anywhere; unlike a password
    reset, there is no user actively waiting on this one, so silently
    trying again next cycle is the right degrade, not a fallback email.
    """
    if not Config.RESEND_API_KEY:
        return False

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": f"Your {period_adjective} EcoTrack summary",
        "html": _digest_email_html(recipient_name, period_label, period_adjective, total_kg, top_categories, budget_kg),
        "text": _digest_email_text(recipient_name, period_label, period_adjective, total_kg, top_categories, budget_kg),
    }

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {Config.RESEND_API_KEY}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return False

    if response.status_code >= 200 and response.status_code < 300:
        return True

    print(
        f"[EcoTrack] Resend could not send the digest email "
        f"(HTTP {response.status_code}): {response.text[:300]}"
    )
    return False


# ---------------------------------------------------------------------------
# WELCOME EMAIL
#
# Sent once, from routes/auth.py's register(), right after a brand-new
# account is created - the same "best-effort, never blocks the request"
# shape every other email in this file already has. The header animation
# uses the exact same seed-to-sprout visual grammar GrowingTree.jsx's own
# reward tree already uses for a fresh account's own first stage ("Seed") -
# generated by generate_welcome_animation.py, see that file's own module
# docstring for why.
# ---------------------------------------------------------------------------

WELCOME_EMAIL_ANIMATION_PATH = "/email/welcome.gif"

# A second, closing photo below the feature list - the same "one header
# image, one closing/mission image" shape _admin_invite_email_html above
# already uses. A sunlit open field at golden hour - already curated for
# the app itself (frontend/src/utils/photos.js's own goldenHourField,
# Dashboard's Carbon Wrapped) - "a real, wide-open place to start", not
# stock decoration picked fresh for this one email.
_WELCOME_MISSION_PHOTO = (
    "https://images.unsplash.com/photo-1624212933958-4aa0e1cd2e0c"
    "?auto=format&fit=crop&w=800&q=70"
)

# What a brand-new account can actually do, in roughly the order someone
# would realistically reach for it - written for someone who has never
# opened the app once, not a feature-by-feature changelog. Every line here
# is something this codebase actually ships, not aspirational copy.
_WELCOME_FEATURES = [
    "Log any activity in seconds - a car trip, an electricity bill, a "
    "meal - across seven categories, each converted with a published "
    "DEFRA, IPCC or CEA emission factor",
    "Say it or photograph a bill instead of typing it in - AI reads the "
    "category, type and quantity for you to confirm before anything saves",
    "A month-end forecast built from your own logging pattern, with an "
    "honest range of uncertainty - not a flat guess",
    "Ranked, cited swap ideas - real savings from published science, each "
    "one showing exactly the two factor values it was computed from",
    "Goals, streaks, and a reward tree that actually grows from what you log",
    "A household, classroom or workplace leaderboard - ranked by effort, "
    "never by whose life happens to have a smaller footprint",
]


def _welcome_email_html(recipient_email, name):
    """The branded HTML body for the new-account welcome email. Same
    email-safe constraints as every other template in this file - see
    _reset_email_html's own docstring for why."""
    greeting_name = _greeting_name(name)
    calculator_url = f"{Config.PUBLIC_APP_URL}/calculator"

    feature_rows = "".join(
        f"""
          <tr>
            <td style="padding:9px 0; border-top:1px solid rgba(31,42,26,0.1); font-size:13px; line-height:1.55; color:#5f6b58;">
              <span style="color:#1f7a44;">&#10003;</span>&nbsp; {feature}
            </td>
          </tr>"""
        for feature in _WELCOME_FEATURES
    )

    return f"""\
<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background-color:#f5f3ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px; text-align:center;">
          <span style="font-size:22px; font-weight:700; color:#1f7a44; letter-spacing:-0.02em;">
            &#127807; EcoTrack
          </span>
        </td>
      </tr>
      <tr>
        <td style="background-color:#fdfcf8; border:1px solid rgba(31,42,26,0.12); border-radius:14px; padding:0; overflow:hidden;">
          <div style="padding:36px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
              <tr>
                <td align="center">
                  <img src="{Config.PUBLIC_APP_URL}{WELCOME_EMAIL_ANIMATION_PATH}"
                       width="88" height="88" alt=""
                       style="display:block; width:88px; height:88px; border:0;" />
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px; text-align:center; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
              Account created
            </p>
            <h1 style="margin:0 0 16px; text-align:center; font-size:26px; line-height:1.2; font-weight:700; color:#1e2a1d;">
              Welcome to EcoTrack{greeting_name}.
            </h1>
            <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#5f6b58;">
              You're signed up with <strong style="color:#1e2a1d;">{recipient_email}</strong>.
              EcoTrack turns everyday choices - your commute, your meals, your electricity
              bill - into a number you can see, compare, and actually bring down. Seven
              categories, published science, no guesswork. Here's what's waiting for you:
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
              {feature_rows}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
              <tr>
                <td style="border-radius:10px; background-color:#1f7a44;">
                  <a href="{calculator_url}"
                     style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
                    Log your first activity
                  </a>
                </td>
              </tr>
            </table>
          </div>
          <img src="{_WELCOME_MISSION_PHOTO}" width="480" alt="A sunlit open field at golden hour"
               style="display:block; width:100%; height:150px; object-fit:cover; border:0;" />
          <div style="padding:24px 32px 32px;">
            <p style="margin:0; font-size:13px; line-height:1.6; color:#5f6b58;">
              Your first entry takes about thirty seconds - log one car journey or one
              electricity bill and every chart on your dashboard fills in. Built around
              UN Sustainable Development Goal&nbsp;13: Climate Action.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#5f6b58;">
            EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG&nbsp;13
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _welcome_email_text(recipient_email, name):
    """The plain-text half of the welcome email."""
    greeting_name = _greeting_name(name)
    feature_lines = "\n".join(f"- {feature}" for feature in _WELCOME_FEATURES)
    return (
        f"Welcome to EcoTrack{greeting_name}.\n\n"
        f"You're signed up with {recipient_email}. EcoTrack turns everyday choices - "
        f"your commute, your meals, your electricity bill - into a number you can see, "
        f"compare, and actually bring down. Here's what's waiting for you:\n\n"
        f"{feature_lines}\n\n"
        f"Log your first activity: {Config.PUBLIC_APP_URL}/calculator\n\n"
        f"Your first entry takes about thirty seconds - log one car journey or one "
        f"electricity bill and every chart on your dashboard fills in."
    )


def send_welcome_email(recipient_email, name=None):
    """
    Send the branded welcome email through Resend, right after a new
    account is created.

    Returns True once Resend has accepted the email, False if the custom
    email path is unavailable or the send failed - the same degrade-quietly
    contract every other function in this file has. Unlike the password
    reset email, there is no fallback path here: this is purely a nice
    welcome, not something the sign-up flow depends on, so a False here
    means only "no welcome email this time", never a failed registration -
    see routes/auth.py's register(), which never lets this block the
    response either way.
    """
    if not Config.RESEND_API_KEY:
        return False

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": "Welcome to EcoTrack",
        "html": _welcome_email_html(recipient_email, name),
        "text": _welcome_email_text(recipient_email, name),
    }

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {Config.RESEND_API_KEY}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return False

    if response.status_code >= 200 and response.status_code < 300:
        return True

    print(
        f"[EcoTrack] Resend could not send the welcome email "
        f"(HTTP {response.status_code}): {response.text[:300]}"
    )
    return False


# ---------------------------------------------------------------------------
# EMAIL CHANGE CONFIRMATION
#
# Sent to the CURRENT email address the moment a change is requested, from
# routes/auth.py's request_email_change() - deliberately NOT Firebase's own
# verifyBeforeUpdateEmail flow, which confirms via the NEW address (proving
# that inbox is real and reachable) rather than the OLD one (proving
# whoever is asking still controls the account actually making the
# request). Both properties are useful; only the second is what stops a
# hijacked or unattended session from quietly moving an account to an
# attacker's own address with the real owner's inbox never hearing a word
# about it. See routes/auth.py's own COLLECTION_EMAIL_CHANGE_REQUESTS
# comment for the token this email carries and how it is verified.
# ---------------------------------------------------------------------------


def _email_change_email_html(confirm_link, current_email, new_email):
    """The branded HTML body for an email-change confirmation. Same
    email-safe constraints as every other template in this file - see
    _reset_email_html's own docstring for why."""
    return f"""\
<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background-color:#f5f3ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px; text-align:center;">
          <span style="font-size:22px; font-weight:700; color:#1f7a44; letter-spacing:-0.02em;">
            &#127807; EcoTrack
          </span>
        </td>
      </tr>
      <tr>
        <td style="background-color:#fdfcf8; border:1px solid rgba(31,42,26,0.12); border-radius:14px; padding:36px 32px;">
          <p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#5f6b58;">
            Email change requested
          </p>
          <h1 style="margin:0 0 16px; font-size:26px; line-height:1.2; font-weight:700; color:#1e2a1d;">
            Confirm your new email address
          </h1>
          <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#5f6b58;">
            Someone asked to change the email on your EcoTrack account
            (<strong style="color:#1e2a1d;">{current_email}</strong>) to
            <strong style="color:#1e2a1d;">{new_email}</strong>. If that was you,
            confirm the change below - your account keeps using this address until you do.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td style="border-radius:10px; background-color:#1f7a44;">
                <a href="{confirm_link}"
                   style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
                  Confirm the change
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 4px; font-size:13px; color:#5f6b58;">
            Or paste this link into your browser:
          </p>
          <p style="margin:0 0 24px; font-size:12px; line-height:1.6; word-break:break-all; font-family:'Courier New',Courier,monospace; color:#966000;">
            {confirm_link}
          </p>
          <p style="margin:0; padding-top:20px; border-top:1px solid rgba(31,42,26,0.1); font-size:13px; line-height:1.6; color:#5f6b58;">
            This link expires soon and can only be used once. If you did not request
            this, no action is needed - your email has not been changed, and you can
            safely ignore this message. Consider changing your password if you did not
            expect this.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#5f6b58;">
            EcoTrack &middot; measure your footprint, then bring it down &middot; built around UN SDG&nbsp;13
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _email_change_email_text(confirm_link, current_email, new_email):
    """The plain-text half of the email-change confirmation."""
    return (
        f"Confirm your new EcoTrack email address\n\n"
        f"Someone asked to change the email on your EcoTrack account ({current_email}) "
        f"to {new_email}. If that was you, open this link to confirm:\n\n"
        f"{confirm_link}\n\n"
        f"This link expires soon and can only be used once. If you did not request "
        f"this, no action is needed - your email has not been changed. Consider "
        f"changing your password if you did not expect this."
    )


def send_email_change_confirmation(current_email, new_email, confirm_link):
    """
    Send the email-change confirmation to the CURRENT address - see this
    section's own comment for why the old address, not the new one.

    Returns True once Resend has accepted the email, False if the custom
    email path is unavailable or the send failed. Unlike password reset,
    there is no Firebase-native fallback for this specific security
    property (confirm-via-old-email), so False here means the request
    genuinely could not be sent right now - routes/auth.py reports that
    honestly to the caller rather than pretending the request went out.
    """
    if not Config.RESEND_API_KEY:
        return False

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [current_email],
        "subject": "Confirm your new EcoTrack email address",
        "html": _email_change_email_html(confirm_link, current_email, new_email),
        "text": _email_change_email_text(confirm_link, current_email, new_email),
    }

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {Config.RESEND_API_KEY}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return False

    if response.status_code >= 200 and response.status_code < 300:
        return True

    print(
        f"[EcoTrack] Resend could not send the email-change confirmation "
        f"(HTTP {response.status_code}): {response.text[:300]}"
    )
    return False
