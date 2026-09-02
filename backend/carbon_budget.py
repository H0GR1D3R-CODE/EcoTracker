# EcoTrack/backend/carbon_budget.py
"""
The personal carbon budget every goal, forecast alert and assistant reply
in this app is measured against - a GLIDEPATH, not a single flat number.

WHY A GLIDEPATH INSTEAD OF ONE CONSTANT
-----------------------------------------
This app used to compare everyone, every year, against a flat 2,000 kg
CO2/year "1.5 C" figure. That is a real, commonly cited PRESENT-DAY
benchmark (the "2-tonne lifestyle" target several 1.5 C-aligned personal
footprint frameworks use, e.g. the WWF/Oxfam "fair share" framing) - but a
1.5 C pathway is not flat. Staying within a 1.5 C carbon budget means the
per-capita allowance an individual can respensibly claim keeps SHRINKING
year over year as the remaining global budget is drawn down, not holding
steady until some cliff-edge deadline.

THE MODEL, STATED PLAINLY (worth defending in the viva, same spirit as
grid_engine.py's own two-tier day-part model)
A straight LINEAR interpolation between two widely-cited benchmarks:
  - 2025: 2,000 kg CO2/year - the "2-tonne lifestyle" figure already in
    wide use as a present-day 1.5 C-aligned personal target.
  - 2030: 1,500 kg CO2/year - a deliberately modest intermediate milestone
    tightening that target by 2030, consistent with the DIRECTION (not the
    exact slope) of published 1.5 C per-capita glidepaths.
Before 2025 the budget is held flat at the start value, and after 2030 it
is held flat at the end value - this is a five-year glidepath statement,
not a claim to know the correct number for 2050. Getting the exact slope
right matters far less than the existence of a real, honest "this gets
harder every year" signal instead of a flat target that quietly stopped
being ambitious the day it was set. (The two benchmark years/values are
still defined as the named constants below, in case a later report
revision wants to move either one.)

WHY THIS IS COMPUTED ONCE AT IMPORT, NOT PER REQUEST
The backend is one Vercel serverless function (see backend/vercel.json) -
cold-started at least once a day in practice, which is far more often than
the once-a-YEAR boundary this glidepath actually needs to notice. A module-
level constant computed from date.today().year at import time is the same
"good enough, stated honestly" tradeoff the rest of this codebase already
makes (see weather_engine.py and grid_engine.py's own docstrings) rather
than threading "which year" through every caller for a boundary that moves
once every twelve months.
"""

from datetime import date

BUDGET_START_YEAR = 2025
BUDGET_START_ANNUAL_KG = 2000.0

BUDGET_END_YEAR = 2030
BUDGET_END_ANNUAL_KG = 1500.0


def annual_budget_kg_for_year(year):
    """The 1.5 C-aligned annual personal budget for a given calendar year -
    see this module's own docstring for the linear glidepath it follows."""
    if year <= BUDGET_START_YEAR:
        return BUDGET_START_ANNUAL_KG
    if year >= BUDGET_END_YEAR:
        return BUDGET_END_ANNUAL_KG

    span_years = BUDGET_END_YEAR - BUDGET_START_YEAR
    progress = (year - BUDGET_START_YEAR) / span_years
    return BUDGET_START_ANNUAL_KG + (BUDGET_END_ANNUAL_KG - BUDGET_START_ANNUAL_KG) * progress


# This process's current year, fixed at import time - see the module
# docstring's own note on why that is the right tradeoff here.
CURRENT_ANNUAL_BUDGET_KG = annual_budget_kg_for_year(date.today().year)
CURRENT_MONTHLY_BUDGET_KG = CURRENT_ANNUAL_BUDGET_KG / 12
