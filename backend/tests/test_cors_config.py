# EcoTrack/backend/tests/test_cors_config.py
"""
Regression guard for the PATCH/CORS bug caught 2026-08-20.

WHY THIS BUG SLIPPED PAST EVERYTHING ELSE
------------------------------------------
CORS is enforced by the BROWSER, not the server. A direct HTTP call - curl,
requests, pytest's Flask test client - never triggers a CORS preflight and
so never notices an HTTP method missing from the server's advertised
Access-Control-Allow-Methods list. routes/engagement.py's
PATCH /interventions/<id> worked perfectly under curl and under every
existing test, while every real click of "Accept" in an actual browser
silently failed: the preflight was rejected, useIntervention.js's accept()
is deliberately fire-and-forget (see that file's docstring), and the click
still updated the component's own local state - so the UI looked correct
while writing nothing. Only driving the real page in a real browser and then
reading Firestore directly caught it.

This test cannot spin up a browser, so it cannot reproduce a CORS preflight
either - but it CAN make sure the next new HTTP method never has the same
gap: it statically scans every route file for the methods each endpoint
declares, and checks every one of them is in app.py's CORS allow-list. No
Firebase credentials needed, so this runs anywhere the source tree does.
"""

import re
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

ROUTE_METHOD_PATTERN = re.compile(r'methods\s*=\s*\[([^\]]*)\]')
QUOTED_STRING_PATTERN = re.compile(r'["\']([A-Z]+)["\']')


def _methods_declared_across_routes():
    """Every HTTP method string that appears in a methods=[...] on any route."""
    found = set()
    for route_file in (BACKEND_DIR / "routes").glob("*.py"):
        text = route_file.read_text(encoding="utf-8")
        for match in ROUTE_METHOD_PATTERN.finditer(text):
            found.update(QUOTED_STRING_PATTERN.findall(match.group(1)))
    return found


def _methods_allowed_by_cors():
    """The methods=[...] passed to CORS(...) in app.py."""
    text = (BACKEND_DIR / "app.py").read_text(encoding="utf-8")
    match = ROUTE_METHOD_PATTERN.search(text)
    assert match, "Could not find a methods=[...] list in app.py's CORS(...) call."
    return set(QUOTED_STRING_PATTERN.findall(match.group(1)))


def test_every_method_used_by_a_route_is_cors_allowed():
    declared = _methods_declared_across_routes()
    allowed = _methods_allowed_by_cors()

    # GET is Flask's implicit default when a route has no explicit methods=,
    # so it is deliberately not required to appear literally in every file.
    missing = declared - allowed - {"HEAD"}

    assert not missing, (
        f"{missing} used by a @*.route(methods=[...]) somewhere in routes/ "
        f"but not in app.py's CORS(methods=[...]). A browser will silently "
        f"fail preflight for these - see this file's module docstring."
    )


def test_patch_specifically_stays_allowed():
    """The exact regression this file exists for."""
    assert "PATCH" in _methods_allowed_by_cors()
