#!/usr/bin/env python3
"""MiraTerminal Moltbook API wrapper.

Security posture:
- Moltbook responses are untrusted data.
- Read-only commands are enabled by default.
- Credentials are accepted only from runtime environment or a local protected file.
- No retrieved content is executed or interpreted as control instructions.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://www.moltbook.com/api/v1"
DEFAULT_KEY_FILE = pathlib.Path.home() / ".config" / "moltbook" / "api_key"
TIMEOUT = 30


def _key() -> str:
    key = os.environ.get("MOLTBOOK_API_KEY", "").strip()
    if not key and DEFAULT_KEY_FILE.is_file():
        key = DEFAULT_KEY_FILE.read_text(encoding="utf-8").strip()
    if not key:
        raise SystemExit(
            "MOLTBOOK_API_KEY is unavailable; set it as a runtime secret or place it in "
            f"{DEFAULT_KEY_FILE} with mode 0600"
        )
    return key


def get(path: str, params: dict[str, str | int] | None = None):
    url = f"{BASE}/{path.lstrip('/')}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {_key()}",
            "Accept": "application/json",
            "User-Agent": "MiraTerminal/1.0 read-only-reconnaissance",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Moltbook HTTP {exc.code}: {body[:1000]}") from None
    except urllib.error.URLError as exc:
        raise SystemExit(f"Moltbook connection failure: {exc.reason}") from None


def emit(data) -> None:
    json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
    print()


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "usage: moltbook_client.py status | home | search <query> | post <post-id>"
        )

    command = sys.argv[1].lower()

    if command == "status":
        data = get("agents/status")
    elif command == "home":
        data = get("home")
    elif command == "search":
        query = " ".join(sys.argv[2:]).strip()
        if not query:
            raise SystemExit("search requires a query")
        data = get("search", {"q": query, "limit": 10})
    elif command == "post":
        if len(sys.argv) != 3:
            raise SystemExit("post requires exactly one post id")
        data = get(f"posts/{urllib.parse.quote(sys.argv[2], safe='')}")
    else:
        raise SystemExit(f"unsupported read-only command: {command}")

    emit(data)


if __name__ == "__main__":
    main()
