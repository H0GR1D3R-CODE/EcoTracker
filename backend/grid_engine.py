# EcoTrack/backend/grid_engine.py
"""
Time-of-day grid carbon intensity: which hours of the day India's
electricity grid is cleaner or dirtier to draw from, so a user gets a
concrete "shift this to after 10pm" nudge instead of just a flat national
number.

WHY THIS IS SEPARATE FROM THE REAL EMISSION FACTOR
carbon.py already uses a flat national/regional factor (CEA 2023, 0.710 kg
CO2 per kWh) for every electricity entry a user actually logs and saves -
and that stays exactly right for what IT does: converting a real kWh into
a real kg CO2 figure nobody's goal or streak should have a time-of-day
guess folded into. This module is deliberately separate and additive: a
NUDGE about WHEN to draw power, never a different number for WHAT was
already drawn.

THE MODEL, STATED PLAINLY (worth defending in the viva)
India's grid is not one number across a day. Solar generation - a large
and growing share of installed capacity - peaks around midday and falls
to zero after sunset, so the marginal generation the grid leans on shifts
hour to hour:
  - DAY (07:00-17:00): solar output is highest, directly displacing coal
    generation on the margin - relatively CLEANER.
  - EVENING PEAK (17:00-22:00): solar has dropped off just as demand rises
    (lighting, AC, cooking) - the "duck curve" effect seen worldwide as
    solar penetration grows - so gas/coal peaker plants cover the gap,
    making this the DIRTIEST window.
  - NIGHT (22:00-07:00): demand is lower and generation is mostly
    baseload coal/hydro/nuclear - MODERATE, close to the daily average.

These are MULTIPLIERS on carbon.py's own CEA factor, not a replacement
figure - a deliberately simple, stated model (three time bands, two state
tiers by rough renewable-capacity share), not a claim to real-time grid
telemetry, which needs paid/registered access to POSOCO/Grid-India data
this project does not have. Getting the exact multiplier right matters
far less than the existence of a real, defensible day/night difference at
all - the nudge is "shift some load off the evening peak", not a
precision forecast.

Framework-free for the same reason weather_engine.py and insights_engine.py
are - see their own docstrings.
"""

BASE_ELECTRICITY_FACTOR_KG_PER_KWH = 0.710  # CEA 2023, matches carbon.py

DAY_PART_LABELS = {
    "day": "Daytime (7am-5pm)",
    "eveningPeak": "Evening peak (5-10pm)",
    "night": "Night (10pm-7am)",
}

# Two tiers, by rough renewable (mostly solar) installed-capacity share - a
# real, stated approximation in the same spirit as weather_engine.py's
# REGION_COORDINATES, not a precision dataset. Any region not listed here
# (including "India" and "Other") falls back to OTHER_MULTIPLIERS.
HIGH_SOLAR_STATES = {
    "Karnataka", "Tamil Nadu", "Gujarat", "Rajasthan",
    "Andhra Pradesh", "Telangana", "Maharashtra",
}

HIGH_SOLAR_MULTIPLIERS = {"day": 0.82, "eveningPeak": 1.28, "night": 1.02}
OTHER_MULTIPLIERS = {"day": 0.93, "eveningPeak": 1.15, "night": 1.00}


def day_part_for_hour(hour):
    """Which of the three time bands a given hour (0-23) falls into."""
    if 7 <= hour < 17:
        return "day"
    if 17 <= hour < 22:
        return "eveningPeak"
    return "night"


def multipliers_for_region(region):
    return HIGH_SOLAR_MULTIPLIERS if region in HIGH_SOLAR_STATES else OTHER_MULTIPLIERS


def grid_intensity_now(region, current_hour):
    """
    The current time band, its multiplier, the resulting effective factor,
    and which band is actually cleanest right now - so the frontend can say
    "you're in the dirtiest window; night is X% cleaner" with a real number
    behind it, not just a generic "try to use less power in the evening".
    """
    multipliers = multipliers_for_region(region)
    current_part = day_part_for_hour(current_hour)
    cleanest_part = min(multipliers, key=multipliers.get)

    potential_saving_percent = round(
        (1 - multipliers[cleanest_part] / multipliers[current_part]) * 100, 1
    )

    return {
        "region": region,
        "currentHour": current_hour,
        "currentPart": current_part,
        "currentPartLabel": DAY_PART_LABELS[current_part],
        "currentMultiplier": multipliers[current_part],
        "effectiveFactorKgPerKwh": round(
            BASE_ELECTRICITY_FACTOR_KG_PER_KWH * multipliers[current_part], 3
        ),
        "cleanestPart": cleanest_part,
        "cleanestPartLabel": DAY_PART_LABELS[cleanest_part],
        "isCurrentlyCleanest": current_part == cleanest_part,
        "potentialSavingPercent": potential_saving_percent,
        "parts": [
            {"key": key, "label": DAY_PART_LABELS[key], "multiplier": value}
            for key, value in multipliers.items()
        ],
    }
