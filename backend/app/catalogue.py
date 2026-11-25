"""UNVERIFIED scheme catalogue (data/catalogue/unverified_schemes.json).

These records were collected from myScheme.gov.in around January 2025 and have NOT been checked
against official sources. They are shown only with an "Unverified" warning, are never used for
eligibility decisions, and are never mixed into the reviewed scheme list.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from app.schemes import data_dir

WARNING = (
    "Unverified information: collected from myScheme.gov.in around January 2025 and not checked "
    "against official sources. It may be outdated or contain errors. Always confirm on the official website."
)
_WORD = re.compile(r"[a-z0-9]+")
# Common words that carry no meaning for search.
STOP_WORDS = set("""a an the is are was were be of for to in on at by with and or not what which who whom how when where why
can could i my me we our you your do does did have has get give any some there their this that these those please tell
about help need want know find show scheme schemes yojana government govt number removed email
support assistance benefit benefits financial aid provide provided person people""".split())
# A few everyday words mapped to the words official schemes use.
SYNONYMS = {"tb": ["tuberculosis"], "pregnant": ["pregnancy", "maternity"], "pregnancy": ["maternity"],
            "disabled": ["disability", "pwd"], "disability": ["disabled", "pwd"], "farmer": ["farmers", "agriculture"],
            "student": ["students", "scholarship"], "hospital": ["hospitalisation", "treatment"], "old": ["senior", "elderly"],
            "widow": ["widows"], "kidney": ["dialysis"], "medicine": ["medical", "treatment"]}
# Field weights for keyword search.
_WEIGHTS = {"name": 6, "tags": 4, "category": 2, "ministry": 2, "state": 2, "brief_description": 2,
            "eligibility_text": 1, "benefits_text": 1, "target_beneficiaries": 1}


@lru_cache(maxsize=2)
def _load(path: str) -> tuple[list[dict], list[dict]]:
    file = Path(path)
    if not file.exists():
        return [], []
    entries = json.loads(file.read_text(encoding="utf-8"))["schemes"]
    index = []
    for e in entries:
        fields = {k: (" ".join(e[k]) if isinstance(e[k], list) else e.get(k) or "").lower() for k in _WEIGHTS}
        index.append({k: set(_WORD.findall(v)) for k, v in fields.items()})
    return entries, index


@lru_cache(maxsize=2)
def _idf(path: str) -> dict[str, float]:
    """Rare words count more than common ones (inverse document frequency)."""
    import math
    _, index = _load(path)
    df: dict[str, int] = {}
    for idx in index:
        for w in set().union(*idx.values()):
            df[w] = df.get(w, 0) + 1
    n = max(len(index), 1)
    return {w: math.log(1 + n / c) for w, c in df.items()}


def query_words(text: str) -> set[str]:
    words = {w for w in _WORD.findall(text.lower()) if w not in STOP_WORDS and len(w) > 1}
    for w in list(words):
        words.update(SYNONYMS.get(w, []))
    return words


def word_weights() -> dict[str, float]:
    """How specific each word is across all schemes (higher = rarer)."""
    return _idf(str(data_dir() / "catalogue" / "unverified_schemes.json"))


def entries() -> tuple[list[dict], list[dict]]:
    return _load(str(data_dir() / "catalogue" / "unverified_schemes.json"))


def summary(e: dict) -> dict:
    return {
        "id": e["id"], "name": e["name"], "level": e["level"], "state": e["state"] or None,
        "category": e["category"], "brief_description": e["brief_description"][:300],
        "reviewed_scheme_id": e.get("reviewed_scheme_id"), "verified": False,
    }


def search(query: str = "", level: str | None = None, state: str | None = None,
           category: str | None = None, limit: int | None = None) -> list[tuple[float, dict]]:
    """Keyword search with simple field weights. Returns (score, entry), best first."""
    items, index = entries()
    idf = _idf(str(data_dir() / "catalogue" / "unverified_schemes.json"))
    words = query_words(query)
    results = []
    for e, idx in zip(items, index):
        if level and e["level"] != level:
            continue
        if state and e["state"] != state:
            continue
        if category and category.lower() not in e["category"].lower():
            continue
        if words:
            score = sum(weight * sum(idf.get(w, 0) for w in words & idx[f]) for f, weight in _WEIGHTS.items())
            if score == 0:
                continue
        else:
            score = 0
        results.append((score, e))
    results.sort(key=lambda r: (-r[0], r[1]["name"].lower()))
    return results[:limit] if limit else results


def get(entry_id: str) -> dict | None:
    return next((e for e in entries()[0] if e["id"] == entry_id), None)


def facets() -> dict:
    items = entries()[0]
    cats = sorted({c.strip() for e in items for c in e["category"].split(",") if c.strip()})
    return {"states": sorted({e["state"] for e in items if e["state"]}), "categories": cats,
            "count": len(items), "central": sum(e["level"] == "central" for e in items)}
