"""Test dynamic entity and place extraction from arbitrary narrative text."""
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.security import create_access_token
from app.services import model_adapter


def test_dynamic_entity_extraction_arbitrary_characters_and_places():
    text = "Subhankar met Bithika at Kolkata station. Later they traveled towards Mumbai on Tuesday."
    facts = model_adapter.extract(text, 1)

    entities = {f.entity for f in facts}
    assert "Subhankar" in entities
    assert any("Kolkata" in f.value or "Kolkata" in f.entity for f in facts)
    assert any("Mumbai" in f.value or "Mumbai" in f.entity for f in facts)


def test_api_bible_extracts_new_characters_and_places():
    app = create_app()
    client = TestClient(app)
    token = create_access_token("1")
    headers = {"Authorization": f"Bearer {token}"}

    # Submit a chapter with custom characters and places
    res = client.put(
        "/stories/1/chapters/10",
        json={"text": "Subhankar and Bithika arrived in Kolkata before journeying to Mumbai."},
        headers=headers,
    )
    if res.status_code == 404:
        res = client.post(
            "/stories/1/chapters",
            json={"number": 10, "text": "Subhankar and Bithika arrived in Kolkata before journeying to Mumbai."},
            headers=headers,
        )
    assert res.status_code in (200, 201)

    # Fetch Story Bible
    bible_res = client.get("/stories/1/bible", headers=headers)
    assert bible_res.status_code == 200
    bible = bible_res.json()

    char_names = {c["name"] for c in bible["characters"]}
    place_names = {p["name"] for p in bible["places"]}

    assert "Subhankar" in char_names
    assert "Bithika" in char_names
    assert "Kolkata" in place_names
    assert "Mumbai" in place_names
    assert "Narrator" not in char_names
    assert "World" not in char_names
