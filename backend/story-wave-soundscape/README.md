# Story Wave: background sound service

Takes the **environment** and **emotion** your analysis model produces for a line of dialogue and returns a
background-sound `.wav` (rain, market, room tone...), looped to any length you ask for.

```
your model -> POST /v1/background -> Gemini writes a sound prompt -> MOSS-SoundEffect v2.0 generates 4 s
           -> looped + faded to duration_seconds -> GET .../audio (wav)
```

The voice and the final mix are **not** part of this service. The response includes a suggested `volume` (0.05-0.35)
so whoever mixes the voice can lay the ambience under it.

## Status: read this first

| Part | State |
|---|---|
| API, queue, cache, planner parsing, looping/fades | **Tested** (16 automated tests + a live HTTP run, in dev mode on a CPU) |
| MOSS generation call and its settings | Same calls and settings as the Colab notebook that produced the approved sound (T4). **Not tested inside this service.** |
| Dockerfile | **Not built or run.** Written from the steps that worked on Colab. Expect to fix small things on the first build. |
| Gemini call (`google-genai`) | **Not tested.** Confirm `GEMINI_MODEL` exists for your key. Use the same model as `story_bible_model.py`. |

First thing to do on a GPU machine: build the image and run `scripts/smoke_test.py` (below).

## Requirements

- NVIDIA GPU with **16 GB+ VRAM**. The model uses about 10.6 GB, and a T4 (15 GB) worked but with little headroom. An L4 (24 GB) is comfortable.
- Docker with the NVIDIA container toolkit. Python 3.12 (inside the image).
- A Gemini API key.
- Disk: about 11 GB for model weights (downloaded on first start into the `/models` volume).

## Run

```bash
cp .env.example .env        # add GEMINI_API_KEY, and set API_KEY for any non-local use
docker build -t story-wave-sound --build-arg MOSS_REF=<commit-hash> .
docker run --gpus all -p 8000:8000 --env-file .env \
    -v sw_models:/models -v sw_data:/data story-wave-sound
python scripts/smoke_test.py --url http://localhost:8000 --api-key "$API_KEY"
```

The first start downloads the weights. `GET /health` returns 503 with `"status": "loading"` until the model is
ready, then 200. Pin `MOSS_REF` to a known commit so builds are reproducible.

### Try the API with no GPU and no Gemini key

```bash
pip install -r requirements-dev.txt
DEV_FAKE=1 uvicorn app.main:app --port 8000      # fake noise audio, canned plans
pytest
```

## API

Interactive docs at `/docs`. If `API_KEY` is set, send `X-API-Key` on every call except `/health`.

**`POST /v1/background`** returns `202` with a job id.

```json
{
  "environment": "busy open-air fish market in the morning",
  "emotion": "cheerful",
  "intensity": 4,
  "dialogue": "Two kilos of tomatoes, please.",
  "duration_seconds": 12
}
```

| Field | Notes |
|---|---|
| `environment`, `emotion`, `intensity` (1-10) | From your analysis model. |
| `dialogue` | Optional, context only. |
| `duration_seconds` | Length of the returned wav, 1 to `MAX_DURATION_SECONDS` (120). The 4 s clip is looped with a crossfade. |
| `ambience_prompt` | Optional. Skips Gemini and uses this exact prompt (for a pre-approved library). |
| `seed` | Same prompt + seed = same sound (and a cache hit). |
| `fade` | Default true: 0.5 s fade in, 1 s fade out. |

**`GET /v1/jobs/{id}`** returns `status` (`planning`, `queued`, `running`, `done`, `failed`), the `plan`
(including the suggested `volume`), `error`, `cache_hit`, timings and `audio_url`.

**`GET /v1/jobs/{id}/audio`** returns the wav (48 kHz, mono, 16-bit) once `done`.

Errors: `401` bad key, `404` unknown or expired job, `409` audio not ready, `422` bad input, `429` queue full (retry later).

## How it works and why

- **One GPU worker thread.** A second clip generated at the same moment would run out of GPU memory, so jobs go through a queue. Run **one uvicorn worker only**: each process would load its own copy of the model.
- **Planning is separate from generation.** Gemini calls (network-bound) run in a small thread pool, so a slow reply never blocks the GPU.
- **Generation takes roughly 25 s per new sound on a T4** (30 steps). A repeated prompt is served from the on-disk cache in `/data/cache`, which makes it instant. Plan for the 25 s: use the async job flow, and consider a pre-generated library for common environments.
- **`max_inference_seconds` is set to the clip length.** Without it the pipeline denoises its full default latent, then runs out of memory in the decode step. That was the real cause of the crashes in the notebook, and it also made generation about 3x slower.
- **Audio is written with `soundfile`**, not the pipeline's `save_audio`, which depends on torchcodec/ffmpeg and failed on Colab.
- **Planner prompt style.** Sound prompts work best as one main sound, a texture and a distance ("steady rain falling on a corrugated metal roof, close, bright continuous patter"). Crowds, layered scenes and one-off events (thunder, door slams) sound worse. The planner prompt in `app/planner.py` enforces this and is the main quality lever.
- **Dockerfile details.** The last pip step installs `protobuf>=5.29,<7`: MOSS's dependency tree pins an old protobuf that breaks `diffusers`. pip prints a conflict warning about `descript-audiotools`; it is harmless. The `USE_TF=0 USE_JAX=0` variables stop `transformers` from importing TensorFlow/JAX if they are ever present.

## Known limits (not done yet)

- Jobs and their state live **in memory**. A restart loses queued jobs, and you cannot run several replicas behind one queue. For that, move jobs to Redis or a database.
- The cache grows without limit. Add cleanup, or a size cap.
- Output is wav only. Convert to mp3 on the client or add an ffmpeg step if you need it.
- No metrics or tracing. Add them if the service goes to production.

## Licences and terms

- MOSS-SoundEffect v2.0 is Apache 2.0. Keep its licence notice with your product.
- Check the Gemini API terms for your use.
- If you ship a voice step, `edge-tts` (used in the notebook) is an unofficial route to Microsoft's online voices with no service guarantee. Use an official TTS API for production. It is not used by this service.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `/health` stays `loading` for a long time | First start downloads about 11 GB. Check `docker logs`. If it stalls, restart the container, since the download resumes. |
| `/health` says `error` | Read `model_error`. "No CUDA GPU" means run with `--gpus all`. |
| Jobs fail with "GPU ran out of memory" | Another process uses the GPU, or the card has under 16 GB. Do not raise `CLIP_SECONDS` on a 16 GB card. |
| Jobs fail with a Gemini error | Wrong or missing `GEMINI_API_KEY`, or `GEMINI_MODEL` not available. You can bypass Gemini with `ambience_prompt`. |
| `ImportError ... runtime_version ... protobuf` | The final protobuf step in the Dockerfile did not run. |
| `Could not load libtorchcodec` | Only the pipeline's own `save_audio` uses it. This service does not call it. |
| bf16 problems on a T4 | It worked on a T4 in the notebook (with warnings). If it fails on your card, try `torch.float16` in `app/generator.py` and listen for noise. |

## Layout

```
app/config.py      settings (environment variables)
app/planner.py     environment + emotion -> sound prompt (Gemini), reply parsing
app/generator.py   MossGenerator (GPU) and FakeGenerator (dev)
app/audio.py       looping, fades, wav writing
app/service.py     job queue, cache, GPU worker
app/main.py        FastAPI routes
scripts/smoke_test.py   end-to-end check against a running server
tests/             pytest suite (runs on a CPU)
```
