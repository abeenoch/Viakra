from __future__ import annotations

import json
from pathlib import Path
from typing import Any

TOKEN_PATH = Path(".data/google-oauth-token.json")


def load_google_tokens() -> dict[str, Any] | None:
    if not TOKEN_PATH.exists():
        return None
    return json.loads(TOKEN_PATH.read_text(encoding="utf-8"))


def save_google_tokens(tokens: dict[str, Any]) -> None:
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(json.dumps(tokens, indent=2), encoding="utf-8")
