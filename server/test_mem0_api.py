#!/usr/bin/env python3
"""Interactive smoke test for the mem0 self-hosted server API.

Usage: python server/test_mem0_api.py

Set MEM0_BASE_URL if the server isn't at http://localhost:8888
"""

import json
import os
import sys

import requests

BASE = os.environ.get("MEM0_BASE_URL", "http://localhost:8888")

PASS = 0
FAIL = 0


def check(label: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  [PASS] {label}")
    else:
        FAIL += 1
        print(f"  [FAIL] {label}  {detail}")


def main():
    global PASS, FAIL
    print(f"mem0 API smoke test — {BASE}\n")

    # ── Health check ──────────────────────────────────────────────
    print("── Health ──")
    try:
        r = requests.get(f"{BASE}/docs", timeout=5)
        check("server reachable", r.status_code == 200, f"status {r.status_code}")
    except Exception as e:
        check("server reachable", False, str(e))
        print("\n  Is the server running?  cd server && docker compose up -d")
        sys.exit(1)

    # ── Auth ──────────────────────────────────────────────────────
    print("\n── Auth ──")
    r = requests.get(f"{BASE}/auth/setup-status")
    check("auth setup-status OK", r.status_code == 200, f"status {r.status_code}")
    setup = r.json()
    print(f"      auth_disabled={setup.get('auth_disabled')}  "
          f"has_users={setup.get('has_users')}")

    # ── Add memories ────────────────────────────────────────────────
    print("\n── Add memories ──")

    user_id = "test-user-001"

    conversations = [
        {"role": "user", "content": "My name is Alice and I work at Acme Corp as a software engineer."},
        {"role": "assistant", "content": "Nice to meet you Alice! How can I help you today?"},
        {"role": "user", "content": "I love coffee and take the subway to work every day."},
        {"role": "assistant", "content": "Thanks for sharing that. Is there anything specific you'd like to work on?"},
        {"role": "user", "content": "My team is building a real-time data pipeline using Kafka and Python."},
    ]

    r = requests.post(
        f"{BASE}/memories",
        json={"messages": conversations, "user_id": user_id},
    )
    check("POST /memories returns 200", r.status_code == 200, f"status {r.status_code}")
    add_result = r.json()
    if r.status_code == 200:
        mems = add_result if isinstance(add_result, list) else [add_result]
        print(f"      stored {len(mems)} memories")
        for m in mems:
            text = m.get("memory", m.get("text", str(m)))[:100]
            print(f"      → {text}")
    else:
        print(f"      response: {json.dumps(add_result, indent=2)[:300]}")

    # ── List memories ─────────────────────────────────────────────────
    print("\n── List memories ──")

    r = requests.get(f"{BASE}/memories", params={"user_id": user_id})
    check("GET /memories returns 200", r.status_code == 200, f"status {r.status_code}")
    if r.status_code == 200:
        mem_list = r.json()
        print(f"      {len(mem_list)} memories for {user_id}")

    # ── Search ────────────────────────────────────────────────────────
    print("\n── Search ──")

    search_queries = [
        ("Alice's name", "What is my name?"),
        ("Alice's job", "Where does Alice work?"),
        ("Alice's commute", "How does Alice get to work?"),
        ("Alice's project", "What technology stack is Alice using?"),
        ("irrelevant topic", "What is the capital of France?"),
    ]

    for label, query in search_queries:
        r = requests.post(
            f"{BASE}/search",
            json={"query": query, "user_id": user_id, "top_k": 3},
        )
        ok = r.status_code == 200
        detail = ""
        if ok:
            results = r.json()
            if results:
                top_score = results[0].get("score", 0)
                top_mem = results[0].get("memory", results[0].get("text", ""))[:120]
                detail = f"score={top_score:.4f} → {top_mem}"
            else:
                detail = "no results"
        check(f"search '{label}'", ok, detail or f"status {r.status_code}")

    # ── Get single memory ─────────────────────────────────────────────
    print("\n── Get single memory ──")

    r = requests.get(f"{BASE}/memories", params={"user_id": user_id})
    if r.status_code == 200 and r.json():
        mem_id = r.json()[0]["id"]
        r2 = requests.get(f"{BASE}/memories/{mem_id}")
        check("GET /memories/{id} returns 200", r2.status_code == 200)
        if r2.status_code == 200:
            check("memory content matches", "memory" in r2.json())
    else:
        check("GET /memories/{id}", False, "no memories to fetch")

    # ── Cleanup ───────────────────────────────────────────────────────
    print("\n── Cleanup ──")
    r = requests.delete(f"{BASE}/memories", params={"user_id": user_id})
    check("DELETE /memories returns 200", r.status_code == 200, f"status {r.status_code}")

    # Verify gone
    r = requests.get(f"{BASE}/memories", params={"user_id": user_id})
    check("memories actually deleted", r.status_code == 200 and len(r.json()) == 0,
          f"remaining: {len(r.json()) if r.status_code == 200 else '?'}")

    # ── Summary ───────────────────────────────────────────────────────
    total = PASS + FAIL
    print(f"\n{'=' * 50}")
    print(f"Results: {PASS}/{total} passed", end="")
    if FAIL:
        print(f", {FAIL} failed")
        sys.exit(1)
    else:
        print(" — all good!")


if __name__ == "__main__":
    main()
