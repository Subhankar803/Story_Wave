<div align="center">

# Story Wave
<h4>By Team Zig Zag<h4>

### An AI co-writer that remembers your whole story, catches contradictions, and audits its own suggestions.

![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini%20API-4285F4?logo=google&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-pytest-0A9EDC?logo=pytest&logoColor=white)

*Built for the **Storytelling & Narrative Assistants** track.*

</div>

---

## Table of contents

- [The problem](#the-problem)
- [What Story Wave does](#what-story-wave-does)
- [How it works](#how-it-works)
- [Try the demo](#try-the-demo)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [API overview](#api-overview)
- [Testing and quality](#testing-and-quality)
- [Security and privacy](#security-and-privacy)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Team](#team)

---

## The problem

Authors of long stories, series and shared universes lose track of small facts: a character's eye colour, where they were on a given day, a rule of the world. A character is in Delhi on Monday morning and on a beach in Mumbai that evening. A spirit that can never cross running water drifts over a river. These continuity errors are tedious to find by hand, they erode reader trust, and they often surface only after publication.

Generic AI writing tools make this worse. They write fluent text but have no memory of what has been established, so they introduce new contradictions of their own.

## What Story Wave does

Story Wave keeps a structured memory of the story, called the **story bible**, and uses it to check and to write.

**Login & Trial**
- Gives User a Login page in which they will able to create account and login to their progress.
- Gives a trial Option for every user without login or creating account.
- In trial they will able to use some exclusive features. 

**Story bible**
- Extracts characters, places, timeline events and world rules from pasted chapters into validated JSON.
- Every fact keeps the verbatim quote it came from, so every claim is traceable.

**Consistency checker**
- Compares each new chapter against the bible and flags contradictions in four categories: location and time, changed physical traits, broken world rules, and knowledge a character should not have.
- Each flag shows the original passage and the conflicting passage side by side, so the author can fix it quickly.

**Co-writing tools**
- Writes three branching versions of the next scene and three in-voice dialogue options for any character.
- **Audits its own writing:** every generated scene passes through the same consistency checker and an emotion analyzer before the author sees it.
- Authors pick a branch and it is committed to the bible; a story can be forked into a separate universe.
- Authors can see the story universe through the GRAPH feature i.e, the graph loads the whole realtionship , timeline as a whole Overview.

**Emotion and voice**
- Scores each line of dialogue for surface versus hidden emotion, intensity and subtext, and checks that the line fits the character.
- Analyses a recorded human voice (how it is said, not only the words) and flags when tone contradicts words.
- Speaks a line back with a chosen emotion and intensity.
- Background Sounds with the nature of dialogues with voice selection

**Export Options**
- Users will be able to save their work in a Word format when they will export through our application.

**Platform**
- REST API with JWT authentication and per-user data isolation, plus WebSocket live updates.
- One-call demo story with planted contradictions.
- Dockerised, with database migrations, a pytest suite and GitHub Actions CI.

> The tool **flags and suggests; the author decides.** Story Wave is built on the Gemini API with structured prompts and schema-validated output. No model is trained.

## How it works

```mermaid
flowchart LR
    UI["Frontend<br/>HTML, CSS, JavaScript"] -->|REST| API["FastAPI<br/>routes and auth"]
    API -->|WebSocket live updates| UI
    API --> RUN["analysis_runner"]
    RUN --> EX["extractor"]
    EX --> DB[("Story database<br/>facts, rules, flags")]
    RUN --> RT["retriever"]
    DB --> RT
    RT --> CK["checker"]
    CK --> DB
    API --> GN["generator"]
    API --> EV["emotion_voice"]
    EX --> MA["model_adapter"]
    CK --> MA
    GN --> MA
    EV --> MA
    MA --> GEM["Gemini API"]
```

**1. Ingest and extract.** A chapter is submitted. The extractor asks Gemini for facts as `(entity, attribute, value, chapter, day, quote)` and validates the reply with Pydantic. Attributes come from a fixed vocabulary (location, appearance, age, relationship, possession, ability, world rule, knowledge, event), so facts from different chapters can be compared.

**2. Retrieve.** For each new fact, the retriever selects the existing facts that matter for that entity, so the model does not need the entire bible in every prompt.

**3. Check.** The checker asks for genuine contradictions only. The prompt tells the model to ignore text that agrees with the bible, and flags whose two quotes are identical are dropped in code. Confirmed conflicts are saved and pushed to the client.

**4. Generate and audit.** The generator writes three branches or three dialogue options grounded in the bible. Each result is run back through the checker and the emotion analyzer in parallel, and the author sees the audit results next to the text.

**5. Commit.** The chosen branch is added to the bible, so the next chapter is checked against it.

Every model call goes through a single `model_adapter`, which keeps provider details out of the rest of the code.

## Try the demo

Story Wave ships with a sample story containing four planted errors, loadable in one call.

| Planted error | Type | Result |
|---|---|---|
| Delhi on Monday morning, Mumbai by Monday evening | Location / time | Flagged |
| Brown eyes in chapter 1, green eyes in chapter 4 | Changed physical trait | Flagged |
| A lantern spirit that "could never cross running water" drifts over a river | Broken world rule | Flagged |
| A character names the hiding place of a key that only his grandmother knew | Knowledge a character should not have | Flagged |
| A clean control chapter | None | No flags |

**To see it:** start the app (see [Setup Instructions](#setup-instructions)), click **Load demo story**, run the analysis on the last chapter, and read the flags. A sabotage mode makes the generator break one fact on purpose to show the audit catching the AI's own mistake.

## Tech stack

Story Wave is a Python and FastAPI backend with a vanilla JavaScript frontend, using Google Gemini as its AI engine.

| Layer | Technology |
|---|---|
| Frontend | HTML5, vanilla CSS, vanilla JavaScript (ES6+), Fetch API, native WebSocket. No build step, no npm |
| Backend | Python 3.11+, FastAPI, Uvicorn (ASGI), Pydantic v2 |
| AI | Google Gemini API (`google-genai`) for generation and embeddings; `edge-tts` for voice |
| Database | SQLAlchemy 2.0 and Alembic; SQLite for local development, PostgreSQL 16 with pgvector in Docker and production |
| Authentication | JWT (PyJWT, HS256), bcrypt password hashing |
| Realtime | WebSockets |
| DevOps | Docker, docker-compose, GitHub Actions |
| Testing | pytest, pytest-asyncio, httpx |
| Code quality | flake8, black, Pyright |

```text
┌──────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                      │
│           HTML5 · Vanilla CSS · Vanilla JS               │
│           Fetch API · Native WebSocket                   │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼──────────────────────────────────┐
│               FASTAPI (Python 3.11)                      │
│   Uvicorn ASGI server · CORSMiddleware                   │
│   Routes: auth / stories / chapters / bible / flags /    │
│           generate / live / demo / voice                 │
│   Auth: JWT (PyJWT) · bcrypt                             │
│   Validation: Pydantic v2                                │
│   AI services: Gemini · Edge-TTS · numpy                 │
└──────────┬────────────────────────┬──────────────────────┘
           │ SQLAlchemy ORM         │ google-genai SDK
┌──────────▼───────────┐  ┌─────────▼──────────────────┐
│  DATABASE            │  │  GOOGLE GEMINI API         │
│  SQLite (dev/test)   │  │  Text generation           │
│  PostgreSQL+pgvector │  │  Embeddings                │
│  Alembic migrations  │  │  NLI (optional)            │
└──────────────────────┘  └────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────┐
│               DOCKER / DEPLOYMENT                        │
│   docker-compose: api (port 8000) + db (port 5432)       │
│   GitHub Actions CI: pytest on ubuntu-latest             │
└──────────────────────────────────────────────────────────┘
```

### Frontend

| Category | Technology | Details |
|---|---|---|
| Structure | HTML5 | `Frontend/index.html`: single-page app structure |
| Styling | Vanilla CSS | `Frontend/style.css`: all custom styles |
| Logic | Vanilla JavaScript (ES6+) | `Frontend/script.js`: UI logic, API calls, real-time events |
| Communication | Fetch API | REST calls to the FastAPI backend |
| Real-time | Native browser WebSocket | Live chapter generation streaming |
| Serving | FastAPI `FileResponse` | The backend serves the frontend at `/`, `/app` and `/index.html` |

### Backend

**Framework and server**

| Library | Version | Purpose |
|---|---|---|
| `FastAPI` | >= 0.110.0 | Main async API framework |
| `Uvicorn[standard]` | >= 0.28.0 | ASGI server for development and production |
| `CORSMiddleware` | FastAPI built-in | Cross-origin request handling |
| `python-multipart` | >= 0.0.9 | Form data and file uploads |
| `httpx` | >= 0.27.0 | Async HTTP client for external calls |
| `websockets` | >= 12.0 | Real-time streaming of generated story content |

**Data validation and settings**

| Library | Version | Purpose |
|---|---|---|
| `pydantic` | >= 2.6.0 | Request and response schema validation |
| `pydantic-settings` | >= 2.2.0 | Environment-based configuration (`.env` files) |

**Authentication and security**

| Library | Version | Purpose |
|---|---|---|
| `PyJWT` | >= 2.8.0 | JWT creation and decoding (HS256) |
| `bcrypt` | >= 4.0.0 | Password hashing and verification |
| `passlib[bcrypt]` | >= 1.7.4 | Passlib wrapper for bcrypt |

Tokens expire after 7 days by default (configurable through the environment).

### Database

| Category | Technology | Details |
|---|---|---|
| ORM | SQLAlchemy >= 2.0.28 | Declarative models and session management |
| Migrations | Alembic >= 1.13.1 | Schema migrations in `alembic/versions/` |
| Local database | SQLite | Default (`story_wave.db`), zero-configuration development |
| Production database | PostgreSQL 16 with pgvector | Docker image `pgvector/pgvector:pg16` |
| PostgreSQL driver | `psycopg2-binary` >= 2.9.9 | Installed on non-Windows platforms |
| Configuration | `DATABASE_URL` | Environment variable that switches between SQLite and PostgreSQL |

| Model | Entity |
|---|---|
| `models/user.py` | User accounts |
| `models/story.py` | Stories |
| `models/chapter.py` | Chapters |
| `models/entity.py` | Named entities (characters, places) |
| `models/fact.py` | Extracted story facts (the story bible) |
| `models/rule.py` | Story world rules |
| `models/flag.py` | Contradiction flags |

### AI and generative AI

| Library | Version | Purpose |
|---|---|---|
| `google-genai` | >= 0.1.0 | Gemini API client for generation, embeddings and NLI |
| `edge-tts` | >= 6.1.10 | Text-to-speech for emotion-aware voice narration |
| `numpy` | >= 1.26.0 | Vector math for semantic similarity |

| Service (`app/services/`) | Purpose |
|---|---|
| `extractor.py` | Entity and fact extraction from chapters |
| `retriever.py` | Semantic retrieval from the story bible |
| `checker.py` | Contradiction detection (NLI and rule-based) |
| `generator.py` | LLM-based chapter, scene and dialogue generation |
| `emotion_voice.py` | Emotion detection and voice rendering |
| `model_adapter.py` | Gemini adapter for embeddings and text generation |
| `analysis_runner.py` | Orchestrates the full analysis pipeline |
| `live_manager.py` | Manages WebSocket live generation |

### Containers and deployment

| Technology | Purpose |
|---|---|
| Docker | Container runtime; `backend/Dockerfile` is based on `python:3.11-slim` |
| Docker Compose | Multi-service orchestration (`docker-compose.yml`) |
| Services | `api` (FastAPI on port 8000) and `db` (PostgreSQL on port 5432) |
| Volume | `pgdata`: persistent PostgreSQL data |
| Health check | `pg_isready` on the database container before the API starts |

```dockerfile
FROM python:3.11-slim
WORKDIR /app
# installs build-essential and curl, then: pip install -r requirements.txt
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### CI/CD

| Item | Details |
|---|---|
| Platform | GitHub Actions |
| Workflow | `.github/workflows/ci.yml` |
| Trigger | Push or pull request to `main` or `master` |
| Runner | `ubuntu-latest`, Python 3.11 |
| Steps | Checkout, install dependencies, run `pytest` |

### Testing

| Library | Version | Purpose |
|---|---|---|
| `pytest` | >= 8.0.0 | Test runner |
| `pytest-asyncio` | >= 0.23.0 | Async tests (`asyncio_mode = auto`) |
| `httpx` | >= 0.27.0 | HTTP client for FastAPI's test client |

| Folder | Contents |
|---|---|
| `tests/api/` | Integration tests: auth, stories, chapters, flags, generate, isolation |
| `tests/unit/` | Unit tests: checker, extractor, generator, model adapter, retriever |
| `tests/regression/` | Planted-contradiction regression tests |
| `tests/conftest.py` | Shared fixtures (database, test client, auth headers) |

### Code quality and build

| Tool | Version | Purpose |
|---|---|---|
| `flake8` | >= 7.0.0 | Linter |
| `black` | >= 24.2.0 | Formatter |
| Pyright | n/a | Static type checking (`pyrightconfig.json`) |
| VS Code | n/a | Shared workspace settings (`.vscode/settings.json`) |

The package is built with `setuptools >= 61.0` through `pyproject.toml` (PEP 517/518) and is named `story-wave-backend` v1.0.0. Python 3.11 or newer is required.

### Prototype and research (`backend/story/`)

| Technology | Purpose |
|---|---|
| Jupyter Notebook | `Story_Wave.ipynb`: the original prototype |
| Gradio | `appforstoryreshade.py`: prototype web UI |
| `google-genai`, `edge-tts` | Same Gemini and text-to-speech libraries used in the prototype |

## Project structure

```text
Story_Wave/
├── .github/
│   └── workflows/
│       └── ci.yml                          # GitHub Actions: install dependencies, run pytest
├── .vscode/
│   └── settings.json                       # Shared editor settings
├── .gitignore
├── Frontend/                               # Web UI (no build step)
│   ├── .gitkeep
│   ├── index.html                          # Layout: editor, live bible, flags, generate tool
│   ├── script.js                           # API calls, live updates, rendering
│   └── style.css                           # Styling
├── backend/
│   ├── .dockerignore
│   ├── .env.example                        # Template for environment variables (copy to .env)
│   ├── Dockerfile
│   ├── README.md                           # Backend-specific notes
│   ├── alembic.ini
│   ├── alembic/                            # Database migrations
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── .gitkeep
│   │       └── 17728a8f7f4e_initial_schema.py
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                         # FastAPI application entry point
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── deps.py                     # Shared dependencies (DB session, current user)
│   │   │   └── routes/
│   │   │       ├── __init__.py
│   │   │       ├── auth.py                 # Register and login
│   │   │       ├── stories.py              # Create, list and fetch stories
│   │   │       ├── chapters.py             # Submit and edit chapters
│   │   │       ├── bible.py                # Characters, places, timeline, rules
│   │   │       ├── flags.py                # List, dismiss and resolve contradictions
│   │   │       ├── generate.py             # Next scene, dialogue, branches
│   │   │       ├── live.py                 # WebSocket live updates
│   │   │       └── demo.py                 # Load the planted-contradiction demo story
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py                   # Settings loaded from the environment
│   │   │   ├── logging.py                  # Structured logging
│   │   │   ├── rate_limit.py               # Rate limiting for AI endpoints
│   │   │   └── security.py                 # Password hashing and JWT
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── base.py                     # SQLAlchemy declarative base
│   │   │   └── session.py                  # Engine and session factory
│   │   ├── demo/
│   │   │   ├── __init__.py
│   │   │   └── sample_story.py             # Demo story with planted contradictions
│   │   ├── models/                         # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── story.py
│   │   │   ├── chapter.py
│   │   │   ├── entity.py                   # Characters, places, objects
│   │   │   ├── fact.py                     # Extracted facts with source quotes
│   │   │   ├── rule.py                     # World rules
│   │   │   └── flag.py                     # Detected contradictions
│   │   ├── schemas/                        # Pydantic request and response models
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── story.py
│   │   │   ├── chapter.py
│   │   │   ├── bible.py
│   │   │   ├── flag.py
│   │   │   └── generate.py
│   │   └── services/                       # The AI pipeline, one module per stage
│   │       ├── __init__.py
│   │       ├── analysis_runner.py          # Orchestrates extract, retrieve, check
│   │       ├── extractor.py                # Chapter text to structured facts
│   │       ├── retriever.py                # Selects the facts relevant to new text
│   │       ├── checker.py                  # Detects and explains contradictions
│   │       ├── generator.py                # Scenes, dialogue and branches
│   │       ├── emotion_voice.py            # Emotion scoring and voice features
│   │       ├── live_manager.py             # Pushes live updates to connected clients
│   │       └── model_adapter.py            # Single gateway to the Gemini API
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── story/                              # Original notebook prototype (kept for reference)
│   │   ├── README S.md
│   │   ├── Story_Wave.ipynb
│   │   ├── Story_Wave_model.py
│   │   ├── appforstoryreshade.py
│   │   └── requirementsforstory.txt
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py                     # Shared fixtures
│       ├── api/                            # Endpoint tests
│       │   ├── __init__.py
│       │   ├── test_auth.py
│       │   ├── test_stories.py
│       │   ├── test_chapters.py
│       │   ├── test_flags.py
│       │   ├── test_generate.py
│       │   └── test_isolation.py           # Users cannot access each other's stories
│       ├── regression/                     # Planted-contradiction suite
│       │   ├── __init__.py
│       │   ├── fixtures/
│       │   │   └── .gitkeep
│       │   └── test_planted_contradictions.py
│       └── unit/                           # One test module per pipeline stage
│           ├── __init__.py
│           ├── test_extractor.py
│           ├── test_retriever.py
│           ├── test_checker.py
│           ├── test_generator.py
│           └── test_model_adapter.py
├── docker-compose.yml
├── pyrightconfig.json                      # Type-checking configuration
└── README.md
```

Generated files such as `__pycache__/`, `.pytest_cache/`, `.ipynb_checkpoints/` and the local SQLite database (`story_wave.db`) are created at runtime and are excluded from version control.

## Setup Instructions

Story Wave runs in two ways: **locally with SQLite** (no database setup, recommended for development) or **with Docker** (PostgreSQL 16 with pgvector, closer to production).

### Prerequisites

| Requirement | Minimum version | Check command |
|---|---|---|
| Python | 3.11+ | `python --version` |
| pip | latest | `pip --version` |
| Git | any | `git --version` |
| Docker (optional) | 24+ | `docker --version` |
| Docker Compose (optional) | 2.x | `docker compose version` |

You also need a free **Google Gemini API key**: https://aistudio.google.com/app/apikey

### Option 1: Local development (SQLite)

**1. Clone the repository**

```bash
git clone https://github.com/Subhankar803/Story_Wave.git
cd Story_Wave
```

**2. Create and activate a virtual environment**

```powershell
# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\activate
```

```bash
# macOS / Linux
python -m venv venv
source venv/bin/activate
```

You should see `(venv)` at the start of your terminal prompt.

**3. Install dependencies**

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

**4. Configure environment variables**

```bash
# still inside backend/
cp .env.example .env               # Windows: copy .env.example .env
```

Open `.env` and fill in your values:

```env
PROJECT_NAME="Story Wave"
API_V1_STR=""

# REQUIRED: your Google Gemini API key
GEMINI_API_KEY="your-gemini-api-key-here"

# JWT secret: change this to a long random string in production
SECRET_KEY="replace_with_a_secure_random_secret_key"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=10080   # 7 days

# Database: SQLite for local development (no setup needed)
DATABASE_URL="sqlite:///./story_wave.db"

# CORS: allow all origins for local development only
CORS_ORIGINS=["*"]

# Rate limiting (requests per minute per user)
RATE_LIMIT_PER_MINUTE=60

# Optional AI settings
USE_NLI_FILTER=false
EMBEDDINGS_MODEL="gemini"
```

> **Never commit your `.env` file.** It is listed in `.gitignore`.

**5. Start the development server**

From inside `backend/`:

```bash
uvicorn app.main:app --reload --port 8000
```

`--reload` restarts the server when code changes, and `--port 8000` sets the port. You should see output like:

```text
INFO:     Story Wave backend started successfully.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

**6. Open the application**

The backend serves the frontend, so there is nothing separate to start.

| URL | Description |
|---|---|
| `http://localhost:8000` | Frontend UI (served by FastAPI) |
| `http://localhost:8000/app` | Frontend app (alternate route) |
| `http://localhost:8000/docs` | Interactive Swagger API docs |
| `http://localhost:8000/redoc` | ReDoc API documentation |
| `http://localhost:8000/health` | Health check |

### Option 2: Docker (PostgreSQL 16 with pgvector)

**1. Set the required environment variables**

From the project root (`Story_Wave/`), either export them in your shell:

```bash
export GEMINI_API_KEY="your-gemini-api-key-here"     # required
export SECRET_KEY="your-secure-random-secret-key"    # has a default, but change it for production
```

or create a `.env` file in the project root:

```env
GEMINI_API_KEY=your-gemini-api-key-here
SECRET_KEY=your-secure-random-secret-key
```

**2. Build and start all services**

```bash
docker compose up --build
```

This builds the FastAPI image (`python:3.11-slim`), starts PostgreSQL 16 with pgvector (`pgvector/pgvector:pg16`), waits for the database health check, and then starts the API on port 8000.

```bash
docker compose up --build -d     # run in the background
docker compose down              # stop all services
docker compose down -v           # stop and delete the database volume (full reset)
```

**3. Open the application**

Same URLs as local development: `http://localhost:8000` (UI), `/docs` (API docs) and `/health`. PostgreSQL is available directly on `localhost:5432`.

### Database migrations

With SQLite, the app creates its tables automatically on startup. For PostgreSQL and production, run the migrations with Alembic from `backend/` (virtual environment activated):

```bash
alembic upgrade head                                    # apply all pending migrations
alembic current                                         # show the current version
alembic history                                         # show migration history
alembic revision --autogenerate -m "describe change"    # create a migration after changing models
```

### Running the tests

From `backend/` with the virtual environment activated:

```bash
pytest                           # all tests
pytest -v                        # verbose
pytest tests/unit/               # unit tests
pytest tests/api/                # API integration tests
pytest tests/regression/         # planted-contradiction regression tests
pytest tests/api/test_auth.py    # a single file
```

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | none | Google Gemini API key |
| `SECRET_KEY` | Yes (production) | built-in development value | JWT signing secret. Always set your own for any deployed instance |
| `DATABASE_URL` | No | `sqlite:///./story_wave.db` | Database connection string |
| `PROJECT_NAME` | No | `Story Wave` | App display name |
| `ALGORITHM` | No | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `10080` (7 days) | JWT token expiry |
| `CORS_ORIGINS` | No | `["*"]` | Allowed CORS origins. Restrict this in production |
| `RATE_LIMIT_PER_MINUTE` | No | `60` | API rate limit per user |
| `USE_NLI_FILTER` | No | `false` | Enable the NLI contradiction filter |
| `EMBEDDINGS_MODEL` | No | `gemini` | Embeddings backend |

PostgreSQL connection string format:

```text
postgresql+psycopg2://username:password@host:5432/database_name
```

### Troubleshooting

**`ModuleNotFoundError` after cloning.** Make sure the virtual environment is activated and that you ran `pip install -r requirements.txt` from the `backend/` folder.

**`GEMINI_API_KEY` not set, or AI features not working.** Check that a `.env` file exists inside `backend/` and contains a valid `GEMINI_API_KEY`.

**Port 8000 is already in use.**

```powershell
# Windows (PowerShell)
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

```bash
# macOS / Linux
lsof -i :8000
kill -9 <PID>
```

Or run on a different port: `uvicorn app.main:app --reload --port 8080`.

**Docker: database not ready.** The `docker-compose.yml` health check retries 5 times. If it still fails:

```bash
docker compose down -v
docker compose up --build
```

**SQLite permission errors (Windows).** The database is created as `backend/story_wave.db`. Make sure the `backend/` folder is writable.

### For contributors

```bash
black .      # format code before committing
flake8 .     # check for linting issues
pytest       # run all tests before pushing
```

CI runs `pytest` automatically on every push and pull request.

## API overview

Full, always up-to-date reference with request and response schemas: **`/docs`** (Swagger) and **`/redoc`**. Key endpoints:

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Log in and receive a JWT |
| GET | `/stories` | List stories |
| POST | `/stories` | Create a story |
| GET | `/stories/{id}` | Get a story |
| POST | `/chapters` | Add a chapter to a story |
| GET | `/chapters/{id}` | Get a chapter |
| GET | `/bible/{story_id}` | Get the story bible (facts, entities, rules) |
| GET | `/flags/{story_id}` | Get contradiction flags |
| POST | `/generate` | AI generation |
| WS | `/live/{story_id}` | WebSocket: real-time updates |
| POST | `/voice` | Generate text-to-speech audio |
| GET | `/demo` | Seed a demo story with planted contradictions |
| GET | `/health` | Health check |

## Testing and quality

- **Unit tests** for each pipeline stage: extractor, retriever, checker, generator and the model adapter.
- **API tests** for the endpoints, including authentication and **data isolation** between users.
- **Planted-contradiction regression suite** (`tests/regression`): every planted error must be caught, with no false alarms on clean control chapters.
- In the project's prototype testing, the checker flagged **all four** planted error types and raised **no false alarm** on a clean chapter.
- GitHub Actions runs `pytest` on every push and pull request to `main` or `master`.

## Security and privacy

- API keys live only in environment variables. They are never logged or committed. If a key is ever exposed, revoke it and create a new one.
- Requests are rate limited per user (`RATE_LIMIT_PER_MINUTE`, default 60).
- CORS origins are set through `CORS_ORIGINS`. The local default allows all origins, so restrict it to your frontend's address in production.
- Set a strong, unique `SECRET_KEY` for any deployed instance and never rely on the built-in development default.
- Passwords are hashed with bcrypt. Sessions use signed JWTs (HS256) that expire after 7 days by default.
- Each user can access only their own stories.
- A user's manuscript is used only to serve that user's requests, and chapter text is sent to the Gemini API for analysis.
- Voice features process recordings through the AI provider. Use them only with the speaker's consent, and do not store recordings.

## Limitations

- Flags and scores are **AI judgments, not proof**. Results can vary slightly between runs, so the author makes the final call.
- Emotion scoring and voice analysis are interpretations, not measurements.
- The generated AI voice conveys emotion through speed, pitch and volume only, and relies on an online text-to-speech service that can be unreliable.
- The free Gemini tier can be rate limited or overloaded at busy times.
- Very long manuscripts depend on retrieval quality; subtle contradictions can still be missed.

## Roadmap

- Relationship graph and timeline views for the bible.
- Richer emotional speech synthesis.
- Per-universe comparison and merging for forked stories.
- Multi-author collaboration.
- Export to publishing formats.

## Documentation

- Backend product requirements document
- Frontend product requirements document
- "How it works" overview

Keep these in a `docs/` folder and link them here.

## Team

**Team ZigZag**

| Role | Name |
|---|---|
| Team Leader | Subhankar Dey |
| Member | Sunith Konar |
| Member | Rashda Qamar |
| Member | Surya Shekhar Bose |


---

<div align="center">
<sub>Story Wave is a writing assistant. It flags and suggests, and the author keeps creative control.</sub>
</div>
