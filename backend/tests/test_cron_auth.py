# EcoTrack/backend/tests/test_cron_auth.py
"""
Unit tests for routes/cron.py's require_cron_secret guard - the one route
group in this backend not protected by @require_auth (see the security-rule
docstring at the top of routes/__init__.py). Since anyone who finds this
URL could otherwise trigger a push to every user with notifications on,
this decorator is the entire access control for it, so it is worth testing
directly rather than trusting it by inspection.

NO REAL FIREBASE CREDENTIALS NEEDED
require_cron_secret only reads Config.CRON_SECRET and the request's
Authorization header - it never touches Firestore itself (that happens
inside streak_reminders(), which this file does not call). A tiny
standalone Flask app wired to just the decorator is enough, the same
reasoning test_engagement.py already gives for importing routes.engagement
directly: nothing here needs get_db() or a live service account.
"""

import sys
from pathlib import Path

import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import Config  # noqa: E402
from routes.cron import require_cron_secret  # noqa: E402


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(Config, "CRON_SECRET", "test-secret-value")

    app = Flask(__name__)

    @app.route("/guarded")
    @require_cron_secret
    def guarded():
        return {"ok": True}

    return app.test_client()


def test_missing_authorization_header_is_rejected(client):
    response = client.get("/guarded")
    assert response.status_code == 401


def test_wrong_secret_is_rejected(client):
    response = client.get("/guarded", headers={"Authorization": "Bearer not-the-secret"})
    assert response.status_code == 401


def test_correct_secret_is_accepted(client):
    response = client.get("/guarded", headers={"Authorization": "Bearer test-secret-value"})
    assert response.status_code == 200
    assert response.get_json()["ok"] is True


def test_unconfigured_secret_refuses_every_request(monkeypatch):
    # Blank CRON_SECRET must fail closed - even a request that happens to
    # send "Bearer " (empty token) must not be let through by accident.
    monkeypatch.setattr(Config, "CRON_SECRET", "")

    app = Flask(__name__)

    @app.route("/guarded")
    @require_cron_secret
    def guarded():
        return {"ok": True}

    client = app.test_client()
    response = client.get("/guarded", headers={"Authorization": "Bearer "})
    assert response.status_code == 503
