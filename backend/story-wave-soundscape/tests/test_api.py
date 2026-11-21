import time
from dataclasses import replace

try:
    import soundfile as sf
except ImportError:
    sf = None
import scipy.io.wavfile as wavfile
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_client(tmp_path, **overrides):
    s = replace(Settings(), dev_fake=True, data_dir=str(tmp_path), **overrides)
    return TestClient(create_app(s))


def wait_done(client, job_id, headers=None, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        r = client.get(f"/v1/jobs/{job_id}", headers=headers)
        if r.json()["status"] in {"done", "failed"}:
            return r.json()
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_full_flow_and_cache(tmp_path):
    with make_client(tmp_path) as c:
        end = time.time() + 10
        while c.get("/health").status_code != 200 and time.time() < end:
            time.sleep(0.05)
        assert c.get("/health").json()["model_loaded"] is True

        body = {"environment": "busy fish market", "emotion": "cheerful", "intensity": 4, "duration_seconds": 10}
        r = c.post("/v1/background", json=body)
        assert r.status_code == 202
        job = wait_done(c, r.json()["job_id"])
        assert job["status"] == "done", job
        assert job["plan"]["ambience_prompt"]
        assert 0.05 <= job["plan"]["volume"] <= 0.35
        assert job["cache_hit"] is False

        audio = c.get(job["audio_url"])
        assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav"
        out = tmp_path / "check.wav"
        out.write_bytes(audio.content)
        if sf is not None:
            data, sr = sf.read(str(out))
        else:
            sr, data = wavfile.read(str(out))
        assert abs(len(data) / sr - 10.0) < 0.01

        # same request again: the clip comes from the cache
        r2 = c.post("/v1/background", json=body)
        job2 = wait_done(c, r2.json()["job_id"])
        assert job2["status"] == "done" and job2["cache_hit"] is True


def test_prompt_override_skips_planner(tmp_path):
    with make_client(tmp_path) as c:
        r = c.post("/v1/background", json={"environment": "x", "ambience_prompt": "steady wind in tall grass, distant"})
        job = wait_done(c, r.json()["job_id"])
        assert job["status"] == "done"
        assert job["plan"]["ambience_prompt"] == "steady wind in tall grass, distant"
        assert "plan" in job["timings_seconds"]


def test_validation(tmp_path):
    with make_client(tmp_path) as c:
        assert c.post("/v1/background", json={"environment": ""}).status_code == 422
        assert c.post("/v1/background", json={"environment": "x", "intensity": 11}).status_code == 422
        assert c.post("/v1/background", json={"environment": "x", "duration_seconds": 9999}).status_code == 422
        assert c.get("/v1/jobs/nope").status_code == 404


def test_api_key(tmp_path):
    with make_client(tmp_path, api_key="secret") as c:
        body = {"environment": "street"}
        assert c.post("/v1/background", json=body).status_code == 401
        assert c.post("/v1/background", json=body, headers={"X-API-Key": "wrong"}).status_code == 401
        r = c.post("/v1/background", json=body, headers={"X-API-Key": "secret"})
        assert r.status_code == 202
        assert c.get("/health").status_code in (200, 503)  # health needs no key


def test_queue_limit(tmp_path):
    with make_client(tmp_path, max_pending=0) as c:
        r = c.post("/v1/background", json={"environment": "street"})
        assert r.status_code == 429 and r.headers["retry-after"]
