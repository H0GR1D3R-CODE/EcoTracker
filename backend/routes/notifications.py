# EcoTrack/backend/routes/notifications.py
"""
Registering and removing a browser's push token against the signed-in user -
the link notifications.py's send_push_to_user() needs to find someone. See
frontend/src/utils/pushNotifications.js for the getToken() call that
produces the token these routes save.

Mounted at /api/notifications
"""

from flask import Blueprint, g, request

from notifications import register_token, unregister_token
from routes import api_error, api_success, require_auth

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def _token_from_body():
    data = request.get_json(silent=True) or {}
    return (data.get("token") or "").strip()


@notifications_bp.route("/register-token", methods=["POST"])
@require_auth
def register():
    """Body: {"token": "<FCM registration token from this browser>"}"""
    token = _token_from_body()
    if not token:
        return api_error("A token is required.", 400, code="missing_token")

    register_token(g.uid, token)
    return api_success(message="Notifications enabled.")


@notifications_bp.route("/register-token", methods=["DELETE"])
@require_auth
def unregister():
    """Body: {"token": "..."} - called when the user turns notifications back off."""
    token = _token_from_body()
    if not token:
        return api_error("A token is required.", 400, code="missing_token")

    unregister_token(g.uid, token)
    return api_success(message="Notifications turned off.")
