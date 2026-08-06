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
of letting Firebase email it automatically. The link's own domain is still
Firebase's (project-name.firebaseapp.com) unless a custom domain is
configured as the project's authDomain - that is a Firebase Console /
DNS-level change outside this file's reach, not a bug in it.

THIS IS OPTIONAL, NOT REQUIRED
Every function here degrades honestly: if RESEND_API_KEY is not set,
send_password_reset_email() returns False immediately and touches the network
not at all. The caller (routes/auth.py) is expected to treat False as "the
custom email path is unavailable right now", not as an error - the same shape
as how routes/assistant.py treats a missing GEMINI_API_KEY.
"""

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
