"""End-to-end check against a running server. Standard library only.

  python scripts/smoke_test.py --url http://localhost:8000 --env "busy fish market" --emotion cheerful
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def call(method, url, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="http://localhost:8000")
    p.add_argument("--api-key", default="")
    p.add_argument("--env", default="busy open-air fish market in the morning")
    p.add_argument("--emotion", default="cheerful")
    p.add_argument("--duration", type=float, default=10.0)
    p.add_argument("--out", default="smoke_test.wav")
    a = p.parse_args()
    headers = {"X-API-Key": a.api_key} if a.api_key else {}

    print("waiting for the model to load (first start downloads about 11 GB)...")
    while True:
        try:
            status, body = call("GET", f"{a.url}/health", headers)
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read()
        info = json.loads(body)
        if info["model_loaded"]:
            break
        if info["status"] == "error":
            sys.exit(f"model failed to load: {info['model_error']}")
        time.sleep(5)

    _, body = call("POST", f"{a.url}/v1/background", headers,
                   {"environment": a.env, "emotion": a.emotion, "duration_seconds": a.duration})
    job = json.loads(body)
    print("job:", job["job_id"])
    t0 = time.time()
    while True:
        _, body = call("GET", f"{a.url}/v1/jobs/{job['job_id']}", headers)
        info = json.loads(body)
        if info["status"] in ("done", "failed"):
            break
        time.sleep(1)
    print(json.dumps(info, indent=2))
    if info["status"] != "done":
        sys.exit(1)
    _, wav = call("GET", a.url + info["audio_url"], headers)
    open(a.out, "wb").write(wav)
    print(f"saved {a.out} ({len(wav)/1e6:.1f} MB) in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
