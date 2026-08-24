# EcoTrack/backend/routes/ingest.py
"""
Bill/receipt ingestion - a photo OR a PDF - powered by Google Gemini's
multimodal input.

WHAT THIS ROUTE DOES AND DOES NOT DO
-------------------------------------
It reads a bill or receipt and extracts a proposed (category, subType,
quantity, unit) - nothing more. It NEVER saves a carbonRecords entry itself.
The frontend shows the extraction to the user for confirmation and only THEN
calls the ordinary POST /api/carbon/calculate route (through
save_calculated_record, the same path the Calculator and quick-log templates
use) once the user has actually reviewed the numbers. Keeping "extract" and
"save" as two separate, user-gated steps is what stops a misread bill from
silently entering the user's real emissions history.

A PHOTO OR A PDF - GEMINI READS BOTH NATIVELY
-----------------------------------------------
A photo is OCR'd by the model; a PDF is read via its own text layer, which
Gemini's API accepts directly (Part.from_bytes with mime_type
"application/pdf") without this backend rasterising anything itself - and is
MORE accurate than a photo, since there is no printed-text-to-recognise step
at all for a bill someone downloaded as a PDF rather than photographed. See
ALLOWED_MIME_TYPES below.

THE FILE IS NEVER PERSISTED
------------------------------
The uploaded bytes exist only for the duration of this request: decoded from
the request body, handed to the Gemini API call, and then this function
returns. Nothing is written to Firestore, disk, or any log. This is a real
privacy property of this route, not a side effect - state it as one.

Follows the same defensive-import and error-handling pattern as
routes/assistant.py, so a missing google-genai dependency degrades to
"unavailable" instead of stopping the whole server from booting.

Mounted at /api/ingest
"""

import base64
import binascii
import json

from flask import Blueprint, g, request

from config import Config
from routes import api_error, api_success, check_rate_limit, require_auth

try:
    from google import genai
    from google.genai import errors as genai_errors
    from google.genai import types as genai_types

    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

ingest_bp = Blueprint("ingest", __name__, url_prefix="/api/ingest")

# ~4MB of raw file bytes. Base64 inflates size by ~4/3, so the check below
# caps the DECODED byte length, not the string length that arrives over the
# wire - a request just under this still crosses a bundled Vercel function,
# which is exactly why the frontend downscales photos to ~2000px/JPEG q0.85
# before ever sending them (see BillScanner.jsx) rather than relying on this
# cap alone. A PDF is sent through unresized - a 1-2 page bill is typically
# well under this on its own, and there is no client-side way to "downscale"
# a PDF the way a photo can be re-encoded smaller.
MAX_FILE_BYTES = 4 * 1024 * 1024

# PDF alongside the three image types: Gemini reads a PDF's own text layer
# directly rather than OCR-ing a rasterised page, which is MORE accurate
# than a photo for anyone who downloads their bill as a PDF rather than
# photographing a printed copy - confirmed live against the real API before
# this was wired in (a synthetic PDF's "245 kWh" round-tripped correctly).
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}

# A photo is a slower, heavier ask than a chat message, so it gets its own,
# tighter bucket rather than sharing one with routes/assistant.py.
INGEST_RATE_LIMIT_MAX = 10
INGEST_RATE_LIMIT_WINDOW_SECONDS = 3600

MAX_OUTPUT_TOKENS = 500

BILL_EXTRACTION_INSTRUCTION = f"""You read utility bills and receipts and extract ONE activity as \
strict JSON, nothing else - no markdown fences, no commentary before or after the JSON object.

Valid "category" values: {', '.join(Config.CATEGORIES)}

The FULL list of valid "subType" values, grouped by category - every subType
you return MUST be one of these exact strings, and its "unit" MUST be the
one shown beside it (this is what this app's own emission factors are
published for; anything else cannot be matched to a real published number):
  transport (unit: km): petrol_car, diesel_car, motorbike, bus, train,
    flight_domestic, bicycle - from a fuel station receipt (petrol_car/
    diesel_car), a ticket, or a boarding pass
  electricity (unit: kWh): grid_electricity, solar - from a utility bill
  fuel (unit: kg for lpg, liter for the generators): lpg, petrol_generator,
    diesel_generator - from an LPG cylinder receipt or a generator refill
  diet (unit: meal): non_vegetarian, vegetarian, vegan - rarely receipted,
    only extract this if a restaurant/canteen bill clearly states a meal count
  waste (unit: kg): landfill, recycled - from a waste-collection receipt
  water (unit: liter): municipal_supply - from a water utility bill
  consumption (unit: item): clothing_item, electronics_item - from a
    shopping receipt or invoice, counting the number of items bought

Read every printed number and label carefully before choosing - a bill
often shows several quantities (units this period, units last period,
average, cumulative-to-date, and the amount actually billed in currency).
Extract the CONSUMPTION quantity in the document's own physical unit above
(kWh, litres, kg, km, meal count or item count), never a currency amount,
and prefer a period total over a daily average if both are printed.

Respond with exactly this JSON shape:
{{
  "category": "<one of the valid categories, or null if you cannot tell>",
  "subType": "<a subType from the list above that fits, or null>",
  "quantity": <number, the consumption/quantity figure - e.g. kWh on an electricity bill, litres or kg on a fuel receipt - or null>,
  "unit": "<the unit of that quantity, e.g. kWh, liter, kg, or null>",
  "confidence": <your confidence in this whole extraction, 0.0 to 1.0>,
  "rawFields": {{"<label as printed on the document>": "<value as printed>", ...}}
}}

If the image is not a bill or receipt, or you cannot find a usable quantity, \
set category, subType, quantity and unit to null and confidence to 0, but still \
return valid JSON in this exact shape. Never invent a number that is not visibly \
printed on the document."""


def _get_client():
    if not GENAI_AVAILABLE:
        return None, api_error(
            "Bill scanning is not installed on this server. "
            "Run: pip install -r requirements.txt",
            503,
            code="ingest_unavailable",
        )
    if not Config.GEMINI_API_KEY:
        return None, api_error(
            "Bill scanning is not configured. Add GEMINI_API_KEY to backend/.env.",
            503,
            code="ingest_not_configured",
        )
    return genai.Client(api_key=Config.GEMINI_API_KEY), None


@ingest_bp.route("/bill", methods=["POST"])
@require_auth
def ingest_bill():
    """
    Body: {"imageBase64": "<base64, no data: prefix>", "mimeType": "image/jpeg"}
    mimeType is any of ALLOWED_MIME_TYPES - a photo (jpeg/png/webp) or a PDF.

    Returns the proposed extraction. Saves nothing.
    """
    client, error = _get_client()
    if error:
        return error

    if not check_rate_limit("ingest-bill", g.uid, INGEST_RATE_LIMIT_MAX, INGEST_RATE_LIMIT_WINDOW_SECONDS):
        return api_error(
            "You've hit the bill-scanning limit for now. Try again in a while, "
            "or enter the value directly in the Calculator.",
            429,
            code="ingest_rate_limited",
        )

    body = request.get_json(silent=True) or {}
    mime_type = str(body.get("mimeType", "")).strip().lower()
    image_base64 = body.get("imageBase64")

    if mime_type not in ALLOWED_MIME_TYPES:
        return api_error(
            f"mimeType must be one of: {', '.join(sorted(ALLOWED_MIME_TYPES))}.",
            400,
            code="invalid_mime_type",
        )
    if not image_base64 or not isinstance(image_base64, str):
        return api_error("imageBase64 is required.", 400, code="missing_image")

    try:
        # validate=True rejects anything that is not clean base64 outright,
        # rather than silently dropping bad characters
        image_bytes = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError):
        return api_error("imageBase64 is not valid base64.", 400, code="invalid_base64")

    if len(image_bytes) > MAX_FILE_BYTES:
        return api_error(
            f"That file is too large ({len(image_bytes) // 1024} KB). "
            f"Please use a smaller one (under {MAX_FILE_BYTES // (1024 * 1024)} MB).",
            413,
            code="image_too_large",
        )
    if len(image_bytes) == 0:
        return api_error("That file appears to be empty.", 400, code="empty_image")

    try:
        response = client.models.generate_content(
            model=Config.ASSISTANT_MODEL,
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                        genai_types.Part.from_text(text="Extract the activity from this bill/receipt."),
                    ],
                )
            ],
            config=genai_types.GenerateContentConfig(
                system_instruction=[BILL_EXTRACTION_INSTRUCTION],
                max_output_tokens=MAX_OUTPUT_TOKENS,
                temperature=0.1,  # this is extraction, not conversation - minimise creativity
                response_mime_type="application/json",
                thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
            ),
        )
    except genai_errors.ClientError as client_error:
        status = getattr(client_error, "code", 400)
        if status == 429:
            return api_error(
                "The assistant has hit its free-tier rate limit. Wait a minute and try again.",
                429,
                code="ingest_rate_limited_upstream",
            )
        return api_error(
            "The extraction request was rejected. Check GEMINI_API_KEY and ASSISTANT_MODEL.",
            503,
            code="ingest_config_error",
        )
    except genai_errors.ServerError:
        return api_error(
            "The extraction service is having problems. Please try again shortly.",
            502,
            code="ingest_error",
        )
    except genai_errors.APIError:
        return api_error("Could not reach the extraction service.", 503, code="ingest_unreachable")
    finally:
        # Explicit, even though Python's own garbage collector would get to
        # it anyway - this line is the statement that the bytes are not kept
        # around a moment longer than the call above needed them for.
        del image_bytes

    raw_text = (response.text or "").strip()
    try:
        extracted = json.loads(raw_text)
    except (ValueError, TypeError):
        return api_success({
            "category": None,
            "subType": None,
            "quantity": None,
            "unit": None,
            "confidence": 0.0,
            "rawFields": {},
            "parseError": True,
        }, message="Could not read a clear value from that photo. Please enter it manually.")

    category = extracted.get("category")
    if category not in Config.CATEGORIES:
        category = None

    quantity = extracted.get("quantity")
    if not isinstance(quantity, (int, float)) or quantity <= 0:
        quantity = None

    confidence = extracted.get("confidence")
    if not isinstance(confidence, (int, float)):
        confidence = 0.0
    confidence = max(0.0, min(1.0, float(confidence)))

    raw_fields = extracted.get("rawFields")
    if not isinstance(raw_fields, dict):
        raw_fields = {}

    return api_success({
        "category": category,
        "subType": extracted.get("subType") if isinstance(extracted.get("subType"), str) else None,
        "quantity": quantity,
        "unit": extracted.get("unit") if isinstance(extracted.get("unit"), str) else None,
        "confidence": confidence,
        "rawFields": raw_fields,
        "parseError": False,
    })
