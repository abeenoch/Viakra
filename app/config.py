from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    port: int
    base_url: str
    deepgram_api_key: str
    google_client_id: str
    google_client_secret: str
    google_credentials_file: str
    google_redirect_path: str

    @property
    def google_redirect_uri(self) -> str:
        return urljoin(self.base_url, self.google_redirect_path)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def get_settings() -> Settings:
    return Settings(
        port=int(_env("PORT", "3000")),
        base_url=_env("BASE_URL", "http://localhost:3000"),
        deepgram_api_key=_env("DEEPGRAM_API_KEY"),
        google_client_id=_env("GOOGLE_CLIENT_ID"),
        google_client_secret=_env("GOOGLE_CLIENT_SECRET"),
        google_credentials_file=_env("GOOGLE_CREDENTIALS_FILE", "credentials.json"),
        google_redirect_path=_env("GOOGLE_REDIRECT_PATH", "/auth/google/callback"),
    )


settings = get_settings()


def google_credentials_path() -> Path:
    return Path(settings.google_credentials_file)
