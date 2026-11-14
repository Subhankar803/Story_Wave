"""Tests for dynamic character rules, relationship exclusivity, and plot twists."""
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.security import create_access_token
from app.services import model_adapter
import Story_Wave_model as sb


def test_rule_relationship_negation_flagged():
    bible = [
        sb.Fact(
            entity="Gopu",
            attribute="rule",
            value="Loves Bithika only no one else",
            chapter=1,
            quote="Rule established by author: Gopu: Loves Bithika only no one else",
        )
    ]
    text = "Subhankar does not love bithika"
    conflicts = model_adapter.check(bible, text, 7)
    assert len(conflicts) == 1
    assert conflicts[0].type == "broken character rule"
    assert "Rule violation" in conflicts[0].explanation
    assert "Subhankar does not love bithika" in conflicts[0].new_quote


def test_rule_relationship_twist_conspiracy():
    bible = [
        sb.Fact(
            entity="Gopu",
            attribute="rule",
            value="Loves Bithika only no one else",
            chapter=1,
            quote="Rule established by author: Gopu: Loves Bithika only no one else",
        )
    ]
    text = "Subhankar smirked, secretly whispering as part of the conspiracy that he does not love bithika."
    conflicts = model_adapter.check(bible, text, 7)
    assert len(conflicts) == 1
    assert conflicts[0].type == "conspiracy / plot twist"
    assert "Conspiracy / Plot Twist" in conflicts[0].explanation


def test_rule_exclusivity_violation():
    bible = [
        sb.Fact(
            entity="Gopu",
            attribute="rule",
            value="Loves Bithika only no one else",
            chapter=1,
            quote="Rule established by author: Gopu: Loves Bithika only no one else",
        )
    ]
    text = "Under the moonlight, Gopu loves Alice passionately."
    conflicts = model_adapter.check(bible, text, 7)
    assert len(conflicts) == 1
    assert conflicts[0].type == "broken character rule"
    assert "Exclusivity rule violation" in conflicts[0].explanation


def test_rule_lactose_intolerance():
    bible = [
        sb.Fact(
            entity="Gopu",
            attribute="rule",
            value="lactose intolerant, cannot drink milk",
            chapter=1,
            quote="Gopu is lactose intolerant",
        )
    ]
    text = "Gopu drank a glass of cold milk at breakfast."
    conflicts = model_adapter.check(bible, text, 2)
    assert len(conflicts) == 1
    assert conflicts[0].type == "broken character rule"


def test_e2e_chapter_analysis_with_custom_rule():
    app = create_app()
    client = TestClient(app)
    token = create_access_token("1")
    headers = {"Authorization": f"Bearer {token}"}

    # Add rule
    r_rule = client.post(
        "/stories/1/rules",
        json={"entity_name": "Gopu", "description": "Loves Bithika only no one else"},
        headers=headers,
    )
    assert r_rule.status_code == 201

    # Update Chapter 7 with rule-violating text
    r_chap = client.put(
        "/stories/1/chapters/7",
        json={"text": "Subhankar does not love bithika"},
        headers=headers,
    )
    if r_chap.status_code == 404:
        r_chap = client.post(
            "/stories/1/chapters",
            json={"number": 7, "text": "Subhankar does not love bithika"},
            headers=headers,
        )
    assert r_chap.status_code == 200
    data = r_chap.json()
    rule_flags = [f for f in data["flags"] if f["type"] == "broken character rule"]
    assert len(rule_flags) >= 1
    assert "Subhankar does not love bithika" in rule_flags[0]["new_quote"]
