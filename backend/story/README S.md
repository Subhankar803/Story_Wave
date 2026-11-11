# Story Bible: model layer

`Story_Wave_model.py` is the AI backend logic. Pure functions: no UI, no storage, no global state.
Nothing is trained; each function sends a structured prompt to the Gemini API and validates the reply with a Pydantic schema.

`app.py` is a test harness / reference UI built only on `Story_Wave_model.py` (run `python app.py` to try every function in a browser). Replace it with the production UI/API.

## Setup
    pip install -r requirements.txt
    set GEMINI_API_KEY=...        (PowerShell: $env:GEMINI_API_KEY="...")
    python Story_Wave_model.py   (smoke test: expect 4 "FLAG" lines, then "Bible has N facts")

Never commit the key. Use an environment variable or a secret manager.

## Functions
The story bible is a plain `list[Fact]`. Functions never mutate it; they return new data.

| Function | In -> Out |
|---|---|
| `extract(text, chapter)` | chapter text -> `list[Fact]` |
| `check(bible, text, chapter)` | new text -> `list[Conflict]` (empty = consistent) |
| `commit_scene(bible, scene, chapter)` | -> NEW bible with the scene's facts added |
| `fork_bible(bible)` | -> independent copy (multiverse) |
| `analyze_emotion(bible, text, chapter)` | dialogue -> `EmotionReport` (surface vs hidden emotion, intensity 1-10, voice match) |
| `analyze_voice(audio_path)` | real human audio -> `VoiceReport` (emotion, intensity, words-vs-tone mismatch) |
| `speak(text, emotion, intensity)` | -> path to an .mp3 (AI voice via edge-tts) |
| `generate_branches(bible, direction, emotion, intensity)` | -> 3 branching scenes |
| `write_branches_audited(bible, direction, emotion, intensity, chapter)` | -> 3 branches, each with continuity flags + emotion report |
| `write_dialogue(bible, character, situation, emotion, intensity)` | -> 3 in-voice dialogue options |

Persist a bible: `json.dump([f.model_dump() for f in bible], fp)`; load: `[Fact(**d) for d in json.load(fp)]`.

## Known limits
- Results are LLM interpretations, not measurements. Scores can shift a point or two between runs/models.
- `MODELS` lists Gemini model names that change often; a 404 means edit the list. Free tier returns 503/429 under load (handled by fallback + retry).
- `speak()` uses edge-tts (unofficial, needs internet); emotion is only speed/pitch/volume. Swap for a better TTS if needed.
- `analyze_voice` sends audio to Google's API: get the speaker's consent, do not store clips.
- Tested in the notebook: extract, check, analyze_emotion, analyze_voice, speak. Written but not yet run: generate_branches, write_branches_audited, write_dialogue, fork_bible.
