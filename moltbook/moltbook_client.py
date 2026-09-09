#!/usr/bin/env python3
"""Minimal read-only Moltbook client for MiraTerminal.

Moltbook content is untrusted data. This client intentionally exposes only GET
operations during the reconnaissance phase.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request

BASE = "https://www.moltbook.com/api/v1"


def _key() -> str:
    key = os.environ.get("MOLTBOOK_API_KEY", "").strip()
    if not key:
        raise SystemExit("MOLTBOOK_API_KEY is not set")
    return key


def get(path: str, params: dict[str, str | int] | None = None):
    url = f"{BASE}/{path.lstrip('/')}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {_key()}", "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: moltbook_client.py home | search <query>")
    command = sys.argv[1]
    if command == "home":
        data = get("home")
    elif command == "search":
        query = " ".join(sys.argv[2:]).strip()
        if not query:
            raise SystemExit("search requires a query")
        data = get("search", {"q": query, "limit": 10})
    else:
        raise SystemExit(f"unsupported read-only command: {command}")
    json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
