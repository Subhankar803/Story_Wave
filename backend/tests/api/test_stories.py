"""Tests for story endpoints."""
from fastapi.testclient import TestClient


def test_create_and_list_stories(client: TestClient, auth_headers: dict[str, str]):
    # Create story
    create_res = client.post(
        "/stories",
        json={"title": "The Multiverse Chronicler"},
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    story_data = create_res.json()
    assert story_data["title"] == "The Multiverse Chronicler"
    story_id = story_data["id"]

    # List stories
    list_res = client.get("/stories", headers=auth_headers)
    assert list_res.status_code == 200
    stories = list_res.json()
    assert len(stories) >= 1
    assert any(s["id"] == story_id for s in stories)

    # Fetch single story
    get_res = client.get(f"/stories/{story_id}", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "The Multiverse Chronicler"

