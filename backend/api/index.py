# EcoTrack/backend/api/index.py
#
# Entry point for running the Flask backend on Vercel.
#
# Vercel's Python runtime serves a module-level WSGI application called `app`.
# The real app is built in backend/app.py (create_app()), so here we just make
# the backend folder importable and re-export that same `app`. All routing is
# handled by vercel.json, which sends every request to this function; Flask then
# matches the original path (/api/auth/login, /api/health, …) as normal.

import os
import sys

# This file lives in backend/api/ — add backend/ to the import path so
# "import app", "import config", "import routes" resolve to the real modules.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402  (must come after the sys.path tweak above)

# `app` is now the module-level WSGI callable Vercel looks for.
