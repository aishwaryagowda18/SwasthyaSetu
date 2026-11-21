"""One-time tool: extract central + Karnataka health schemes as UNVERIFIED drafts.

Reads ONLY the public scheme CSV from the old repository, using `git show`
(reads git's stored copy, so the old repository's files are never opened or changed).

Usage:
    python -I tools/extract_health_drafts.py <old_repo_path> <output_csv>

Privacy:
    - Rows containing 12-digit (Aadhaar-like) numbers are dropped; only counts are printed.
    - Phone numbers and non-government emails are flagged for review; values are never printed.
"""

import ast
import csv
import html
import io
import re
import subprocess
import sys
from collections import Counter
from urllib.parse import urlparse

SOURCE_PATH_IN_REPO = "documents/schemeswslug.csv"

# Source column -> output column (drops the meaningless "Unnamed: 0" index column)
COLUMN_MAP = {
    "id": "source_row_id",
    "scheme_name": "scheme_name",
    "level": "level",
    "state": "state",
    "nodal_ministry": "nodal_ministry",
    "implementing_agency": "implementing_agency",
    "target_beneficiaries": "target_beneficiaries",
    "category": "category",
    "tags": "tags",
    "brief_description": "brief_description",
    "detailed_description": "detailed_description",
    "eligibility_criteria": "eligibility_criteria",
    "documents_required": "documents_required",
    "application_process": "application_process",
    "benefits": "benefits",
    "Official Website": "official_website",
    "Application Form": "application_form",
    "Order/Notice": "order_notice",
    "slug": "slug",
}
TRACKING_COLUMNS = ["draft_id", "match_type", "health_relevance", "verification_status", "review_notes"]

# Sequence left behind where the original character (e.g. rupee sign, apostrophe, dash)
# was destroyed before the data reached us. It cannot be recovered, so it is left as-is.
CORRUPTED = "ï¿½"

# Suggests whether a scheme is about health CARE (treatment, maternity, disease support...).
# Checked against the scheme name and brief description. A human reviewer must confirm.
HEALTH_CARE_TERMS = re.compile(
    r"treatment|hospital|medical|patient|disease|cancer|tuberculosis|\bTB\b|maternity|"
    r"pregnan|delivery|health insurance|arogya|dialysis|surgery|illness|ailment",
    re.IGNORECASE,
)
# Schemes for students/professionals/businesses that merely mention health words.
NON_PATIENT_TERMS = re.compile(r"fellowship|internship|scholarship|training|loan", re.IGNORECASE)

# Human review decisions that replace the automatic suggestion (key = source_row_id).
RELEVANCE_OVERRIDES = {
    "557": ("uncertain", "medical treatment is only one of several purposes of this fund"),  # Sportspersons Welfare Fund
    "583": ("uncertain", "insurance for emigrant workers; may include medical cover"),  # Pravasi Bharatiya Bima Yojana
    "686": ("uncertain", "life/accident insurance for health workers, not health care for patients"),  # PMGKP
}

# Human review notes added to specific rows (key = source_row_id). Both rows are kept.
EXTRA_NOTES = {
    "1681": "likely duplicate of source row 717 (same scheme: Nikshay Poshan Yojana, same official "
            "website); detailed description also describes a different incentive for private-sector "
            "providers - conflicting",
    "717": "likely duplicate of source row 1681 (same scheme: Nikshay Poshan Yojana, same official website)",
}

HEALTH_KEYWORDS = re.compile(
    r"health|hospital|medical|medicine|treatment|maternity|maternal|pregnan|disease|"
    r"nutrition|surgery|cancer|dialysis|tuberculosis|immuni[sz]|sanitary|ayush|arogya|illness",
    re.IGNORECASE,
)

AADHAAR_LIKE = re.compile(r"(?<!\d)(?:\d{12}|\d{4}[ -]\d{4}[ -]\d{4})(?!\d)")
PHONE = re.compile(
    r"(?<!\d)(?:(?:\+91[\s-]?)?[6-9]\d{9}|0\d{2,4}[\s-]\d{6,8}|1800[\s-]?\d{3}[\s-]?\d{3,4})(?!\d)"
)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
GOV_DOMAIN = re.compile(r"(^|\.)(gov\.in|nic\.in)$", re.IGNORECASE)


def read_source(repo_path: str) -> list[dict]:
    raw = subprocess.run(
        ["git", "-C", repo_path, "show", f"HEAD:{SOURCE_PATH_IN_REPO}"],
        check=True, capture_output=True,
    ).stdout
    csv.field_size_limit(10**9)
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8"), newline="")))


def clean(value: str) -> str:
    """Decode HTML entities (&amp; -> &) and trim spaces. Wording is never changed."""
    for _ in range(5):  # some source text was encoded 2-3 times (e.g. "&amp;quot;")
        decoded = html.unescape(value)
        if decoded == value:
            break
        value = decoded
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in value.splitlines()]
    return "\n".join(line for line in lines if line)


def ministry_name(value: str) -> str:
    """"{'value': 489, 'label': 'Ministry Of X'}" -> "Ministry Of X". Other text is kept."""
    value = value.strip()
    if value.startswith("{"):
        try:
            parsed = ast.literal_eval(value)  # safe: parses literals only, never runs code
            if isinstance(parsed, dict) and isinstance(parsed.get("label"), str):
                return parsed["label"]
        except (ValueError, SyntaxError):
            pass
    return value


def is_gov_url(url: str) -> bool:
    host = urlparse(url.strip()).hostname or ""
    return bool(GOV_DOMAIN.search(host))


def main() -> None:
    repo_path, output_csv = sys.argv[1], sys.argv[2]
    rows = read_source(repo_path)
    stats = Counter(total_read=len(rows))
    out = []

    for row in rows:
        level = row["level"].strip()
        state = row["state"].strip()
        if not (level == "Central" or "karnataka" in state.lower()):
            continue
        stats["in_scope_central_or_karnataka"] += 1

        if "health & wellness" in row["category"].lower():
            match_type = "confirmed"
        elif HEALTH_KEYWORDS.search(row["scheme_name"] + " " + row["tags"]):
            match_type = "possible"
        else:
            continue

        text = " ".join(row.values())
        if AADHAAR_LIKE.search(text):
            stats["dropped_aadhaar_like_number"] += 1
            continue

        notes = []
        if match_type == "possible":
            notes.append("health match by keyword only - confirm it is a health scheme")
        if PHONE.search(text):
            notes.append("contains phone number - review")
            stats["flag_phone"] += 1
        non_gov_emails = [d for d in EMAIL.findall(text) if not GOV_DOMAIN.search(d)]
        gov_emails = [d for d in EMAIL.findall(text) if GOV_DOMAIN.search(d)]
        if non_gov_emails:
            notes.append("contains non-government email - review")
            stats["flag_non_gov_email"] += 1
        if gov_emails:
            stats["has_gov_email_kept"] += 1
        website = row["Official Website"].strip()
        if not website:
            notes.append("no official website")
            stats["flag_no_website"] += 1
        elif not is_gov_url(website):
            notes.append("website is not a .gov.in/.nic.in domain - review")
            stats["flag_non_gov_website"] += 1
        else:
            stats["gov_website"] += 1

        record = {new: clean(row[old]) for old, new in COLUMN_MAP.items()}
        record["nodal_ministry"] = ministry_name(record["nodal_ministry"])

        summary = record["scheme_name"] + " " + record["brief_description"]
        if record["source_row_id"] in RELEVANCE_OVERRIDES:
            relevance, reason = RELEVANCE_OVERRIDES[record["source_row_id"]]
            notes.append(f"reviewer decision: {relevance} - {reason}")
        elif HEALTH_CARE_TERMS.search(summary) and NON_PATIENT_TERMS.search(record["scheme_name"]):
            relevance = "uncertain"
            notes.append("mentions health but looks aimed at students/professionals - confirm")
        elif HEALTH_CARE_TERMS.search(summary):
            relevance = "likely_health_care"
        else:
            relevance = "likely_not_health_care"
            notes.append("may not be a health-care scheme - confirm or reject")
        stats[f"relevance_{relevance}"] += 1

        if record["source_row_id"] in EXTRA_NOTES:
            notes.append(EXTRA_NOTES[record["source_row_id"]])
            stats["flag_likely_duplicate"] += 1

        corrupted_fields = [k for k, v in record.items() if CORRUPTED in v]
        if corrupted_fields:
            notes.append("corrupted characters (unrecoverable) in: " + ", ".join(corrupted_fields))
            stats["flag_corrupted_characters"] += 1

        record.update(match_type=match_type, health_relevance=relevance,
                      verification_status="unverified", review_notes="; ".join(notes))
        stats[f"{match_type}_{'central' if level == 'Central' else 'karnataka'}"] += 1
        out.append(record)

    out.sort(key=lambda r: (r["match_type"] != "confirmed", r["level"] != "Central", r["scheme_name"].lower()))
    for i, record in enumerate(out, start=1):
        record["draft_id"] = f"HD-{i:04d}"

    fieldnames = TRACKING_COLUMNS[:1] + ["source_row_id"] + TRACKING_COLUMNS[1:] + \
        [c for c in COLUMN_MAP.values() if c != "source_row_id"]
    with open(output_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(out)

    stats["written"] = len(out)
    for key in sorted(stats):
        print(f"{key}: {stats[key]}")


if __name__ == "__main__":
    main()
