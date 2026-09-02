# EcoTrack/backend/air_quality_engine.py
"""
Air quality as a second, health-framed reason to act - not just "this
lowers your number", but "the air outside is genuinely worth avoiding
today", which the behaviour-change literature treats as a materially
different, often stronger motivator than a carbon figure alone (health
co-benefits framing - e.g. Myers et al. 2012 on health-framed climate
messaging outperforming purely environmental framing).

WHY THIS IS SEPARATE FROM grid_engine.py AND weather_engine.py
Same shape as both: a real external signal (here, the US AQI at the
user's region) turned into something actionable, kept framework-free so
routes/insights.py, a future test suite, and nothing else all agree on one
classification. Unlike grid_engine.py's stated day-part model, AQI here is
a real, fetched current reading (via Open-Meteo's free, keyless Air
Quality API - the same provider weather_engine.py already uses for
temperature, so no new API key or vendor is introduced) rather than a
modelled multiplier - routes/insights.py owns the actual HTTP call and
Firestore cache, this module owns turning that number into a category and
a piece of honest advice.

THE US AQI SCALE, USED AS-IS
Open-Meteo returns the US EPA Air Quality Index directly (0-500+), the
same scale most people have seen on a weather app - no unit conversion or
reinterpretation happening here, just the EPA's own published breakpoints
turned into a label and colour band.
"""

# EPA's own published US AQI breakpoints - https://www.airnow.gov/aqi/aqi-basics/
AQI_BANDS = [
    (0, 50, "good", "Good"),
    (51, 100, "moderate", "Moderate"),
    (101, 150, "unhealthy_sensitive", "Unhealthy for sensitive groups"),
    (151, 200, "unhealthy", "Unhealthy"),
    (201, 300, "very_unhealthy", "Very unhealthy"),
    (301, 500, "hazardous", "Hazardous"),
]

# Below this AQI, no outdoor-activity nudge is worth showing - it would be
# noise on an ordinary clean-air day, the same "do not manufacture urgency
# where none exists" reasoning grid_engine's own potential_saving_percent
# threshold applies to a small grid-cleanliness gap.
AQI_NUDGE_THRESHOLD = 101


def classify_aqi(aqi):
    """(key, label) for a US AQI value - the last band is used for
    anything above 500, which the scale does not formally cover but real
    pollution events have reached."""
    for low, high, key, label in AQI_BANDS:
        if low <= aqi <= high:
            return key, label
    return AQI_BANDS[-1][2], AQI_BANDS[-1][3]


def air_quality_advice(aqi, pm25):
    """
    Turns one AQI reading into a plain-language line and whether it clears
    AQI_NUDGE_THRESHOLD - the same shape grid_intensity_now returns
    (isCurrentlyCleanest / potentialSavingPercent) so routes/insights.py
    can decide whether to log an intervention the same way it already does
    for the grid nudge.
    """
    key, label = classify_aqi(aqi)
    worth_a_nudge = aqi >= AQI_NUDGE_THRESHOLD

    if not worth_a_nudge:
        advice = "Air quality is fine right now - no reason to change your plans on this account."
    elif key == "unhealthy_sensitive":
        advice = (
            "Air quality is worse than usual today. If you have a choice, this is a good day to "
            "skip a car trip you'd otherwise take for its own sake - walking or cycling in this "
            "air is also worth a second thought if you're sensitive to pollution."
        )
    elif key == "unhealthy":
        advice = (
            "Air quality is unhealthy today. Worth avoiding unnecessary driving (both for the "
            "air and your own health) and keeping strenuous outdoor activity light."
        )
    else:
        advice = (
            "Air quality is significantly degraded today. Beyond the emissions angle, this is "
            "a day to limit time outdoors where you can, not just a day to skip a car trip."
        )

    return {
        "aqi": aqi,
        "pm25": pm25,
        "category": key,
        "categoryLabel": label,
        "worthANudge": worth_a_nudge,
        "advice": advice,
    }
