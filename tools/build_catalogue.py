"""Build the UNVERIFIED scheme catalogue (central + Karnataka schemes) from the old repository's public scheme CSV.

Reads only documents/schemeswslug.csv via `git show` (the old repository is never modified).
The catalogue is shown to citizens only as "Unverified" and is never used for eligibility.

Usage:
    python -I tools/build_catalogue.py <old_repo_path> data/catalogue/unverified_schemes.json
"""

import ast
import csv
import html
import io
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

SOURCE = "documents/schemeswslug.csv"
CORRUPTED = "ï¿½"  # left behind where a character was destroyed before we got the data
REPLACEMENT = "�"  # shown as a visible "unknown character" mark; never guessed
AADHAAR_LIKE = re.compile(r"(?<!\d)(?:\d{12}|\d{4}[ -]\d{4}[ -]\d{4})(?!\d)")
FIELDS = {
    "scheme_name": "name", "level": "level", "state": "state", "category": "category", "tags": "tags",
    "nodal_ministry": "ministry", "implementing_agency": "implementing_agency",
    "target_beneficiaries": "target_beneficiaries", "brief_description": "brief_description",
    "detailed_description": "detailed_description", "eligibility_criteria": "eligibility_text",
    "documents_required": "documents_text", "benefits": "benefits_text",
    "application_process": "application_text", "Official Website": "official_website",
    "Application Form": "application_form", "slug": "slug",
}


def clean(value: str) -> str:
    for _ in range(20):  # some text was HTML-encoded many times
        decoded = html.unescape(value)
        if decoded == value:
            break
        value = decoded
    value = value.replace(CORRUPTED, REPLACEMENT)
    lines = [re.sub(r"[ \t ]+", " ", ln).strip() for ln in value.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def ministry(value: str) -> str:
    value = value.strip()
    if value.startswith("{"):
        try:
            parsed = ast.literal_eval(value)
            if isinstance(parsed, dict) and isinstance(parsed.get("label"), str):
                return parsed["label"]
        except (ValueError, SyntaxError):
            pass
    return value


def base_name(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", name.split("(")[0].lower().replace("-", "")).strip()


def main() -> None:
    repo, out = sys.argv[1], Path(sys.argv[2])
    raw = subprocess.run(["git", "-C", repo, "show", f"HEAD:{SOURCE}"], check=True, capture_output=True).stdout
    commit = subprocess.run(["git", "-C", repo, "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    csv.field_size_limit(10**9)
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"), newline="")))

    # Reviewed records, so catalogue entries can point to the verified version.
    reviewed = {}
    for p in (Path(__file__).resolve().parents[1] / "data" / "schemes").glob("*.json"):
        rec = json.loads(p.read_text(encoding="utf-8"))
        reviewed[base_name(rec["name"])] = rec["scheme_id"]

    stats, entries = Counter(read=len(rows)), []
    for row in rows:
        # Scope: central schemes and Karnataka state schemes only (all categories).
        if not (row["level"].strip() == "Central" or "karnataka" in row["state"].lower()):
            stats["skipped_other_states"] += 1
            continue
        # Ignore digits inside web addresses or file paths (they are not ID numbers).
        if AADHAAR_LIKE.search(re.sub(r"\S*/\S*", " ", " ".join(row.values()))):
            stats["dropped_aadhaar_like"] += 1
            continue
        e = {new: clean(row.get(old, "")) for old, new in FIELDS.items()}
        e["ministry"] = ministry(e["ministry"])
        e["level"] = "central" if e["level"] == "Central" else "state"
        e["id"] = f"u-{row['id']}"
        e["tags"] = [t.strip() for t in e["tags"].split(",") if t.strip()]
        e["corrupted_text"] = any(REPLACEMENT in v for v in e.values() if isinstance(v, str))
        e["reviewed_scheme_id"] = reviewed.get(base_name(e["name"]))
        stats["corrupted_text"] += e["corrupted_text"]
        stats[e["level"]] += 1
        entries.append(e)

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "_status": "UNVERIFIED. Collected from myScheme.gov.in around January 2025 (via an old project dataset). "
                   "Not checked against official sources; may be outdated or contain errors. Never used for eligibility.",
        "source": {"repository": "github.com/indu-shekhar/SchemeSaathi", "file": SOURCE, "commit": commit},
        "count": len(entries),
        "schemes": entries,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    stats["written"] = len(entries)
    stats["linked_to_reviewed"] = sum(1 for e in entries if e["reviewed_scheme_id"])
    for k in sorted(stats):
        print(f"{k}: {stats[k]}")
    print(f"size: {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
