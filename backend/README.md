# Story Wave - Backend Service

FastAPI backend providing REST and WebSocket APIs for Story Wave.

## Tech Stack
- **Framework:** FastAPI, Python 3.11+
- **Validation:** Pydantic v2
- **ORM & DB:** SQLAlchemy 2.0, Alembic (PostgreSQL with pgvector for production; SQLite for local dev & testing)
- **AI Core:** Google Gemini API (`google-genai` SDK) via `backend/story/Story_Wave_model.py`
- **TTS & Voice:** `edge-tts`
- **Realtime:** WebSockets (`/stories/{id}/live`)
- **Authentication:** JWT with Bearer tokens & Bcrypt password hashing

## Quick Start (Local Development)

1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Or on Windows: .\venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY in .env or export it in your shell:
   export GEMINI_API_KEY="your-gemini-api-key"
   ```

4. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

5. Run test suites:
   ```bash
   pytest
   ```

