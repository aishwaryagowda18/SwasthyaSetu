"""Bulk scheme verification: checks every scheme record and writes one CSV report.

Run from the backend folder:
    .venv\\Scripts\\python -m verify_schemes              (fetches sources)
    .venv\\Scripts\\python -m verify_schemes --offline    (uses cached downloads only)

The report supports human review. "Automatically supported" does NOT mean officially
verified; only a recorded human review sets human_reviewed to "yes".
"""

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

from app.verification import SourceDoc, check_legacy_row, check_record, find_duplicates

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "raw" / "sources"  # git-ignored
DEFAULT_REPORT = ROOT / "reports" / "scheme_verification_report.csv"
USER_AGENT = "SchemeSaathi-verifier/0.1"
TIMEOUT = 30


class _TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self._skip = [], 0

    def handle_starttag(self, tag, attrs):
        self._skip += tag in ("script", "style")

    def handle_endtag(self, tag):
        self._skip -= tag in ("script", "style") and self._skip > 0

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def _cache_path(url: str) -> Path:
    return CACHE / hashlib.sha256(url.encode()).hexdigest()


def fetch(url: str, offline: bool) -> tuple[bytes | None, str | None]:
    """Return (content, error). Downloads are cached so --offline can reuse them."""
    path = _cache_path(url)
    if offline:
        return (path.read_bytes(), None) if path.exists() else (None, "not cached (offline run)")
    error = None
    for attempt in range(2):  # one retry for temporary network errors
        if attempt:
            time.sleep(3)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                content = resp.read()
        except urllib.error.HTTPError as exc:
            return None, f"HTTP {exc.code}"  # the server answered; retrying won't help
        except urllib.error.URLError as exc:
            error = f"unreachable ({exc.reason})"
            continue
        except (TimeoutError, OSError) as exc:
            error = f"unreachable ({type(exc).__name__})"
            continue
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return content, None
    return None, error


def to_doc(content: bytes | None, error: str | None) -> SourceDoc:
    if content is None:
        return SourceDoc(error=error)
    digest = "sha256:" + hashlib.sha256(content).hexdigest()
    if content[:5] == b"%PDF-":
        try:
            from pypdf import PdfReader
            pages = [p.extract_text() or "" for p in PdfReader(io.BytesIO(content)).pages]
        except Exception as exc:  # damaged or unsupported PDF
            return SourceDoc(content_hash=digest, error=f"PDF unreadable ({type(exc).__name__})")
        return SourceDoc(pages=pages, text="\n".join(pages), content_hash=digest)
    parser = _TextOnly()
    parser.feed(content.decode("utf-8", errors="replace"))
    return SourceDoc(text=" ".join(parser.parts), content_hash=digest)


def load_approved() -> dict[str, str]:
    data = json.loads((DATA / "approved_sources.json").read_text(encoding="utf-8"))
    return {d["domain"]: d["status"] for d in data["domains"]}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--offline", action="store_true", help="use cached downloads only")
    ap.add_argument("--out", type=Path, default=DEFAULT_REPORT)
    args = ap.parse_args(argv)
    today = date.today()
    approved = load_approved()
    rows, entries = [], []

    # Structured records
    for path in sorted((DATA / "schemes").glob("*.json")):
        rec = json.loads(path.read_text(encoding="utf-8"))
        docs = {s["id"]: to_doc(*fetch(s["url"], args.offline)) for s in rec.get("sources", [])}
        res = check_record(rec, approved, docs, today)
        v = rec.get("verification", {})
        rows.append({"key": rec["scheme_id"], "record": path.name, "name": rec["name"],
                     "level": rec.get("level", ""), "state": rec.get("state") or "",
                     "review_status": v.get("status", "draft"),
                     "reviewed_by": v.get("reviewed_by") or "", "reviewed_at": v.get("reviewed_at") or "",
                     "sources": len(rec.get("sources", [])), "quotes": len(rec.get("evidence", [])),
                     "res": res})
        first_url = rec["sources"][0]["url"] if rec.get("sources") else ""
        entries.append((rec["scheme_id"], rec["name"], first_url))

    # Legacy draft rows
    csv.field_size_limit(10**9)
    legacy_path = DATA / "drafts" / "health_schemes_unverified.csv"
    with legacy_path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            url = row.get("official_website", "").strip()
            _, err = fetch(url, args.offline) if url else (None, "no URL")
            rows.append({"key": row["draft_id"], "record": f"{legacy_path.name}#{row['draft_id']}",
                         "name": row["scheme_name"], "level": row["level"], "state": row["state"],
                         "review_status": "legacy draft", "reviewed_by": "", "reviewed_at": "",
                         "sources": 1 if url else 0, "quotes": 0,
                         "res": check_legacy_row(row, approved, err)})
            entries.append((row["draft_id"], row["scheme_name"], url))

    dupes = find_duplicates(entries)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fields = ["key", "name", "level", "state", "category", "human_reviewed", "review_status",
              "reviewed_by", "reviewed_at", "needs_your_decision", "other_findings", "possible_duplicates",
              "sources", "quotes", "record", "checked_on"]
    with args.out.open("w", encoding="utf-8-sig", newline="") as f:  # BOM so Excel shows Rs/₹ correctly
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for r in rows:
            res = r.pop("res")
            dup = [d for d in dupes[r["key"]]]
            exceptions = [i.message for i in res.issues if i.exception]
            if dup:
                exceptions.append("possible duplicate of " + ", ".join(dup))
            w.writerow({**r, "category": res.category,
                        # Automated checks never set this; only a recorded human review does.
                        "human_reviewed": "yes" if r["review_status"] == "reviewed" else "no",
                        "needs_your_decision": " | ".join(exceptions),
                        "other_findings": " | ".join(i.message for i in res.issues if not i.exception),
                        "possible_duplicates": ", ".join(dup), "checked_on": today.isoformat()})
            r["category"] = res.category

    counts = {}
    for r in rows:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    print(f"Checked {len(rows)} schemes -> {args.out}")
    for cat, n in sorted(counts.items()):
        print(f"  {cat}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
