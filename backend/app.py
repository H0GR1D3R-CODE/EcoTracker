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
Only three routes work without a Firebase ID token, and each has a reason:
    GET  /api/health          server status check, returns no user data
    POST /api/auth/register   the account does not exist yet, so no token can exist
    GET  /api/factors         published DEFRA/IPCC constants, not personal data
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
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
