# EcoTrack/backend/routes/ingest.py
"""
Bill/receipt (or standalone product) ingestion - a photo, read by Groq's
vision model. Doubles as this app's "barcode scanner": rather than
decoding an actual barcode against a third-party product database (Open
Food Facts' own carbon-relevant fields are patchy outside packaged food,
and a mis-scanned barcode fails silently with no image for the user to
judge against), a photo of the product itself - its packaging, label or a
clothing tag - is read the same way a receipt is, so a person can point
their camera at what they bought instead of typing a category and count
by hand. See BILL_EXTRACTION_INSTRUCTION's consumption line below.

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

PHOTOS ONLY - PDF SUPPORT WAS DROPPED IN THE GROQ MIGRATION
-------------------------------------------------------------
This route used to also accept a PDF, which Gemini could read via its own
text layer. Groq's vision-capable models (see config.py's VISION_MODEL)
only accept image formats - JPEG, PNG, WEBP - over their image_url input, not
PDF. Rather than silently degrade PDF uploads into a confusing failure, PDF
was deliberately removed from ALLOWED_MIME_TYPES below and a clear rejection
message is returned if one is still sent, with the same guidance the
frontend now gives before it happens: photograph the bill, or open the PDF
and screenshot it.

THE FILE IS NEVER PERSISTED
------------------------------
The uploaded bytes exist only for the duration of this request: decoded from
the request body, handed to the Groq API call, and then this function
returns. Nothing is written to Firestore, disk, or any log. This is a real
privacy property of this route, not a side effect - state it as one.

Follows the same defensive-import and error-handling pattern as
routes/assistant.py, so a missing groq dependency degrades to "unavailable"
instead of stopping the whole server from booting.

Mounted at /api/ingest
"""

import base64
import binascii
import json

from flask import Blueprint, g, request

from config import Config
from routes import api_error, api_success, check_rate_limit, require_auth
from routes.assistant import (
    GROQ_AVAILABLE,
    GroqAPIConnectionError,
    GroqAPIError,
    GroqAPIStatusError,
    GroqInternalServerError,
    GroqAPITimeoutError,
    GroqRateLimitError,
    _call_groq,
)

try:
    from groq import Groq
except ImportError:
    Groq = None

ingest_bp = Blueprint("ingest", __name__, url_prefix="/api/ingest")

# ~4MB of raw file bytes. Base64 inflates size by ~4/3, so the check below
# caps the DECODED byte length, not the string length that arrives over the
# wire - a request just under this still crosses a bundled Vercel function,
# which is exactly why the frontend downscales photos to ~2000px/JPEG q0.85
# before ever sending them (see BillScanner.jsx) rather than relying on this
# cap alone. Also comfortably under Groq vision's own 20MB-per-image limit.
MAX_FILE_BYTES = 4 * 1024 * 1024

# Images only - see this file's module docstring on why PDF was dropped here.
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

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
    shopping receipt or invoice (counting the number of items bought), OR
    from a photo of the product itself (its packaging, label or a clothing
    tag) when no receipt is available - in that case the quantity is the
    number of that exact item visible in the photo (almost always 1)

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

If the image is not a bill, receipt, or a clothing/electronics product you \
can identify, or you cannot find a usable quantity, \
set category, subType, quantity and unit to null and confidence to 0, but still \
return valid JSON in this exact shape. Never invent a number that is not visibly \
printed on the document."""

# Best-effort (non-strict) structured output, deliberately - unlike voice.py's
# fixed schema, rawFields is a dynamic, document-defined set of keys (whatever
# labels are actually printed on this particular bill), which cannot be
# expressed as a fixed strict schema with additionalProperties: false. The
# rest of this route already re-validates every field it actually uses
# (category/quantity/confidence/rawFields) after parsing, the same as it did
# under Gemini, so best-effort mode here does not weaken those checks.
BILL_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": ["string", "null"]},
        "subType": {"type": ["string", "null"]},
        "quantity": {"type": ["number", "null"]},
        "unit": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
        "rawFields": {"type": "object"},
    },
    "required": ["category", "subType", "quantity", "unit", "confidence", "rawFields"],
}


def _get_client():
    if not GROQ_AVAILABLE:
        return None, api_error(
            "Bill scanning is not installed on this server. "
            "Run: pip install -r requirements.txt",
            503,
            code="ingest_unavailable",
        )
    if not Config.GROQ_API_KEY:
        return None, api_error(
            "Bill scanning is not configured. Add GROQ_API_KEY to backend/.env.",
            503,
            code="ingest_not_configured",
        )
    return Groq(api_key=Config.GROQ_API_KEY, timeout=18), None


@ingest_bp.route("/bill", methods=["POST"])
@require_auth
def ingest_bill():
    """
    Body: {"imageBase64": "<base64, no data: prefix>", "mimeType": "image/jpeg"}
    mimeType is any of ALLOWED_MIME_TYPES - a photo (jpeg/png/webp).

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

    if mime_type == "application/pdf":
        return api_error(
            "PDF bills are no longer supported. Please take a photo of the "
            "bill instead, or open the PDF and screenshot it.",
            400,
            code="pdf_not_supported",
        )
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
        # Groq vision models take an image the same way any OpenAI-compatible
        # vision API does: a data: URI inline in the message content, not a
        # separate "part" object the way Gemini's Part.from_bytes worked.
        data_uri = f"data:{mime_type};base64,{image_base64}"
        response = _call_groq(
            client,
            model=Config.VISION_MODEL,
            messages=[
                {"role": "system", "content": BILL_EXTRACTION_INSTRUCTION},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the activity from this bill/receipt."},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                },
            ],
            max_completion_tokens=MAX_OUTPUT_TOKENS,
            temperature=0.1,  # this is extraction, not conversation - minimise creativity
            reasoning_effort="none",
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "bill_extraction",
                    "strict": False,
                    "schema": BILL_EXTRACTION_SCHEMA,
                },
            },
        )
    except GroqRateLimitError:
        return api_error(
            "The assistant has hit its free-tier rate limit. Wait a minute and try again.",
            429,
            code="ingest_rate_limited_upstream",
        )
    except GroqAPIStatusError:
        return api_error(
            "The extraction request was rejected. Check GROQ_API_KEY and VISION_MODEL.",
            503,
            code="ingest_config_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return api_error(
            "The extraction service is having problems. Please try again shortly.",
            502,
            code="ingest_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
        return api_error("Could not reach the extraction service.", 503, code="ingest_unreachable")
    finally:
        # Explicit, even though Python's own garbage collector would get to
        # it anyway - this line is the statement that the bytes are not kept
        # around a moment longer than the call above needed them for.
        del image_bytes

    choice = response.choices[0] if response.choices else None
    raw_text = (choice.message.content or "").strip() if choice else ""
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
