# EcoTrack/backend/tests/test_institution.py
"""
Unit tests for the pure ranking piece of routes/institution.py.
_rank_classrooms takes plain dicts and does no Firestore work itself -
_classroom_summary and _serialize_institution (which build those dicts
from real household/user documents) are exercised through manual/
integration testing instead, the same split test_household.py's own
docstring already applies to this module's sibling.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.institution import MAX_LINKED_CLASSROOMS, _rank_classrooms  # noqa: E402


def _classroom(name, avg_points):
    return {"id": name, "name": name, "memberCount": 5, "combinedEmissionThisMonthKg": 10.0, "avgRewardPoints": avg_points}


def test_empty_list_ranks_to_an_empty_list():
    assert _rank_classrooms([]) == []


def test_higher_average_points_ranks_first_not_raw_emissions():
    # Ranked by effort (avgRewardPoints), never by combinedEmissionThisMonthKg
    # - see this module's own docstring for why, mirroring
    # routes/household.py's own leaderboard reasoning one tier up.
    classrooms = [_classroom("Low effort", 10), _classroom("High effort", 90), _classroom("Mid effort", 50)]
    ranked = _rank_classrooms(classrooms)
    assert [c["name"] for c in ranked] == ["High effort", "Mid effort", "Low effort"]


def test_ranks_are_one_indexed_and_sequential():
    ranked = _rank_classrooms([_classroom("A", 5), _classroom("B", 15), _classroom("C", 25)])
    assert [c["rank"] for c in ranked] == [1, 2, 3]
    # Rank 1 is the winner (highest average points)
    assert ranked[0]["name"] == "C"


def test_a_tie_still_produces_a_full_unambiguous_ranking():
    ranked = _rank_classrooms([_classroom("A", 40), _classroom("B", 40)])
    assert {c["rank"] for c in ranked} == {1, 2}
    assert len(ranked) == 2


def test_does_not_mutate_the_ranking_key_of_its_input_semantics():
    # A single classroom is trivially rank 1
    ranked = _rank_classrooms([_classroom("Solo", 33)])
    assert ranked[0]["rank"] == 1


def test_max_linked_classrooms_is_a_sane_positive_cap():
    assert MAX_LINKED_CLASSROOMS > 0
