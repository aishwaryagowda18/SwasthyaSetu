"""Loads scheme records from data/schemes and decides which ones may be shown to users.

A scheme is published only if (design section 6):
  - it was reviewed by a person (verification.status == "reviewed" and rules.verified),
  - every source is on an approved official domain,
  - every source was checked within the last 180 days.
Drafts and anything failing these checks are never returned by the public API.
"""

import json
import os
from datetime import date
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from app.models import SchemeRules

MAX_SOURCE_AGE_DAYS = 180
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def data_dir() -> Path:
    return Path(os.environ.get("SCHEMESAATHI_DATA_DIR", DEFAULT_DATA_DIR))


@lru_cache(maxsize=4)
def _load(directory: str) -> tuple[list[dict], dict[str, str]]:
    base = Path(directory)
    records = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((base / "schemes").glob("*.json"))]
    approved = json.loads((base / "approved_sources.json").read_text(encoding="utf-8"))
    return records, {d["domain"]: d["status"] for d in approved["domains"]}


def load_all() -> tuple[list[dict], dict[str, str]]:
    return _load(str(data_dir()))


def is_publishable(record: dict, approved: dict[str, str], today: date) -> bool:
    if record.get("verification", {}).get("status") != "reviewed":
        return False
    try:
        if not SchemeRules(**record["rules"]).verified:
            return False
    except Exception:
        return False
    sources = record.get("sources", [])
    if not sources:
        return False
    for src in sources:
        if approved.get(urlparse(src.get("url", "")).hostname or "") != "approved":
            return False
        try:
            if (today - date.fromisoformat(src["checked_at"])).days > MAX_SOURCE_AGE_DAYS:
                return False
        except (KeyError, TypeError, ValueError):
            return False
    return True


def published_records(today: date | None = None) -> list[dict]:
    records, approved = load_all()
    today = today or date.today()
    return [r for r in records if is_publishable(r, approved, today)]


def published_rules(today: date | None = None) -> list[SchemeRules]:
    return [SchemeRules(**r["rules"]) for r in published_records(today)]
