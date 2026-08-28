# EcoTrack/backend/tests/test_household.py
"""
Unit tests for the pure pieces of routes/household.py. The CRUD routes
themselves (create/join/leave/remove) all touch Firestore and are exercised
through manual/integration testing instead, the same split every other
Firestore-backed route in this backend uses - see test_engagement.py,
test_wrapped.py and test_assistant_plan.py for the same reasoning.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.household import (  # noqa: E402
    INVITE_CODE_ALPHABET,
    INVITE_CODE_LENGTH,
    MAX_CLASSROOM_MEMBERS,
    MAX_HOUSEHOLD_MEMBERS,
    VALID_GROUP_TYPES,
    _max_members,
)


def test_invite_code_alphabet_excludes_ambiguous_characters():
    # A code read aloud or copied by hand must never turn on whether a
    # character was the letter O or the digit 0, or the letter I or digit 1.
    for ambiguous in "O0I1":
        assert ambiguous not in INVITE_CODE_ALPHABET


def test_invite_code_alphabet_is_uppercase_and_alphanumeric():
    assert INVITE_CODE_ALPHABET.isupper() or INVITE_CODE_ALPHABET.isdigit() or all(
        c.isupper() or c.isdigit() for c in INVITE_CODE_ALPHABET
    )


def test_invite_code_length_and_member_cap_are_sane():
    # A regression guard, not a design defence - these are deliberate product
    # choices (see the module docstring), just worth pinning down.
    assert INVITE_CODE_LENGTH == 6
    assert MAX_HOUSEHOLD_MEMBERS == 10


def test_classroom_cap_is_larger_than_household():
    # The whole point of a second groupType - see MAX_CLASSROOM_MEMBERS'
    # own comment for why a classroom/team needs to scale past a family.
    assert MAX_CLASSROOM_MEMBERS > MAX_HOUSEHOLD_MEMBERS
    assert "household" in VALID_GROUP_TYPES
    assert "classroom" in VALID_GROUP_TYPES


def test_max_members_picks_the_right_cap_per_group_type():
    assert _max_members("household") == MAX_HOUSEHOLD_MEMBERS
    assert _max_members("classroom") == MAX_CLASSROOM_MEMBERS
    # An unset/unknown groupType (every household created before this
    # feature existed) must default to the original, smaller cap - not
    # silently let old households grow past what they signed up for.
    assert _max_members(None) == MAX_HOUSEHOLD_MEMBERS
    assert _max_members("something_else") == MAX_HOUSEHOLD_MEMBERS
