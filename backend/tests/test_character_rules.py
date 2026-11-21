"""Tests for dynamic character rules, relationship exclusivity, and plot twists."""
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.security import create_access_token
from app.services import model_adapter
import Story_Wave_model as sb


from app.models.story import Story


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


def test_e2e_chapter_analysis_with_custom_rule(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    # Add rule
    r_rule = client.post(
        f"/stories/{test_story.id}/rules",
        json={"entity_name": "Gopu", "description": "Loves Bithika only no one else"},
        headers=auth_headers,
    )
    assert r_rule.status_code == 201

    # Update Chapter 1 with rule-violating text
    r_chap = client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 1, "text": "Subhankar does not love bithika"},
        headers=auth_headers,
    )
    assert r_chap.status_code in (200, 201)
    data = r_chap.json()
    rule_flags = [f for f in data["flags"] if f["type"] == "broken character rule"]
    assert len(rule_flags) >= 1
    assert "Subhankar does not love bithika" in rule_flags[0]["new_quote"]


def test_rule_violation_sentence_isolated_after_dialogue_quotes():
    bible = [
        sb.Fact(
            entity="Subhankar",
            attribute="rule",
            value="Loves coding",
            chapter=1,
            quote="Subhankar: Loves coding",
        )
    ]
    text = (
        'Aarav squinted with his bright green eyes at the toward him. '
        '"The key Mom hid under the staircase," he said, "is what you want, isn\'t it?" '
        'Subhankar does not love coding'
    )
    conflicts = model_adapter.check(bible, text, 4)
    rule_conflicts = [c for c in conflicts if c.type == "broken character rule"]
    assert len(rule_conflicts) == 1
    assert rule_conflicts[0].new_quote == "Subhankar does not love coding"


def test_semantic_rule_coding_vs_programming():
    bible = [
        sb.Fact(
            entity="Mohit",
            attribute="rule",
            value="I love coding",
            chapter=1,
            quote="Rule established by author: I love coding",
        )
    ]
    text = "In the afternoon, Mohit told his friend, I don't like programming at all."
    conflicts = model_adapter.check(bible, text, 1)
    rule_conflicts = [c for c in conflicts if c.type == "broken character rule"]
    assert len(rule_conflicts) >= 1
    assert "I don't like programming" in rule_conflicts[0].new_quote


def test_meera_sen_travel_time_conflict():
    bible = [
        sb.Fact(
            entity="Meera",
            attribute="event",
            value="boarded Coromandel Express to Chennai",
            chapter=1,
            quote="On Monday at 6 a.m. she boarded the Coromandel Express to Chennai. The journey would take more than a full day.",
        )
    ]
    text = "At nine that same Monday night, Meera sat in a café in Chennai, eating a hot dosa and watching rain fall on Marina Beach."
    conflicts = model_adapter.check(bible, text, 2)
    travel_conflicts = [c for c in conflicts if c.type == "location/time conflict"]
    assert len(travel_conflicts) >= 1
    assert "Chennai" in travel_conflicts[0].explanation

