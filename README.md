# Story Wave 🌊📖

**GenAI co-writer and narrative assistant for long-form fiction and complex multiverses.**

Story Wave helps novelists and fiction writers build structured "story bibles" (characters, places, timeline, world rules) directly from their manuscripts, automatically detect narrative contradictions across chapters, and co-write in-voice dialogue, next scenes, and multiversal branching storylines.

## Key Features

- **Structured Bible Extraction:** Extracts characters, places, timeline events, and world rules with verbatim source quotes.
- **Continuous Contradiction Detection:** Detects impossible travel times/locations, changed physical traits, broken world rules, and character knowledge leakage.
- **Multiverse & Branching Narrative:** Co-creates branching scenes with continuity audits and character voice scoring.
- **Emotion & Voice Intelligence:** In-depth subtext analysis, dialogue sentiment evaluation, and AI voice preview via edge-TTS.
- **Real-Time Live Updates:** WebSocket feed for real-time bible and contradiction updates as chapters are ingested.
- **Planted-Contradiction Demo:** One-click demo test story demonstrating 100% detection of planted contradictions with zero false positives on clean chapters.

## Project Structure

```
Story_Wave/
├── .github/workflows/ci.yml   # GitHub Actions CI pipeline
├── backend/                   # FastAPI backend service
│   ├── alembic/               # Database migrations
│   ├── app/
│   │   ├── api/               # REST & WebSocket endpoints
│   │   ├── core/              # Config, security, logging, rate limiting
│   │   ├── db/                # Database engine & session
│   │   ├── demo/              # Planted-contradiction demo story
│   │   ├── models/            # SQLAlchemy 2.0 ORM models
│   │   ├── schemas/           # Pydantic v2 validation models
│   │   └── services/          # Extractor, Retriever, Checker, Generator, Live Manager
│   ├── story/                 # Core AI model & reference UI
│   └── tests/                 # Unit, API, and Regression test suites
├── Frontend/                  # Reserved for frontend client (kept clean)
└── docker-compose.yml         # Containerized local dev environment
```

## Getting Started

See [`backend/README.md`](file:///backend/README.md) for detailed backend setup and testing instructions.

