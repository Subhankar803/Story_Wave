"""All planted errors caught, zero false positives on clean chapters."""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.demo.sample_story import load_demo_story
from app.models.chapter import Chapter
from app.models.flag import Flag
from app.models.story import Story
from app.services import model_adapter
from app.services.analysis_runner import AnalysisRunner


def test_planted_contradictions_regression(db: Session, test_story: Story):
    """Regression test verifying 100% detection of planted contradictions with zero false positives on clean chapters."""
    runner = AnalysisRunner(db)

    # Chapters 1 & 2 are clean control chapters
    ch1 = Chapter(story_id=test_story.id, number=1, text=model_adapter.DEMO_CHAPTERS[0], status="pending")
    db.add(ch1)
    db.flush()
    _, flags_ch1 = runner.run_chapter_analysis(test_story.id, ch1.id)

    # Clean chapter 1 must yield zero false positives
    assert len(flags_ch1) == 0, f"Expected 0 flags on clean chapter 1, got: {flags_ch1}"

    ch2 = Chapter(story_id=test_story.id, number=2, text=model_adapter.DEMO_CHAPTERS[1], status="pending")
    db.add(ch2)
    db.flush()
    _, flags_ch2 = runner.run_chapter_analysis(test_story.id, ch2.id)

    # Clean chapter 2 must yield zero false positives
    assert len(flags_ch2) == 0, f"Expected 0 flags on clean chapter 2, got: {flags_ch2}"

    # Chapter 3 introduces planted contradiction: Delhi -> Mumbai in one day
    ch3 = Chapter(story_id=test_story.id, number=3, text=model_adapter.DEMO_CHAPTERS[2], status="pending")
    db.add(ch3)
    db.flush()
    _, flags_ch3 = runner.run_chapter_analysis(test_story.id, ch3.id)

    assert len(flags_ch3) >= 1, "Planted error in chapter 3 (location/time conflict) was missed!"
    assert any("location" in f.type.lower() or "time" in f.type.lower() for f in flags_ch3)

    # Chapter 4 introduces 3 planted contradictions:
    # 1. green eyes (appearance)
    # 2. spirit crossing running water (world rule)
    # 3. knowing where the key is (knowledge)
    ch4 = Chapter(story_id=test_story.id, number=4, text=model_adapter.DEMO_CHAPTERS[3], status="pending")
    db.add(ch4)
    db.flush()
    _, flags_ch4 = runner.run_chapter_analysis(test_story.id, ch4.id)

    assert len(flags_ch4) >= 3, f"Expected at least 3 planted errors caught in chapter 4, got {len(flags_ch4)}"

    types_caught = {f.type for f in flags_ch4}
    assert any("trait" in t or "appearance" in t for t in types_caught)
    assert any("rule" in t for t in types_caught)
    assert any("knowledge" in t for t in types_caught)


def test_demo_endpoint_regression(client: TestClient, auth_headers: dict[str, str], test_story: Story):
    """Test loading demo story via API endpoint (FR-5)."""
    res = client.post(f"/stories/{test_story.id}/demo", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["chapters_count"] == 4
    assert data["flags_count"] >= 4
    flags = data["flags"]
    assert any("location" in f["type"].lower() for f in flags)
    assert any("trait" in f["type"].lower() for f in flags)
    assert any("rule" in f["type"].lower() for f in flags)
    assert any("knowledge" in f["type"].lower() for f in flags)
