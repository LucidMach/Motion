#!/usr/bin/env python3
"""
Post-deploy smoke test for the Motion backend on Render.

Hits the live /api/health and /api/status endpoints and checks the backend
actually came up healthy - not just that Render's deploy step succeeded.
Run this by hand after a deploy (or wire it into a manual CI job); it's not
part of the PR-gating test suite since it depends on the live external
service being reachable.

Usage:
    python scripts/render_smoke_test.py [base_url]

    base_url defaults to https://motionapi.onrender.com (the deployed
    Render URL), matching the frontend's own fallback in UI/src/services/api.ts.
"""
import sys
import urllib.request
import urllib.error
import json

DEFAULT_BASE_URL = "https://motionapi.onrender.com"
TIMEOUT_SECS = 45  # generous enough to cover a Render free-tier cold start


def fetch_json(url, timeout=TIMEOUT_SECS):
    req = urllib.request.Request(url, headers={"User-Agent": "Motion-Smoke-Test/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
        except Exception:
            body = None
        return e.code, body


def main():
    base_url = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else DEFAULT_BASE_URL
    print(f"Running smoke test against {base_url} ...")

    failures = []

    print("\n[1/2] GET /api/health")
    status, health = fetch_json(f"{base_url}/api/health")
    print(f"  status_code={status} body={health}")
    if status != 200:
        failures.append(f"/api/health returned {status}, expected 200")
    elif not isinstance(health, dict) or health.get("status") != "ok":
        failures.append(f"/api/health status field was {health.get('status') if isinstance(health, dict) else health!r}, expected 'ok'")
    elif not health.get("kdtree_in_memory"):
        failures.append("/api/health reports kdtree_in_memory=False")
    elif not health.get("db_loaded"):
        failures.append("/api/health reports db_loaded=False")

    print("\n[2/2] GET /api/status")
    status, sys_status = fetch_json(f"{base_url}/api/status")
    print(f"  status_code={status} body={sys_status}")
    if status != 200:
        failures.append(f"/api/status returned {status}, expected 200")
    elif not isinstance(sys_status, dict) or sys_status.get("status") != "ready":
        failures.append(f"/api/status status field was {sys_status.get('status') if isinstance(sys_status, dict) else sys_status!r}, expected 'ready'")
    elif not sys_status.get("stops_count"):
        failures.append("/api/status reports stops_count=0 - database looks empty")

    print()
    if failures:
        print("SMOKE TEST FAILED:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)

    print("SMOKE TEST PASSED - backend is healthy and ready.")
    sys.exit(0)


if __name__ == "__main__":
    main()
