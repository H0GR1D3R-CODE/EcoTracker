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


def _receipt_number(payment_id):
    """The exact same rule as Donate.jsx's own receiptNumber(), in Python."""
    tail = re.sub(r"[^a-zA-Z0-9]", "", payment_id or "")[-6:].upper()
    return f"ECO-{datetime.now().year}-{tail or '000000'}"


def _donation_email_html(name, rupees, currency, payment_id):
    """
    The branded HTML body for a donation thank-you email.

    Same email-safe constraints as the reset email (inline styles only,
    light-theme colours, no custom @font-face) - see _reset_email_html's own
    docstring for why.
    """
    display_name = name.strip() if name and name.strip() and name.strip().lower() != "anonymous" else "you"
    trees = _tree_impact(rupees) if currency.upper() == "INR" else None
    receipt = _receipt_number(payment_id)
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


def _donation_email_text(name, rupees, currency, payment_id):
    display_name = name.strip() if name and name.strip() and name.strip().lower() != "anonymous" else "you"
    trees = _tree_impact(rupees) if currency.upper() == "INR" else None
    receipt = _receipt_number(payment_id)
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


def send_donation_thank_you_email(recipient_email, name, amount_paise, currency, payment_id):
    """
    Send the branded donation thank-you email through Resend.

    Degrades exactly like send_password_reset_email(): returns False with no
    network call when RESEND_API_KEY is not set, and False on any send
    failure - a missing thank-you email must never turn a verified payment
    into an error response for someone who has just paid.
    """
    if not Config.RESEND_API_KEY:
        return False

    rupees = (amount_paise or 0) / 100
    currency = currency or "INR"

    payload = {
        "from": Config.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": "Thank you for your donation to EcoTrack",
        "html": _donation_email_html(name, rupees, currency, payment_id),
        "text": _donation_email_text(name, rupees, currency, payment_id),
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
