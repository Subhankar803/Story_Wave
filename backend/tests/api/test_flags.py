"""Tests for flag listing, dismissal, and resolution."""
from fastapi.testclient import TestClient
from app.models.story import Story


def test_list_and_update_flags(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    # Submit chapter 1
    client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 1, "text": "Aarav lived in Delhi. He had brown eyes."},
        headers=auth_headers,
    )
    # Submit chapter 2 with contradiction
    client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 2, "text": "Aarav squinted with his bright green eyes."},
        headers=auth_headers,
    )

    # List flags
    flags_res = client.get(f"/stories/{test_story.id}/flags", headers=auth_headers)
    assert flags_res.status_code == 200
    flags = flags_res.json()
    assert len(flags) >= 1
    flag_id = flags[0]["id"]
    assert flags[0]["status"] == "open"
    assert flags[0]["old_quote"]
    assert flags[0]["new_quote"]

    # Dismiss flag
    dismiss_res = client.patch(
        f"/stories/{test_story.id}/flags/{flag_id}",
        json={"status": "dismissed"},
        headers=auth_headers,
    )
    assert dismiss_res.status_code == 200
    assert dismiss_res.json()["status"] == "dismissed"

    # Resolve flag
    resolve_res = client.patch(
        f"/stories/{test_story.id}/flags/{flag_id}",
        json={"status": "resolved"},
        headers=auth_headers,
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "resolved"

