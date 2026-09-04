# EcoTrack/backend/routes/voice.py
"""
Voice logging: turn a spoken sentence ("I drove 10 kilometers today") into
a proposed (category, subType, quantity, unit) - the highest-friction part
of this app (typing in a manual entry) reduced to talking for two seconds.

TWO WAYS IN, ONE EXTRACTION
POST /transcribe is the one every browser can actually use: the frontend
records a short audio clip with MediaRecorder (see components/
VoiceLogger.jsx) and uploads it here, where Groq's own Whisper model turns
it into text before the same extraction below runs on it. This replaced an
earlier approach built on the browser's own Web Speech API
(SpeechRecognition) - which, it turned out, only ever worked in Chrome/Edge
and silently failed in Opera, Brave, Vivaldi, Firefox and Safari (see
VoiceLogger.jsx's own history on this). MediaRecorder and getUserMedia are
supported everywhere a microphone can be used at all, so this is what
actually delivers "works no matter what browser" rather than "works in
Chrome and says so honestly everywhere else".

POST /parse is kept for anything that already has plain text (and is what
this route used to be built around) - same extraction, no audio step.

SAME TWO-STEP RULE AS INGEST.PY
Neither route ever saves a carbonRecords entry itself. Each only proposes
one. The frontend shows the extraction for the user to confirm, and only
then calls the ordinary POST /api/carbon/calculate route - a misheard
"drove ten kilometers" that the model mis-extracts should never be able to
silently enter someone's real emissions history.

Mounted at /api/voice
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
    _get_client,
)

voice_bp = Blueprint("voice", __name__, url_prefix="/api/voice")

MAX_TRANSCRIPT_LENGTH = 400

# A few seconds of one spoken sentence, in any of the container formats
# MediaRecorder actually produces (webm/opus in Chrome and Firefox, mp4/aac
# in Safari) - a handful of KB in practice. 10MB is already a very generous
# ceiling, there mainly to stop an absurd upload rather than to accommodate
# a real one.
MAX_AUDIO_BYTES = 10 * 1024 * 1024

# Groq's fastest Whisper model - this is a short single-sentence transcript,
# not a document, so turbo's slightly lower accuracy on long-form audio
# never comes into play.
WHISPER_MODEL = "whisper-large-v3-turbo"

# What MediaRecorder actually produces, browser by browser - Chrome/Edge and
# Firefox default to webm/opus, Safari to mp4/aac. Mapped to a filename
# extension because Groq's Whisper endpoint (like the underlying OpenAI-
# compatible API it mirrors) uses the filename to tell the container format
# apart, not just the declared content type.
AUDIO_EXTENSION_BY_MIME = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}

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


def _extract_activity(client, transcript):
    """
    Shared by /parse and /transcribe: run VOICE_LOG_INSTRUCTION over one
    already-transcribed sentence and return the validated (category,
    subType, quantity, unit, confidence, parseError) dict the frontend's
    result card expects.

    Returns (result_dict, None) on success - including the "couldn't make
    out a clear activity" case, which is a normal, expected result, not a
    failure - or (None, error_response) only for a genuine upstream
    problem (rate limit, bad config, unreachable).
    """
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
        return None, api_error(
            "The assistant has hit its free-tier rate limit. Wait a minute and try again.",
            429,
            code="voice_rate_limited_upstream",
        )
    except GroqAPIStatusError:
        return None, api_error(
            "The extraction request was rejected. Check GROQ_API_KEY and ASSISTANT_MODEL.",
            503,
            code="voice_config_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return None, api_error(
            "The extraction service is having problems. Please try again shortly.",
            502,
            code="voice_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
        return None, api_error("Could not reach the extraction service.", 503, code="voice_unreachable")

    choice = response.choices[0] if response.choices else None
    raw_text = (choice.message.content or "").strip() if choice else ""
    try:
        extracted = json.loads(raw_text)
    except (ValueError, TypeError):
        return {
            "category": None,
            "subType": None,
            "quantity": None,
            "unit": None,
            "confidence": 0.0,
            "parseError": True,
        }, None

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

    return {
        "category": category,
        "subType": extracted.get("subType") if isinstance(extracted.get("subType"), str) else None,
        "quantity": quantity,
        "unit": extracted.get("unit") if isinstance(extracted.get("unit"), str) else None,
        "confidence": confidence,
        "parseError": False,
    }, None


@voice_bp.route("/parse", methods=["POST"])
@require_auth
def parse_voice_log():
    """
    Body: {"transcript": "I drove 10 kilometers to work today"}

    Returns the proposed extraction, in the same shape ingest.py's bill
    scan returns. Saves nothing. Kept for anything that already has plain
    text - /transcribe below is what the voice-logging UI itself calls now.
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

    result, error = _extract_activity(client, transcript)
    if error:
        return error
    if result["parseError"]:
        return api_success(
            result,
            message="Could not make out a clear activity from that. Please try again or enter it manually.",
        )
    return api_success(result)


@voice_bp.route("/transcribe", methods=["POST"])
@require_auth
def transcribe_voice_log():
    """
    Body: {"audioBase64": "<base64, no data: prefix>", "mimeType": "audio/webm"}
    - the same base64-JSON shape ingest.py's bill scan uses for a photo,
    for the same reason (one consistent way this app sends binary data up,
    and every request/response stays plain JSON rather than mixing in
    multipart bodies).

    The recording is one spoken sentence, captured via MediaRecorder (see
    components/VoiceLogger.jsx). Transcribes it with Groq's Whisper model,
    then runs the exact same extraction /parse above uses, in one round
    trip - the frontend only ever has to make one call for what is, from
    its side, one action ("say it, get the extraction back").

    THIS is what actually makes voice logging work in every browser, not
    just Chrome/Edge - see this file's own module docstring for why the
    old approach (the browser's own SpeechRecognition) could not.

    Returns the same shape /parse does, plus "transcript" so the result
    card can still show what was actually heard before it was extracted.
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
    mime_type = str(body.get("mimeType", "")).strip().lower()
    audio_base64 = body.get("audioBase64")

    if not audio_base64 or not isinstance(audio_base64, str):
        return api_error("audioBase64 is required.", 400, code="missing_audio")

    try:
        # validate=True rejects anything that is not clean base64 outright,
        # rather than silently dropping bad characters - same reasoning as
        # ingest.py's identical decode.
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError):
        return api_error("audioBase64 is not valid base64.", 400, code="invalid_base64")

    if not audio_bytes:
        return api_error("The recording was empty. Please try again.", 400, code="empty_audio")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return api_error(
            "That recording is too long - keep it to one short sentence.",
            400,
            code="audio_too_large",
        )

    # Best-effort extension from the declared mime type, so Whisper can tell
    # the container format apart - falls back to webm (what Chrome and
    # Firefox actually send) rather than rejecting an unrecognised-but-valid
    # type outright, since the real information Whisper needs is the bytes
    # themselves, not a perfect filename.
    extension = AUDIO_EXTENSION_BY_MIME.get(mime_type.split(";")[0].strip(), "webm")
    filename = f"voice-log.{extension}"

    try:
        transcription = client.audio.transcriptions.create(
            model=WHISPER_MODEL,
            file=(filename, audio_bytes),
            language="en",
        )
    except GroqRateLimitError:
        return api_error(
            "The assistant has hit its free-tier rate limit. Wait a minute and try again.",
            429,
            code="voice_rate_limited_upstream",
        )
    except GroqAPIStatusError:
        return api_error(
            "Could not transcribe that recording - please try again.",
            502,
            code="voice_transcribe_error",
        )
    except (GroqInternalServerError, GroqAPITimeoutError):
        return api_error(
            "The transcription service is having problems. Please try again shortly.",
            502,
            code="voice_error",
        )
    except (GroqAPIConnectionError, GroqAPIError):
        return api_error("Could not reach the transcription service.", 503, code="voice_unreachable")

    transcript = (getattr(transcription, "text", "") or "").strip()[:MAX_TRANSCRIPT_LENGTH]

    if not transcript:
        return api_success(
            {
                "transcript": "",
                "category": None,
                "subType": None,
                "quantity": None,
                "unit": None,
                "confidence": 0.0,
                "parseError": True,
            },
            message="Didn't catch anything usable in that recording - try again, closer to the microphone.",
        )

    result, error = _extract_activity(client, transcript)
    if error:
        return error

    result["transcript"] = transcript
    if result["parseError"]:
        return api_success(
            result,
            message="Could not make out a clear activity from that. Please try again or enter it manually.",
        )
    return api_success(result)
