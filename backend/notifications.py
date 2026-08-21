# EcoTrack/backend/notifications.py
"""
Sending a push notification through Firebase Cloud Messaging, and keeping
each user's registered browser/device tokens current.

WHY THIS FILE EXISTS AT ALL
The same reasoning as email_service.py: not framework-free like
weather_engine.py or insights_engine.py, because sending a real push
inherently needs firebase_admin.messaging (there is no equivalent "pure
Python" worth hand-rolling for FCM's protocol) and Firestore, to know which
token(s) belong to which user. This is the one other "sender" file in the
backend, and follows the same shape as email_service.py's own functions:
plain arguments in, a boolean/count out, never an exception the caller has
to catch.

NO EXTRA SECRET NEEDED TO SEND
Unlike RESEND_API_KEY, sending a push costs nothing extra to configure:
firebase_admin.messaging rides on the exact same service-account credentials
config.py's get_db() already authenticates with. What IS still needed before
this can do anything real:
  1. The frontend needs a VAPID key (Firebase Console > Project settings >
     Cloud Messaging > Web Push certificates > Generate key pair) before a
     browser will ever hand back a token to register - see
     frontend/src/utils/pushNotifications.js.
  2. routes/cron.py's daily trigger needs CRON_SECRET set (see config.py)
     before Vercel Cron can actually reach it.
Until both are done, register_token() and unregister_token() below still
work (nothing about saving a token needs either), but no token will ever
arrive to save, and no cron job will ever call send_push_to_user() - the
same "wired up, inert until configured" shape as the branded email features.
"""

from firebase_admin import messaging
from google.cloud import firestore as gcloud_firestore

from config import Config, get_db


def register_token(uid, token):
    """
    Save one FCM registration token against a user's profile.

    ArrayUnion is Firestore's own de-duplicating append: registering the
    same token again (a page reload, re-enabling a toggle that was already
    on) is a no-op rather than growing the array with a repeat.
    """
    db = get_db()
    db.collection(Config.COLLECTION_USERS).document(uid).set(
        {"fcmTokens": gcloud_firestore.ArrayUnion([token])}, merge=True
    )


def unregister_token(uid, token):
    """The reverse of register_token - called when a user turns notifications back off."""
    db = get_db()
    db.collection(Config.COLLECTION_USERS).document(uid).update(
        {"fcmTokens": gcloud_firestore.ArrayRemove([token])}
    )


def send_push_to_user(uid, title, body, url="/"):
    """
    Send one push to every device this user has registered.

    Returns how many of their tokens actually accepted delivery - 0 covers
    both "this user has no tokens" and "every send failed", which is exactly
    the information a caller needs (whether to count this user as notified),
    without forcing it to also handle a raised exception for the ordinary
    case of someone who simply never turned notifications on.

    A token stops being valid the moment someone uninstalls the app, revokes
    notification permission, or the browser clears its own push subscription
    on its own schedule. FCM reports that back as messaging.UnregisteredError
    specifically, not a generic failure - which is what makes it safe to
    delete the token here rather than leaving a dead entry to fail silently
    forever on every future send.
    """
    db = get_db()
    user_ref = db.collection(Config.COLLECTION_USERS).document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        return 0

    tokens = user_doc.to_dict().get("fcmTokens") or []
    if not tokens:
        return 0

    sent = 0
    dead_tokens = []
    for token in tokens:
        message = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            webpush=messaging.WebpushConfig(
                fcm_options=messaging.WebpushFCMOptions(link=f"{Config.PUBLIC_APP_URL}{url}"),
            ),
        )
        try:
            messaging.send(message)
            sent += 1
        except messaging.UnregisteredError:
            dead_tokens.append(token)
        except Exception:
            # Any other delivery failure (a transient FCM error, a
            # malformed token) - skip just this one token rather than
            # letting it block delivery to the user's other devices.
            continue

    if dead_tokens:
        user_ref.update({"fcmTokens": gcloud_firestore.ArrayRemove(dead_tokens)})

    return sent
