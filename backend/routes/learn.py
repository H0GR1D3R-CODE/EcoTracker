# EcoTrack/backend/routes/learn.py
"""
Climate literacy micro-course progress: which of the Learn page's modules a
user has completed (correctly answered every quiz question for), and
whether they've finished all of them - the trigger for a shareable
completion certificate.

WHY NO QUIZ CONTENT LIVES HERE
The quiz questions themselves are static content, derived directly from the
same cited ARTICLES data frontend/src/pages/Learn.jsx already displays
(DEFRA, CEA India, Our World in Data, EPA figures) - see
frontend/src/data/learnModules.js. Nothing about a quiz question is
user-specific or needs computing, so there is nothing for a backend route
to serve; this file only tracks completion state per user, the one part
that genuinely needs a server to be trustworthy (a client-side-only
"completed" flag could be set by anyone, for anything).

Mounted at /api/learn
"""

from flask import Blueprint, g, request
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db
from routes import api_error, api_success, require_auth

learn_bp = Blueprint("learn", __name__, url_prefix="/api/learn")

# Kept in sync BY VALUE with the module keys in
# frontend/src/data/learnModules.js, the same cross-language constant
# duplication this codebase already accepts elsewhere (MONTHLY_BUDGET_KG,
# the CEA electricity factor) - not imported, since the two run in
# different languages.
VALID_MODULES = {"transport", "electricity", "diet", "consumption"}


@learn_bp.route("/progress", methods=["GET"])
@require_auth
def get_progress():
    db = get_db()
    user_doc = db.collection(Config.COLLECTION_USERS).document(g.uid).get()
    completed = (user_doc.to_dict() or {}).get("learnCompletedModules", []) if user_doc.exists else []
    completed = [m for m in completed if m in VALID_MODULES]

    return api_success({
        "completedModules": completed,
        "totalModules": len(VALID_MODULES),
        "allComplete": set(completed) == VALID_MODULES,
    })


@learn_bp.route("/complete-module", methods=["POST"])
@require_auth
def complete_module():
    """
    Body: {"module": "transport"}

    Only ever called by the frontend after every quiz question in that
    module was answered correctly - this route trusts that the caller did
    the check, the same way claim_challenge trusts the frontend only shows
    a Claim button once progress genuinely crossed 100%. There is nothing
    to award or gate server-side here beyond "this module is now marked
    done", so re-validating the quiz answers again on the backend would
    mean maintaining the same quiz content in two places for no real
    security gain - unlike a points-earning claim, completing a reading
    module has no economy to protect.
    """
    body = request.get_json(silent=True) or {}
    module = str(body.get("module", "")).strip().lower()

    if module not in VALID_MODULES:
        return api_error(
            f"module must be one of: {', '.join(sorted(VALID_MODULES))}.",
            400,
            code="invalid_module",
        )

    db = get_db()
    db.collection(Config.COLLECTION_USERS).document(g.uid).set(
        {"learnCompletedModules": gcloud_firestore.ArrayUnion([module])}, merge=True
    )

    user_doc = db.collection(Config.COLLECTION_USERS).document(g.uid).get()
    completed = [m for m in user_doc.to_dict().get("learnCompletedModules", []) if m in VALID_MODULES]

    return api_success({
        "completedModules": completed,
        "totalModules": len(VALID_MODULES),
        "allComplete": set(completed) == VALID_MODULES,
    })
