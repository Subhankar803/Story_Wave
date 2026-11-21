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


def test_generate_with_canvas_context(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    # Test generation grounded in canvas context even without pre-existing chapter facts
    canvas_text = "Subhankar stood before the glowing terminal in Kolkata, preparing his next algorithm."
    branch_res = client.post(
        f"/stories/{test_story.id}/generate",
        json={
            "type": "branches",
            "direction": "Subhankar decides whether to deploy the model",
            "canvas_context": canvas_text,
            "emotion": "defiance",
            "intensity": 8,
        },
        headers=auth_headers,
    )
    assert branch_res.status_code == 200
    b_data = branch_res.json()
    assert len(b_data["branches"]) == 3
    # Check that branches incorporate character from canvas
    scenes_text = " ".join(b["scene"] for b in b_data["branches"])
    assert "Subhankar" in scenes_text

    # Test dialogue with canvas context
    diag_res = client.post(
        f"/stories/{test_story.id}/generate",
        json={
            "type": "dialogue",
            "character": "Subhankar",
            "situation": "Deploying the model against warnings",
            "canvas_context": canvas_text,
            "emotion": "defiance",
            "intensity": 8,
        },
        headers=auth_headers,
    )
    assert diag_res.status_code == 200
    d_data = diag_res.json()
    assert len(d_data["dialogue_options"]) == 3


def test_speak_with_soundscape(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    res = client.post(
        f"/stories/{test_story.id}/generate/speak",
        json={
            "text": "Keep your voice down... the river rapids are too close.",
            "emotion": "fear",
            "intensity": 8,
            "situation": "Kabir flees along the misty riverbanks",
            "include_soundscape": True,
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "audio_url" in data
    assert data["soundscape_url"] is not None
    assert 0.50 <= data["soundscape_volume"] <= 0.90
    assert data["soundscape_plan"] is not None
    assert "setting" in data["soundscape_plan"]

