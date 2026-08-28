# EcoTrack/backend/routes/announcements.py
"""
The one site-wide banner an admin can put in front of every signed-in user -
"we just shipped X", a maintenance notice, anything that needs to reach
people who are not actively looking for it. Nothing like this existed
before: the only way to tell users about a new feature was passively,
through whatever they happened to notice on a page they visited anyway.

ONE ACTIVE ANNOUNCEMENT AT A TIME, BY DESIGN
This is deliberately not a feed or an inbox. Creating a new announcement
(routes/admin.py's create_announcement) automatically deactivates whichever
one was active before it - there is never more than one banner competing for
attention, the same reasoning a real site's own "site status" banner follows.
Past announcements are kept (not deleted) purely as a history an admin can
review, at GET /api/admin/announcements.

DISMISSAL IS CLIENT-SIDE ONLY, ON PURPOSE
Unlike almost everything else in this app, "I've seen this" is not written
to Firestore anywhere. AnnouncementBanner.jsx keeps the dismissed id in
localStorage - the same treatment the theme and reduce-motion preferences
already get - because the cost of occasionally seeing a stale banner again
on a second device is low, and it means dismissing a banner is instant, free
of a network round trip, and adds no new field to the user's own profile
document for something this transient.

Mounted at /api/announcements
"""

from flask import Blueprint

from config import Config, get_db
from routes import api_success, require_auth

announcements_bp = Blueprint("announcements", __name__, url_prefix="/api/announcements")

COLLECTION_ANNOUNCEMENTS = "announcements"


@announcements_bp.route("/active", methods=["GET"])
@require_auth
def get_active_announcement():
    """
    The current banner, if any - the ONE document (if it exists) where
    active is true. Signed-in users only: a visitor with no account has
    nothing here to be told about that a public page would not already say.

    Returns {"announcement": null} when nothing is active, rather than a
    404 - "no banner right now" is the ordinary, expected state, not an
    error the frontend needs to treat specially.
    """
    db = get_db()
    query = (
        db.collection(COLLECTION_ANNOUNCEMENTS)
        .where("active", "==", True)
        .limit(1)
    )
    docs = list(query.stream())

    if not docs:
        return api_success({"announcement": None})

    doc = docs[0]
    data = doc.to_dict()
    created_at = data.get("createdAt")

    return api_success({
        "announcement": {
            "id": doc.id,
            "message": data.get("message", ""),
            "tone": data.get("tone", "neutral"),
            "link": data.get("link"),
            "createdAt": created_at.isoformat() if created_at else None,
        }
    })
