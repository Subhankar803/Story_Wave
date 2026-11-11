"""Tests for generation endpoints (scene, dialogue, branches)."""
from fastapi.testclient import TestClient
from app.models.story import Story


def test_generate_branches_and_dialogue(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    # Populate story with a chapter
    client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 1, "text": "Aarav lived in Delhi with his grandmother Meera. He had brown eyes."},
        headers=auth_headers,
    )

    # Generate branches
    branch_res = client.post(
        f"/stories/{test_story.id}/generate",
        json={"type": "branches", "direction": "Aarav discovers the secret staircase"},
        headers=auth_headers,
    )
    assert branch_res.status_code == 200
    b_data = branch_res.json()
    assert b_data["type"] == "branches"
    assert len(b_data["branches"]) == 3

    # Generate dialogue
    diag_res = client.post(
        f"/stories/{test_story.id}/generate",
        json={
            "type": "dialogue",
            "character": "Aarav",
            "situation": "Discovering his mother's old journal",
            "emotion": "wonder",
            "intensity": 7,
        },
        headers=auth_headers,
    )
    assert diag_res.status_code == 200
    d_data = diag_res.json()
    assert d_data["type"] == "dialogue"
    assert len(d_data["dialogue_options"]) == 3

    # Generate scene (non-streaming)
    scene_res = client.post(
        f"/stories/{test_story.id}/generate",
        json={"type": "scene", "direction": "Aarav boards the train", "stream": False},
        headers=auth_headers,
    )
    assert scene_res.status_code == 200
    assert scene_res.json()["type"] == "scene"
    assert scene_res.json()["content"]

