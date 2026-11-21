# Draft health scheme list (UNVERIFIED)

> ⚠️ **Not verified. Possibly outdated. Must not be shown to users.**
> This file is only a to-do list of schemes to check against official sources in Phase 4.

## File

`health_schemes_unverified.csv` — 27 central and Karnataka schemes that may be health-related.

## Where it came from

| | |
|---|---|
| Source file | `documents/schemeswslug.csv` in the old repository `github.com/indu-shekhar/SchemeSaathi` |
| Source commit | `fc74d8463b5e158e075f41a2e6d61782c3d576ed` |
| Read method | `git show` (read-only; the old repository was not modified) |
| Likely original source | myScheme.gov.in, collected around January 2025 (not confirmed) |
| Reuse terms | Not yet confirmed — check before publishing any of this text |
| Created by | `tools/extract_health_drafts.py` |

## How rows were selected

- **Scope:** `level` is `Central`, or `state` is `Karnataka`.
- **`match_type = confirmed`:** category contains "Health & Wellness".
- **`match_type = possible`:** health keyword in the scheme name or tags only. Many of these are not health schemes.
- Rows containing 12-digit (Aadhaar-like) numbers would be dropped. None were found.

## Cleaning applied

- HTML codes decoded back to normal characters (for example `&amp;` → `&`), repeated
  because some text was encoded two or three times.
- Ministry kept as its name only (source stored it as `{'value': 489, 'label': '...'}`).
- Extra spaces trimmed. **No wording was changed.**
- Corrupted characters were **left unchanged** and the affected rows are flagged.

## Health relevance (suggestion only)

`health_relevance` is an automatic suggestion based on the scheme name and brief
description. A human reviewer must confirm or reject every row.

| Value | Meaning |
|---|---|
| `likely_health_care` | Mentions treatment, hospital, maternity, disease, etc. |
| `uncertain` | Mentions health, but the scheme is a fellowship, internship, scholarship, training or loan |
| `likely_not_health_care` | No health-care terms found (e.g. sanitation, urban development, soil health) |

**Reviewer decisions** (replace the automatic suggestion; recorded in `review_notes`):

| Source row | Scheme | Set to | Reason |
|---|---|---|---|
| 557 | Pandit Deendayal Upadhyay National Welfare Fund for Sportspersons | `uncertain` | Medical treatment is only one of several purposes |
| 583 | Pravasi Bharatiya Bima Yojana | `uncertain` | Insurance for emigrant workers; may include medical cover |
| 686 | PM Garib Kalyan Package: Insurance for Health Workers | `uncertain` | Life/accident insurance for health workers, not care for patients |

## Known problems

1. **Corrupted characters:** many fields contain the sequence `ï¿½`, where the original
   character (usually an apostrophe or dash) was destroyed before this data reached us.
   It cannot be recovered from this file.
2. **Cut-off text:** some scheme names are truncated in the source
   (for example "Swachh Bharat Mission ... Urb").
3. **Broad categories:** some "confirmed" rows (for example urban development or
   sanitation missions) are tagged "Health & Wellness" but are not health-care schemes.
4. **Missing schemes:** important central and Karnataka health schemes are absent and
   must be added from official sources.
5. **No citations or dates:** no source document, page number or "last checked" date.
6. **Duplicate entry:** HD-0007 (source row 1681) and HD-0008 (source row 717) are the same
   scheme, Nikshay Poshan Yojana. Both are kept. Row 1681's detailed description also
   describes a different incentive (for private-sector providers who notify TB cases),
   so it conflicts with its own eligibility and benefits text.

## Tracking columns

| Column | Meaning |
|---|---|
| `draft_id` | Our ID (`HD-0001` …) |
| `source_row_id` | `id` of the row in the source file |
| `match_type` | `confirmed` or `possible` (see above) |
| `health_relevance` | Suggestion: `likely_health_care`, `uncertain` or `likely_not_health_care` |
| `verification_status` | Always `unverified` here |
| `review_notes` | Issues to check: corrupted characters, possible non-health scheme, phone numbers, non-government emails or websites, keyword-only match |
