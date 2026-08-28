# EcoTrack/backend/tests/test_carbon_import.py
"""
Unit tests for the pure pieces of routes/carbon.py's CSV import
(_normalise_row). The route itself (import_records) touches Firestore via
save_calculated_record and is exercised through manual/integration testing
instead, the same split every other Firestore-backed route in this backend
uses - see test_household.py's own docstring for the same reasoning.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.carbon import _normalise_row  # noqa: E402


def test_normalise_row_maps_the_reports_export_headers():
    row = {"Date": "2026-01-15", "Category": "transport", "Sub-type": "petrol_car", "Quantity": "12", "Unit": "km"}
    assert _normalise_row(row) == {
        "recordedDate": "2026-01-15",
        "category": "transport",
        "subType": "petrol_car",
        "quantity": "12",
        "unit": "km",
    }


def test_normalise_row_is_case_and_whitespace_forgiving():
    row = {"  date ": "2026-01-15", "CATEGORY": "diet", "SubType": "vegetarian", "quantity": "1", "unit": "meal"}
    assert _normalise_row(row) == {
        "recordedDate": "2026-01-15",
        "category": "diet",
        "subType": "vegetarian",
        "quantity": "1",
        "unit": "meal",
    }


def test_normalise_row_ignores_an_emissions_column():
    row = {"Date": "2026-01-15", "Category": "transport", "Sub-type": "bus", "Quantity": "5", "Unit": "km",
           "Emissions (kg CO2)": "0.41"}
    normalised = _normalise_row(row)
    assert "emissionsKgCo2" not in normalised
    assert normalised["category"] == "transport"


def test_normalise_row_drops_unrecognised_columns():
    row = {"Date": "2026-01-15", "Category": "transport", "Sub-type": "bus", "Quantity": "5", "Unit": "km",
           "Notes": "carpooled"}
    assert "Notes" not in _normalise_row(row) and "notes" not in _normalise_row(row)


def test_normalise_row_handles_a_none_header_from_a_ragged_csv_line():
    # csv.DictReader puts extra unheaded values under the key None as a list
    # when a data row has more columns than the header row does.
    row = {"Date": "2026-01-15", "Category": "transport", "Sub-type": "bus", "Quantity": "5", "Unit": "km",
           None: ["stray", "extra"]}
    normalised = _normalise_row(row)
    assert normalised["category"] == "transport"
