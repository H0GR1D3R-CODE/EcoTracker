# EcoTrack/backend/app.py
"""
EcoTrack backend - application entry point.

Run it locally with:      python app.py
Run it on Render with:    gunicorn app:app

This file wires everything together: it creates the Flask app, turns on CORS so
the React frontend is allowed to call it, starts Firebase, registers the route
blueprints, and defines the site-wide error handlers.

PUBLIC vs PROTECTED ROUTES
--------------------------
A handful of routes work without a Firebase ID token, each for a reason:
    GET  /api/health          server status check, returns no user data
    POST /api/auth/register   the account does not exist yet, so no token can exist
    GET  /api/factors         published DEFRA/IPCC constants, not personal data
    POST /api/feedback        a visitor can send feedback before signing up
    POST /api/create-order    a visitor can donate without an account (Razorpay)
    POST /api/verify-payment  confirms a donation's signature (Razorpay)
Everything else is wrapped in @require_auth or @require_admin.
"""

from flask import Flask, jsonify

from flask_cors import CORS

from config import Config, init_firebase

# Each module inside routes/ exposes one Blueprint (a group of routes).
from routes.auth import auth_bp
from routes.factors import factors_bp
from routes.carbon import carbon_bp
from routes.dashboard import dashboard_bp
from routes.goals import goals_bp
from routes.reports import reports_bp
from routes.admin import admin_bp
from routes.assistant import assistant_bp
from routes.feedback import feedback_bp
from routes.payments import payments_bp
from routes.insights import insights_bp
from routes.templates import templates_bp
from routes.engagement import engagement_bp
from routes.ingest import ingest_bp
from routes.notifications import notifications_bp
from routes.cron import cron_bp
from routes.wrapped import wrapped_bp


def create_app():
    """
    Build and configure the Flask application.

    Using a function like this (an "application factory") instead of creating the
    app at the top of the file makes the app easier to test later.
    """
    app = Flask(__name__)
    app.config.from_object(Config)

    # Connect to Firebase once, while the server is starting up, so the very
    # first API request does not have to wait for it.
    init_firebase()

    # Browsers block requests from one website to another unless the server says
    # they are allowed. This tells Flask which frontend URLs to trust.
    CORS(
        app,
        resources={r"/api/*": {"origins": Config.CORS_ORIGINS}},
        allow_headers=["Content-Type", "Authorization"],
        # PATCH is here for /api/engagement/interventions/<id> - the
        # accept/dismiss half of the evaluation harness. Missing it does not
        # error loudly: the browser's CORS preflight silently rejects the
        # PATCH, and useIntervention.js's accept()/dismiss() are deliberately
        # fire-and-forget (a broken log must never break the UI someone is
        # looking at) - so every "accept" click LOOKED like it worked while
        # writing nothing. Caught by directly reading Firestore after
        # clicking Accept in the live app and finding action still "shown".
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    # --- register route groups ---
    app.register_blueprint(auth_bp)        # /api/auth/*
    app.register_blueprint(factors_bp)     # /api/factors/*
    app.register_blueprint(carbon_bp)      # /api/carbon/*
    app.register_blueprint(dashboard_bp)   # /api/dashboard/*
    app.register_blueprint(goals_bp)       # /api/goals/*
    app.register_blueprint(reports_bp)     # /api/reports/*
    app.register_blueprint(admin_bp)       # /api/admin/*
    app.register_blueprint(assistant_bp)   # /api/assistant/*
    app.register_blueprint(feedback_bp)    # /api/feedback  (public)
    app.register_blueprint(payments_bp)    # /api/create-order, /api/verify-payment  (public)
    app.register_blueprint(insights_bp)    # /api/insights/*  (forecast, swaps, simulate, cohort)
    app.register_blueprint(templates_bp)   # /api/templates/*  (quick-log)
    app.register_blueprint(engagement_bp)  # /api/engagement/*  (interventions, streak, challenges)
    app.register_blueprint(ingest_bp)      # /api/ingest/bill  (Gemini photo extraction)
    app.register_blueprint(notifications_bp)  # /api/notifications/*  (FCM token register/unregister)
    app.register_blueprint(cron_bp)        # /api/cron/*  (Vercel Cron only - see routes/cron.py)
    app.register_blueprint(wrapped_bp)     # /api/wrapped  (Carbon Wrapped recap)

    # -----------------------------------------------------------------------
    # Security headers, on every response
    # -----------------------------------------------------------------------
    # Every response from this API is JSON, never HTML, so most of the usual
    # browser-facing headers (CSP, X-Frame-Options) matter less here than on
    # the frontend's own headers in firebase.json - but nosniff and a minimal
    # CSP cost nothing and close off the case where a browser is tricked into
    # rendering a JSON error response as something else. HSTS is set even
    # though Vercel already forces HTTPS at the edge, because that platform
    # guarantee is not something this codebase can verify or enforce itself -
    # stating it explicitly here is a real, if small, second layer.
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response

    # -----------------------------------------------------------------------
    # Server status routes
    # -----------------------------------------------------------------------

    @app.route("/")
    def index():
        """Friendly landing response so you can tell the server is alive."""
        return jsonify({
            "name": "EcoTrack API",
            "status": "running",
            "docs": "Data routes live under /api/ and require a Firebase ID token.",
        })

    @app.route("/api/health")
    def health():
        """
        Health check. Render pings this to confirm the service started, and it is
        handy for checking your deployment from the browser.
        """
        return jsonify({
            "success": True,
            "status": "healthy",
            "environment": Config.FLASK_ENV,
            "firebaseProject": Config.FIREBASE_PROJECT_ID,
        })

    # -----------------------------------------------------------------------
    # Error handlers - these make sure the API always replies with JSON,
    # never with Flask's default HTML error pages (which would break the
    # React app's response.json() call and crash the frontend).
    # -----------------------------------------------------------------------

    @app.errorhandler(400)
    def handle_bad_request(error):
        return jsonify({"success": False, "error": "Bad request."}), 400

    @app.errorhandler(404)
    def handle_not_found(error):
        return jsonify({"success": False, "error": "Endpoint not found."}), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        return jsonify({"success": False, "error": "Method not allowed for this endpoint."}), 405

    @app.errorhandler(500)
    def handle_server_error(error):
        return jsonify({"success": False, "error": "Internal server error."}), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        """
        Catches any crash we did not plan for.

        In development we re-raise the error so you get the full traceback in the
        terminal. In production we hide the details, because error messages can
        leak information about the server.
        """
        if Config.DEBUG:
            raise error
        # Print to the Render logs so you can still debug a live problem
        app.logger.exception("Unhandled exception: %s", error)
        return jsonify({"success": False, "error": "Something went wrong."}), 500

    return app


# Gunicorn (used by Render) looks for a module-level variable named "app".
app = create_app()


if __name__ == "__main__":
    # host="0.0.0.0" makes the server reachable from other devices on your wifi,
    # which is useful for testing the site on your phone.
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
