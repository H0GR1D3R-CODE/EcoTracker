# EcoTrack/backend/tests/test_carbon_quality.py
"""
Unit tests for the pure statistics piece of routes/carbon.py's anomaly
detection (_median_absolute_deviation). _anomaly_check itself touches
Firestore via fetch_user_records and is exercised through manual/
integration testing instead - the same split test_carbon_import.py's own
docstring already applies to save_calculated_record/import_records.
"""

import sys
import statistics
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.carbon import _median_absolute_deviation  # noqa: E402


def test_mad_of_identical_values_is_zero():
    assert _median_absolute_deviation([5, 5, 5, 5], median=5) == 0


def test_mad_matches_a_hand_worked_example():
    # median of [1, 2, 3, 9, 10] is 3; distances from 3 are [2, 1, 0, 6, 7],
    # whose median is 2.
    values = [1, 2, 3, 9, 10]
    median = statistics.median(values)
    assert median == 3
    assert _median_absolute_deviation(values, median) == 2


def test_mad_is_not_dragged_around_by_the_single_outlier_being_tested():
    # A modified z-score's whole point is staying stable even though the
    # outlier under test is itself in the sample - MAD here should stay
    # small (driven by the tight cluster) rather than being pulled toward
    # the one very different value, the way a mean-based spread would be.
    tight_cluster = [10, 10.5, 9.5, 10, 10.2, 9.8]
    with_outlier = tight_cluster + [500]
    median = statistics.median(with_outlier)
    mad = _median_absolute_deviation(with_outlier, median)
    assert mad < 5  # nowhere near the ~80+ a mean/stddev approach would give
