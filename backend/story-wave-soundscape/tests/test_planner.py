import json

import pytest

from app.planner import Planner, parse_plan

GOOD = {"setting": "fish market", "ambience_prompt": "busy open-air market crowd, distant, steady murmur",
        "mood": "lively", "volume": 0.2}


def test_plain_json():
    p = parse_plan(json.dumps(GOOD))
    assert p.ambience_prompt.startswith("busy open-air market")


def test_schema_echoed_before_answer():
    """The failure seen in the notebook: the model repeated the schema, then gave the real answer."""
    reply = json.dumps({"properties": {"setting": {"type": "string"}}, "type": "object"}) + "\n" + json.dumps(GOOD)
    assert parse_plan(reply).setting == "fish market"


def test_code_fences_and_chatter():
    reply = "Here you go:\n```json\n" + json.dumps(GOOD) + "\n```\nHope that helps!"
    assert parse_plan(reply).mood == "lively"


def test_volume_is_clamped():
    assert parse_plan(json.dumps({**GOOD, "volume": 5})).volume == 0.35
    assert parse_plan(json.dumps({**GOOD, "volume": 0})).volume == 0.05


def test_no_plan_raises():
    with pytest.raises(ValueError):
        parse_plan("sorry, I cannot do that")


def test_planner_retries_then_succeeds():
    calls = []

    def flaky(prompt):
        calls.append(1)
        if len(calls) == 1:
            raise ConnectionError("boom")
        return json.dumps(GOOD)

    assert Planner(flaky, attempts=2).plan("market", "joy", 5, "").ambience_prompt
    assert len(calls) == 2


def test_planner_gives_up():
    with pytest.raises(RuntimeError):
        Planner(lambda p: "nonsense", attempts=2).plan("market", "joy", 5, "")
