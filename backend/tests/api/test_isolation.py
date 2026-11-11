"""Users can only access their own stories."""
from fastapi.testclient import TestClient
from app.models.story import Story


def test_auth_data_isolation(
    client: TestClient,
    auth_headers: dict[str, str],
    second_auth_headers: dict[str, str],
    test_story: Story,
):
    # User 1 owns test_story, User 2 tries to access User 1's story
    forbidden_get = client.get(f"/stories/{test_story.id}", headers=second_auth_headers)
    assert forbidden_get.status_code == 403

    # User 2 tries to submit a chapter to User 1's story
    forbidden_post_chapter = client.post(
        f"/stories/{test_story.id}/chapters",
        json={"number": 1, "text": "Hacking someone else's story"},
        headers=second_auth_headers,
    )
    assert forbidden_post_chapter.status_code == 403

    # User 2 tries to read User 1's story bible
    forbidden_get_bible = client.get(f"/stories/{test_story.id}/bible", headers=second_auth_headers)
    assert forbidden_get_bible.status_code == 403

    # User 2 tries to trigger demo on User 1's story
    forbidden_demo = client.post(f"/stories/{test_story.id}/demo", headers=second_auth_headers)
    assert forbidden_demo.status_code == 403

    # Unauthenticated user access fails with 401
    unauth_get = client.get(f"/stories/{test_story.id}")
    assert unauth_get.status_code == 401
