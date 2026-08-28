# EcoTrack/backend/routes/voice.py
"""
Voice logging: turn a spoken sentence ("I drove 10 kilometers today") into
a proposed (category, subType, quantity, unit) - the highest-friction part
of this app (typing in a manual entry) reduced to talking for two seconds.

The browser does the speech-to-text itself (the Web Speech API, no audio
ever leaves the device for that step - see components/VoiceLogger.jsx);
this route only ever receives the resulting TEXT transcript and parses it,
the same division of labour ingest.py already has for a photographed bill
(the model reads it; the frontend shows the result for confirmation).

SAME TWO-STEP RULE AS INGEST.PY
This route NEVER saves a carbonRecords entry itself. It only proposes one.
The frontend shows the extraction for the user to confirm, and only then
calls the ordinary POST /api/carbon/calculate route - a misheard "drove ten
kilometers" that the model mis-extracts should never be able to silently
enter someone's real emissions history.

Mounted at /api/voice
"""

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
    _get_client,
)

voice_bp = Blueprint("voice", __name__, url_prefix="/api/voice")

MAX_TRANSCRIPT_LENGTH = 400

VOICE_RATE_LIMIT_MAX = 20
VOICE_RATE_LIMIT_WINDOW_SECONDS = 3600

MAX_OUTPUT_TOKENS = 300

# Same category/subType/unit table ingest.py's BILL_EXTRACTION_INSTRUCTION
# uses - the two prompts describe the exact same real schema
# (Config.CATEGORIES and this app's published emission factors), just for a
# spoken sentence instead of a printed document. Kept as a separate prompt
# rather than a shared string because the framing genuinely differs (read a
# document vs. parse a claim), even though the schema underneath is identical.
VOICE_LOG_INSTRUCTION = f"""You read one spoken sentence, transcribed from speech, describing a \
single everyday activity, and extract it as strict JSON, nothing else - no markdown fences, no \
commentary before or after the JSON object.

Valid "category" values: {', '.join(Config.CATEGORIES)}

The FULL list of valid "subType" values, grouped by category - every subType
you return MUST be one of these exact strings, and its "unit" MUST be the
one shown beside it (this is what this app's own emission factors are
published for; anything else cannot be matched to a real published number):
  transport (unit: km): petrol_car, diesel_car, motorbike, bus, train,
    flight_domestic, bicycle
  electricity (unit: kWh): grid_electricity, solar
  fuel (unit: kg for lpg, liter for the generators): lpg, petrol_generator,
    diesel_generator
  diet (unit: meal): non_vegetarian, vegetarian, vegan
  waste (unit: kg): landfill, recycled
  water (unit: liter): municipal_supply
  consumption (unit: item): clothing_item, electronics_item

Only extract a quantity the speaker actually stated in one of the units
above (km, kWh, kg, litres, a meal count, or an item count) - never convert
or estimate a quantity from something else (e.g. never turn "used the AC
for 3 hours" into a kWh guess; that has no reliable answer without knowing
the appliance). If no clear quantity in a valid unit was stated, or the
sentence does not describe a loggable activity at all, return nulls.

A speech transcript can be casual or slightly garbled - "I drove like ten
kay ems to work" still means transport/petrol_car, 10, km, unless a
different vehicle is named. Use judgement on phrasing, never on numbers.

Never invent a number the speaker did not say."""

# Strict structured output (see assistant.py's /plan route for the same
# pattern) - every property is required, and the optional ones are typed as
# a union with null rather than omitted, which is what Groq's strict mode
# demands in exchange for guaranteeing the response actually matches this
# shape.
VOICE_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": ["string", "null"], "enum": list(Config.CATEGORIES) + [None]},
        "subType": {"type": ["string", "null"]},
        "quantity": {"type": ["number", "null"]},
        "unit": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
    },
    "required": ["category", "subType", "quantity", "unit", "confidence"],
    "additionalProperties": False,
}


@voice_bp.route("/status", methods=["GET"])
@require_auth
def status():
    """Same shape as GET /api/assistant/status - the frontend hides the
    voice-log button entirely rather than showing a control that errors the
    moment it's tapped."""
    return api_success({"available": bool(GROQ_AVAILABLE and Config.GROQ_API_KEY)})


@voice_bp.route("/parse", methods=["POST"])
@require_auth
def parse_voice_log():
    """
    Body: {"transcript": "I drove 10 kilometers to work today"}

    Returns the proposed extraction, in the same shape ingest.py's bill
    scan returns. Saves nothing.
    """
    client, error = _get_client()
    if error:
        return error

    if not check_rate_limit("voice-log", g.uid, VOICE_RATE_LIMIT_MAX, VOICE_RATE_LIMIT_WINDOW_SECONDS):
        return api_error(
            "You've hit the voice-logging limit for now. Try again in a while, "
            "or enter the value directly in the Calculator.",
            429,
            code="voice_rate_limited",
        )

    body = request.get_json(silent=True) or {}
    transcript = str(body.get("transcript", "")).strip()

    if not transcript:
        return api_error("transcript is required.", 400, code="missing_transcript")
    if len(transcript) > MAX_TRANSCRIPT_LENGTH:
        return api_error(
            f"transcript must be under {MAX_TRANSCRIPT_LENGTH} characters.",
            400,
            code="transcript_too_long",
        )

    try:
        response = _call_groq(
            client,
            model=Config.ASSISTANT_MODEL,
            messages=[
                {"role": "system", "content": VOICE_LOG_INSTRUCTION},
                {"role": "user", "content": transcript},
            ],
            max_completion_tokens=MAX_OUTPUT_TOKENS,
            temperature=0.1,  # extraction, not conversation
            reasoning_effort="low",
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "voice_extraction",
                    "strict": True,
                    "schema": VOICE_EXTRACTION_SCHEMA,
                },
            },
        )
    except GroqRateLimitError:
        return api_error(
            "The assistant has hit its free-tier rate limit. Wait a minute and try again.",
            429,
            code="voice_rate_limited_upstream",
        )
    except GroqAPIStatusError:
        return api_error(
            "The extraction request was rejected. Check GROQ_API_KEY and ASSISTANT_MODEL.",
            503,
            code="voice_config_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return api_error(
            "The extraction service is having problems. Please try again shortly.",
            502,
            code="voice_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
        return api_error("Could not reach the extraction service.", 503, code="voice_unreachable")

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
            "parseError": True,
        }, message="Could not make out a clear activity from that. Please try again or enter it manually.")

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

    return api_success({
        "category": category,
        "subType": extracted.get("subType") if isinstance(extracted.get("subType"), str) else None,
        "quantity": quantity,
        "unit": extracted.get("unit") if isinstance(extracted.get("unit"), str) else None,
        "confidence": confidence,
        "parseError": False,
    })
