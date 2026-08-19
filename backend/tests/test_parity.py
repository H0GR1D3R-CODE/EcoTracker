# EcoTrack/backend/tests/test_parity.py
"""
Cross-language parity: does frontend/src/utils/scenarioMath.js (the sandbox
sliders' instant client-side preview) agree with insights_engine.py (the
server-authoritative recompute behind POST /api/insights/simulate)?

This is what backs the paper's reproducibility claim for the swap engine -
without it, "the sandbox mirrors the backend" is just a comment in two files
that could silently drift apart. WITH it, a CI run fails the moment they
disagree.

METHOD
Python generates a realistic set of swaps with generate_swaps() (so the test
fixture is exactly what a real API response would contain, not a hand-typed
approximation of one), then both engines are asked to apply the SAME slider
positions to the SAME swaps and their two answers are compared.

Requires Node.js on PATH. Skipped automatically (not failed) if Node is not
available, since Node is a frontend toolchain dependency this backend test
suite does not otherwise need.
"""

import json
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from insights_engine import generate_swaps, simulate_scenario  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCENARIO_MATH_PATH = REPO_ROOT / "frontend" / "src" / "utils" / "scenarioMath.js"

NODE_AVAILABLE = shutil.which("node") is not None

FACTORS = {
    ("transport", "petrol_car"): {"factorValue": 0.141, "unit": "km", "source": "DEFRA 2023"},
    ("transport", "bus"): {"factorValue": 0.082, "unit": "km", "source": "DEFRA 2023"},
    ("transport", "bicycle"): {"factorValue": 0.0, "unit": "km", "source": "DEFRA 2023"},
    ("transport", "train"): {"factorValue": 0.041, "unit": "km", "source": "DEFRA 2023"},
    ("diet", "non_vegetarian"): {"factorValue": 3.3, "unit": "meal", "source": "Our World in Data"},
    ("diet", "vegetarian"): {"factorValue": 1.7, "unit": "meal", "source": "Our World in Data"},
    ("diet", "vegan"): {"factorValue": 1.1, "unit": "meal", "source": "Our World in Data"},
}

# Runs scenarioMath.js's applySlidersToBaseline() on JSON piped in via stdin
# and prints its result as JSON on stdout - a thin adapter, not a rewrite of
# any logic, so the parity check exercises the real file the sandbox imports.
NODE_RUNNER = """
import { applySlidersToBaseline } from {module_path};

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const { baselineTotal, swaps, sliders } = JSON.parse(input);
  const result = applySlidersToBaseline(baselineTotal, swaps, sliders);
  process.stdout.write(JSON.stringify(result));
});
"""


def _run_js(baseline_total, swaps, sliders, tmp_path):
    module_url = SCENARIO_MATH_PATH.resolve().as_uri()
    script = NODE_RUNNER.replace("{module_path}", json.dumps(module_url))
    script_path = tmp_path / "run_scenario_math.mjs"
    script_path.write_text(script, encoding="utf-8")

    payload = json.dumps({"baselineTotal": baseline_total, "swaps": swaps, "sliders": sliders})
    completed = subprocess.run(
        ["node", str(script_path)],
        input=payload,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert completed.returncode == 0, f"node runner failed: {completed.stderr}"
    return json.loads(completed.stdout)


def _make_record(category, sub_type, quantity, factor_value, recorded_date, unit="km"):
    return {
        "category": category,
        "subType": sub_type,
        "quantity": quantity,
        "unit": unit,
        "emissionKgco2": round(quantity * factor_value, 3),
        "recordedDate": recorded_date,
    }


@pytest.mark.skipif(not NODE_AVAILABLE, reason="Node.js not found on PATH")
def test_js_sandbox_matches_python_engine_on_single_swap(tmp_path):
    today = date(2026, 6, 15)
    records = [_make_record("transport", "petrol_car", 300, 0.141, today.isoformat())]

    swaps = generate_swaps(records, FACTORS, today.year, today.month)
    assert swaps, "fixture must actually produce at least one swap"

    sliders = {swaps[0]["id"]: 0.6}
    baseline_total = round(sum(r["emissionKgco2"] for r in records), 2)

    python_result = simulate_scenario(records, FACTORS, today.year, today.month, sliders)
    js_result = _run_js(baseline_total, swaps, sliders, tmp_path)

    # Small tolerance accounts for Python's banker's rounding vs JS's
    # round-half-up on the rare value that lands exactly on .005 - not a
    # sign of the two formulas disagreeing, just of two languages rounding
    # a coin-flip case differently.
    assert abs(python_result["projectedTotal"] - js_result["projectedTotal"]) < 0.05
    assert abs(python_result["totalSavingKg"] - js_result["totalSavingKg"]) < 0.05


@pytest.mark.skipif(not NODE_AVAILABLE, reason="Node.js not found on PATH")
def test_js_sandbox_matches_python_engine_with_shared_origin_cap(tmp_path):
    """
    The trickiest case: two swaps both originate from petrol_car (-> bus and
    -> train), both sliders pushed past what the origin quantity has left.
    Both engines must cap the SAME way for their totals to agree.
    """
    today = date(2026, 6, 15)
    records = [_make_record("transport", "petrol_car", 300, 0.141, today.isoformat())]

    swaps = generate_swaps(records, FACTORS, today.year, today.month)
    sliders = {swap["id"]: 0.9 for swap in swaps if swap["fromSubType"] == "petrol_car"}
    assert len(sliders) >= 2, "fixture must produce at least two competing swaps for this to be meaningful"

    baseline_total = round(sum(r["emissionKgco2"] for r in records), 2)

    python_result = simulate_scenario(records, FACTORS, today.year, today.month, sliders)
    js_result = _run_js(baseline_total, swaps, sliders, tmp_path)

    assert abs(python_result["projectedTotal"] - js_result["projectedTotal"]) < 0.05
    assert abs(python_result["totalSavingKg"] - js_result["totalSavingKg"]) < 0.05
