"""Tests for chapter submission, edit, and bible extraction."""
from fastapi.testclient import TestClient
from app.models.story import Story


def test_submit_chapter_and_get_bible(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    # Submit chapter 1
    ch1_text = (
        "Aarav, seventeen, lived in Delhi with his grandmother. "
        "He had brown eyes and wore the silver watch his late mother Meera had left him. "
        "The old lantern spirits of the city could never cross running water, his grandmother warned him."
    )
    res1 = client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 1, "text": ch1_text},
        headers=auth_headers,
    )
    assert res1.status_code == 201
    result1 = res1.json()
    assert result1["chapter"]["number"] == 1
    assert result1["extracted_facts_count"] > 0
    assert result1["flags_count"] == 0

    # Check bible
    bible_res = client.get(f"/stories/{test_story.id}/bible", headers=auth_headers)
    assert bible_res.status_code == 200
    bible_data = bible_res.json()
    assert bible_data["total_facts"] > 0
    assert len(bible_data["facts"]) > 0

    # Submit chapter 2 (with conflict: bright green eyes)
    ch2_text = "Aarav squinted with his bright green eyes at the stranger in Delhi."
    res2 = client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 2, "text": ch2_text},
        headers=auth_headers,
    )
    assert res2.status_code == 201
    result2 = res2.json()
    assert result2["flags_count"] >= 1


def test_edit_chapter(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    # Submit chapter 1
    client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 1, "text": "Aarav lived in Delhi. He had brown eyes."},
        headers=auth_headers,
    )

    # Edit chapter 1
    edit_res = client.put(
        f"/stories/{test_story.id}/chapters/1",
        json={"text": "Aarav lived in Delhi with his grandmother. He had brown eyes and a silver pocket watch."},
        headers=auth_headers,
    )
    assert edit_res.status_code == 200
    edit_data = edit_res.json()
    assert edit_data["chapter"]["number"] == 1
    assert "silver pocket watch" in edit_data["chapter"]["text"]


def test_delete_chapter(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    # Submit chapter 1 & chapter 2
    client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 1, "text": "Chapter one content in Delhi."},
        headers=auth_headers,
    )
    client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 2, "text": "Chapter two content in Mumbai."},
        headers=auth_headers,
    )

    # Delete chapter 1
    del_res = client.delete(
        f"/stories/{test_story.id}/chapters/1",
        headers=auth_headers,
    )
    assert del_res.status_code == 200
    assert del_res.json()["remaining_count"] == 1

    # Chapter 2 should now be re-sequenced to Chapter 1
    bible_res = client.get(f"/stories/{test_story.id}/bible", headers=auth_headers)
    assert bible_res.status_code == 200


def test_websocket_live_connection(client: TestClient, test_story: Story):
    with client.websocket_connect(f"/stories/{test_story.id}/live") as websocket:
        websocket.send_text("ping")
        data = websocket.receive_text()
        assert "pong" in data
