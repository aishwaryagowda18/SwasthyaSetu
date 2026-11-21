"""Automated checks for scheme records (no network, no AI).

These checks support human review; they never mark a scheme as officially verified.
The runner (verify_schemes.py) fetches sources and passes their text in.
"""

import difflib
import re
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import urlparse

from pydantic import ValidationError

from app.models import SchemeRules

MAX_SOURCE_AGE_DAYS = 180

AUTO_SUPPORTED = "Automatically supported"
NEEDS_ATTENTION = "Needs attention"
CONFLICTING = "Conflicting information"
MISSING_SOURCE = "Missing official source"
_PRIORITY = [MISSING_SOURCE, CONFLICTING, NEEDS_ATTENTION]


@dataclass
class Issue:
    category: str  # MISSING_SOURCE, CONFLICTING or NEEDS_ATTENTION
    message: str
    exception: bool = True  # True: needs the reviewer's decision; False: information only


@dataclass
class SourceDoc:
    """What the runner learned about one source URL."""

    pages: list[str] | None = None  # PDF text per page; None for webpages
    text: str = ""  # whole text (webpage, or all PDF pages joined)
    content_hash: str | None = None
    error: str | None = None  # set when the source could not be fetched or read


@dataclass
class Result:
    issues: list[Issue] = field(default_factory=list)

    @property
    def category(self) -> str:
        for cat in _PRIORITY:
            if any(i.category == cat and i.exception for i in self.issues):
                return cat
        return AUTO_SUPPORTED


# ----- text helpers -----

def normalize(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip().lower()


def quote_found(quote: str, text: str) -> bool:
    """True if every part of the quote (split on '...') appears in the text."""
    haystack = normalize(text)
    parts = [normalize(p) for p in quote.split("...") if p.strip()]
    return bool(parts) and all(p in haystack for p in parts)


_NUMBER = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(lakh|lac|crore)?", re.IGNORECASE)


def numbers_in(text: str) -> set[int]:
    """Whole numbers in text; '2,50,000', '250000' and '2.5 lakh' all give 250000."""
    found = set()
    for digits, unit in _NUMBER.findall(text):
        try:
            value = float(digits.replace(",", ""))
        except ValueError:
            continue
        if unit:
            value *= 100_000 if unit.lower() in ("lakh", "lac") else 10_000_000
        if value == int(value):
            found.add(int(value))
    return found


def base_name(name: str) -> str:
    name = name.split("(")[0]
    return re.sub(r"[^a-z0-9 ]", "", name.lower().replace("-", "")).strip()


# ----- checks for structured records (data/schemes/*.json) -----

def _items(record: dict) -> list[tuple[str, dict]]:
    out = [("rule", r) for g in record.get("rules", {}).get("groups", []) for r in g.get("rules", [])]
    for key in ("benefits", "historical_benefits", "required_documents", "how_to_apply", "evidence"):
        out += [(key, item) for item in record.get(key, [])]
    return out


def check_record(record: dict, approved: dict[str, str], docs: dict[str, SourceDoc], today: date) -> Result:
    """approved: domain -> status ('approved'/'proposed'). docs: source_id -> SourceDoc."""
    res = Result()
    add = res.issues.append
    sources = {s["id"]: s for s in record.get("sources", [])}
    evidence = record.get("evidence", [])

    # Missing source or evidence
    if not sources:
        add(Issue(MISSING_SOURCE, "no official sources listed"))
    if not evidence:
        add(Issue(MISSING_SOURCE, "no supporting quotes from official sources"))

    # Rules are well formed
    try:
        rules = SchemeRules(**record["rules"])
    except (KeyError, ValidationError) as exc:
        add(Issue(NEEDS_ATTENTION, f"rules invalid or missing: {str(exc).splitlines()[0]}"))
        rules = None

    # Missing fields
    for key in ("benefits", "required_documents", "how_to_apply"):
        if not record.get(key):
            add(Issue(NEEDS_ATTENTION, f"missing {key.replace('_', ' ')}"))
    for kind, item in _items(record):
        if item.get("source_id") not in sources:
            add(Issue(MISSING_SOURCE, f"{kind} cites an unknown source: {item.get('source_id')}"))
        if not (item.get("page") or item.get("section")):
            add(Issue(NEEDS_ATTENTION, f"{kind} has no page or section reference"))

    # Sources: domain, freshness, fetch result, content changes
    for sid, src in sources.items():
        domain = urlparse(src.get("url", "")).hostname or ""
        status = approved.get(domain)
        if status is None:
            add(Issue(MISSING_SOURCE, f"{sid}: domain {domain or '(none)'} is not on the approved source list"))
        elif status != "approved":
            add(Issue(NEEDS_ATTENTION, f"{sid}: domain {domain} is {status}, awaiting admin approval"))
        try:
            age = (today - date.fromisoformat(src["checked_at"])).days
            if age > MAX_SOURCE_AGE_DAYS:
                add(Issue(NEEDS_ATTENTION, f"{sid}: last checked {age} days ago (limit {MAX_SOURCE_AGE_DAYS})"))
        except (KeyError, TypeError, ValueError):
            add(Issue(NEEDS_ATTENTION, f"{sid}: no valid checked_at date"))

        doc = docs.get(sid)
        reviewer_only = src.get("retrieved_by_system") is False
        if doc is None or doc.error:
            reason = doc.error if doc else "not fetched"
            if reviewer_only and record.get("verification", {}).get("status") == "reviewed":
                add(Issue(NEEDS_ATTENTION, f"{sid}: could not be fetched ({reason}); confirmed by reviewer", exception=False))
            else:
                add(Issue(NEEDS_ATTENTION, f"{sid}: could not be fetched ({reason})"))
        elif src.get("content_hash") and doc.content_hash and doc.content_hash != src["content_hash"]:
            add(Issue(NEEDS_ATTENTION, f"{sid}: document content has changed since it was checked - re-review"))

    # Quotes appear on the cited page
    for ev in evidence:
        doc = docs.get(ev.get("source_id"))
        if not doc or doc.error:
            continue  # already reported above
        page = ev.get("page")
        if doc.pages is not None and page:
            if not 1 <= page <= len(doc.pages):
                add(Issue(NEEDS_ATTENTION, f"quote '{ev.get('claim')}': page {page} does not exist"))
                continue
            text = doc.pages[page - 1]
        else:
            text = doc.text
        if not text.strip():
            add(Issue(NEEDS_ATTENTION, f"quote '{ev.get('claim')}': source text unreadable (scanned PDF?)"))
        elif not quote_found(ev.get("quote", ""), text):
            add(Issue(NEEDS_ATTENTION, f"quote '{ev.get('claim')}' not found on cited page {page or ''}".strip()))

    # Numbers in rules and current benefits must appear in a quote from the same source
    quoted = {}
    for ev in evidence:
        quoted.setdefault(ev.get("source_id"), set()).update(numbers_in(ev.get("quote", "")))
    if rules:
        for group in rules.groups:
            for r in group.rules:
                if isinstance(r.value, int) and r.value not in quoted.get(r.source_id, set()):
                    add(Issue(NEEDS_ATTENTION, f"rule '{r.message}': value {r.value} not found in quotes from {r.source_id}"))
    for b in record.get("benefits", []):
        ids = [b.get("source_id")] + b.get("supporting_source_ids", [])
        pool = set().union(*(quoted.get(i, set()) for i in ids))
        for n in numbers_in(b.get("text", "")):
            if n >= 10 and n not in pool:
                add(Issue(NEEDS_ATTENTION, f"benefit amount {n} not found in quotes from its sources"))

    # Conflicting rules inside 'all' groups
    if rules:
        for group in (g for g in rules.groups if g.mode == "all"):
            for f in {r.field for r in group.rules if r.field}:
                lows = [r.value for r in group.rules if r.field == f and r.operator == "gte"]
                highs = [r.value for r in group.rules if r.field == f and r.operator == "lte"]
                if len(lows) > 1 or len(highs) > 1:
                    add(Issue(CONFLICTING, f"group '{group.key}': more than one limit for {f}"))
                if lows and highs and max(lows) > min(highs):
                    add(Issue(CONFLICTING, f"group '{group.key}': {f} must be >= {max(lows)} and <= {min(highs)}"))

    # Flags written by preparers or reviewers
    for flag in record.get("flags", []):
        kind = flag.get("type", "")
        if kind.startswith("conflict") and kind != "conflict_resolved_by_newer_source":
            add(Issue(CONFLICTING, f"unresolved conflict: {flag.get('detail', '')}"))
        elif kind in ("unconfirmed", "possibly_outdated", "conflict_resolved_by_newer_source"):
            add(Issue(NEEDS_ATTENTION, f"{kind}: {flag.get('detail', '')}",
                      exception=kind != "possibly_outdated"))
    return res


# ----- checks for legacy draft rows (data/drafts/*.csv) -----

def check_legacy_row(row: dict, approved: dict[str, str], url_error: str | None) -> Result:
    res = Result()
    res.issues.append(Issue(MISSING_SOURCE, "legacy draft row: no supporting quotes or page references"))
    domain = urlparse(row.get("official_website", "")).hostname or ""
    if not domain:
        res.issues.append(Issue(MISSING_SOURCE, "no official website"))
    elif domain not in approved:
        res.issues.append(Issue(NEEDS_ATTENTION, f"website domain {domain} not on approved source list", exception=False))
    if url_error:
        res.issues.append(Issue(NEEDS_ATTENTION, f"official website could not be fetched ({url_error})", exception=False))
    if row.get("health_relevance") != "likely_health_care":
        res.issues.append(Issue(NEEDS_ATTENTION, f"health relevance: {row.get('health_relevance')}", exception=False))
    for col in ("eligibility_criteria", "benefits", "documents_required", "application_process"):
        if not row.get(col, "").strip():
            res.issues.append(Issue(NEEDS_ATTENTION, f"missing {col.replace('_', ' ')}", exception=False))
    return res


# ----- duplicates across all records -----

def find_duplicates(entries: list[tuple[str, str, str]]) -> dict[str, list[str]]:
    """entries: (key, name, primary_url). Returns key -> other keys that look like the same scheme."""
    dupes = {k: [] for k, _, _ in entries}
    for i, (k1, n1, u1) in enumerate(entries):
        for k2, n2, u2 in entries[i + 1:]:
            same_name = difflib.SequenceMatcher(None, base_name(n1), base_name(n2)).ratio() >= 0.85
            same_url = bool(u1) and u1 == u2
            if same_name or same_url:
                dupes[k1].append(k2)
                dupes[k2].append(k1)
    return dupes
