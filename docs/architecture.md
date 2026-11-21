# Architecture and Decisions

## Overview

```
   Citizen's browser                         Admin's browser
  +----------------------+                 +------------------+
  | Web frontend         |                 | Admin pages      |
  | (matches live site)  |                 | + rule editor    |
  +---+----------+-------+                 +------+-----------+
      | read     | eligibility, chat,             | login (Supabase Auth)
      | schemes  | voice, checklist               | + token sent to API
      v          v                                v
  +--------+  +----------------------------------------------+
  |Supabase|<-+  Python FastAPI backend                      |
  |Postgres|  |  - Eligibility engine (deterministic rules)  |
  |+ Auth  |  |  - Hybrid search (keyword + vector)          |
  |+pgvector  |  - Chatbot: retrieve official text -> AI     |
  +--------+  |    answers with page citations -> verifier   |
      ^       |  - Voice / Kannada                           |
      |       |  - Admin APIs (server-side role check)       |
      |       +----------------------------------------------+
      |       +----------------------------------------------+
      +-------+  Document pipeline (scheduled)               |
              |  official PDFs -> text (+OCR) -> page-tagged |
              |  chunks -> stored; changes -> admin alert    |
              +----------------------------------------------+
```

## Key decisions

| # | Decision | Reason |
|---|---|---|
| 1 | **Backend and data first, frontend later (Option C)** | Lovable source code is not available. Security, data and eligibility accuracy do not depend on the frontend. |
| 2 | Frontend: keep the existing Lovable site if its source becomes available; otherwise rebuild it to match the live site using the same tools (React, Tailwind, shadcn/ui). | No redesign. The live site is the design reference. |
| 3 | Backend: Python + FastAPI + Pydantic | Automatic input validation, async calls to AI/voice services, generated API docs. |
| 4 | Database and auth: our own Supabase project (Postgres + pgvector) | Free tier, one place for schemes, rules, sources and search data. |
| 5 | **Eligibility is decided only by deterministic, tested Python rules.** Each rule links to its source document and page. | Accuracy and auditability. The AI never decides eligibility. |
| 6 | AI model: Claude Haiku 5.5 to start (low cost, built-in page citations); upgrade only if accuracy tests require it. | Low cost, citation support, Kannada quality. |
| 7 | Voice and translation: Bhashini (free) first; evaluate paid options only if quality is insufficient. | Free / low-cost priority. |
| 8 | Official documents only. Users cannot upload personal documents. | Privacy and legal safety. |
| 9 | No ads or sponsored placements. | Neutral, trustworthy recommendations. |
| 10 | The old Flask repository is not run or modified. Only its public scheme dataset may be reused, as unverified drafts. | It stores personal data unsafely and most features do not work. |

## Initial scope

Central government and Karnataka public health schemes. Other states later.

---

# Detailed design (Step 2 — for review)

Status: **approved with changes, not implemented.** Only what Phases 3–4 need is designed
here; search, AI, voice and frontend get their own design sections later.

**Approved decisions**

1. One database row per eligibility rule, each with its own source reference.
2. Sources re-checked at least every 180 days, and earlier when a change is detected.
3. Pregnancy and TB questions are asked only when relevant, and never stored or logged.
4. Independent second-person verification is required before a scheme is published.
5. Sources must come from an approved official-source list. References use a page
   number, or a section reference for webpages without pages.

## 1. Backend layout

Only three areas are added in Phases 3–4. Nothing else is created until it is needed.

```
backend/app/
├── main.py          app setup and routes (exists)
├── models.py        input/output shapes (Pydantic): profile, rule, result
├── eligibility.py   the rule engine: pure Python, no database, no AI, no network
└── repository.py    reads/writes schemes and rules in Supabase (Phase 4)
```

- `eligibility.py` takes a profile and a scheme's rules and returns a result.
  It never calls the database or the AI, so it is easy to test (test plan E9, E11).
- Files are split further only when one grows too large.

## 2. API

| Method and path | Who | Purpose |
|---|---|---|
| `GET /health` | Public | Service status (exists) |
| `GET /schemes` | Public | List **published, verified** schemes; filters: `level`, `state` |
| `GET /schemes/{slug}` | Public | One scheme: benefits, documents, rules, sources |
| `POST /eligibility/check` | Public | Profile in → result for each scheme out. Nothing is stored. |
| `POST /admin/schemes` · `PUT /admin/schemes/{id}` | Editor | Create or edit a **draft** version |
| `POST /admin/schemes/{id}/submit` | Editor | Send a draft for review |
| `POST /admin/schemes/{id}/verify` | Reviewer (a different person) | Verify and publish, or return with comments (section 6) |
| `GET/POST /admin/approved-sources` | Admin | View or add approved official-source domains |

Rules for every endpoint:

- **Validation:** inputs are checked by Pydantic. Wrong types or out-of-range values
  return `422` with a clear message, never a crash.
- **Unknown fields are rejected**, so no extra personal data can be sent in.
- **Errors:** users see a short message; internal details are never shown.
- **Admin endpoints** require a Supabase login token, checked on the server, plus the
  right role (section 7).

### Eligibility profile (input)

Every field is **optional**. A missing field means "not answered", never zero or "no".

| Field | Type | Allowed values |
|---|---|---|
| `age` | whole number | 0–120 |
| `gender` | text | `female`, `male`, `other` |
| `state` | text | one of the 36 states and union territories |
| `area_type` | text | `rural`, `urban` |
| `annual_family_income` | whole number (₹) | 0–10,00,00,000 |
| `social_category` | text | `general`, `obc`, `sc`, `st`, `ews` |
| `occupation` | text | fixed list (e.g. `farmer`, `construction_worker`, `student`, …) |
| `has_disability` | yes/no | |
| `is_pregnant_or_lactating` ⚠️ | yes/no | **sensitive** |
| `has_tb_diagnosis` ⚠️ | yes/no | **sensitive** |

**Sensitive health fields (⚠️):**

- **Asked only when relevant.** They are not part of the main questionnaire. If a
  scheme has a rule on one of these fields and it was not answered, the result is
  `need_more_info` naming that field. Only then does the frontend ask the follow-up
  question.
- **Never stored, logged or sent to the AI.** They are used in memory for that one
  check only.

New fields are added only when an official rule needs them, and each is reviewed for
privacy first. **Never collected:** name, phone, Aadhaar, address, exact date of birth,
any document number.

## 3. Database (Supabase Postgres)

| Table | Purpose | Key columns |
|---|---|---|
| `schemes` | One row per scheme (stable identity) | `id`, `slug`, `name`, `level` (central/state), `state`, `current_version_id` |
| `scheme_versions` | Each edit creates a version; published versions are never changed | `id`, `scheme_id`, `version_no`, `status`, `benefits_text`, `benefits_source_id`, `benefits_page`, `benefits_section`, `created_by`, `reviewed_by`, `reviewed_at`, `review_comment` |
| `approved_sources` | Official domains allowed as sources | `domain` (e.g. `pmjay.gov.in`), `issuing_body`, `added_by`, `added_at` |
| `sources` | Official documents and webpages | `id`, `title`, `url`, `kind` (pdf/webpage), `issuing_body`, `document_date`, `checked_at`, `content_hash` |
| `eligibility_rules` | **One row per rule**, per version | `id`, `version_id`, `group_key`, `field`, `operator`, `value`, `message`, `source_id`, `page`, `section` |
| `rule_groups` | How rules combine | `version_id`, `group_key`, `mode` (`all` / `any`) |
| `required_documents` | Documents to apply, per version | `id`, `version_id`, `name`, `source_id`, `page`, `section` |
| `admin_roles` | Who may edit, review or manage sources | `user_id`, `role` (viewer/editor/reviewer/admin) |
| `admin_audit_log` | Every admin change | `id`, `user_id`, `action`, `target`, `at` |

**Source references:** every rule, required document and benefits text must have a
`source_id` plus a location:

- `page`: a page number, for PDFs;
- or `section`: a heading or anchor, for webpages without page numbers
  (e.g. `"Eligibility Criteria"` or `#eligibility`).

At least one is required.

Later phases add `doc_chunks` (search) and `change_alerts` (change tracking).

**Never created:** any table for users' personal details, profiles, eligibility
answers, chat history, voice recordings or uploaded files (test plan P1, P3).

## 4. Eligibility rule format

A **rule** checks one field:

```json
{ "field": "annual_family_income", "operator": "lte", "value": 250000,
  "message": "Family income up to ₹2,50,000 per year",
  "source_id": "src-pmjay-guidelines-2024", "page": 12 }
```

Webpage example: `"source_id": "src-pmjay-website", "section": "Eligibility Criteria"`.

*(The values above only illustrate the format; they are not verified scheme facts.)*

| Operator | Meaning | Example |
|---|---|---|
| `eq` | equals | `gender eq female` |
| `in` / `not_in` | one of / none of | `state in [Karnataka]` |
| `gte` / `lte` | at least / at most | `age gte 18` |
| `is_true` / `is_false` | yes/no field | `has_tb_diagnosis is_true` |
| `manual_check` | cannot be checked from answers | "Family must be listed in SECC 2011" |

**Combining rules:** rules sit in **groups**.

- A group with mode `all` passes if every rule passes.
- A group with mode `any` passes if at least one rule passes (official "either … or" criteria).
- A scheme is eligible only if **every group** passes.

There are no scores or match percentages.

## 5. Unknown answers and results

Each rule gives one of three answers:

| Rule answer | When |
|---|---|
| `pass` | The answer meets the rule |
| `fail` | The answer does not meet the rule |
| `unknown` | The field was not answered, or the rule is `manual_check` |

They combine like this:

- **`all` group:** any `fail` → fail; otherwise any `unknown` → unknown; otherwise pass.
- **`any` group:** any `pass` → pass; otherwise any `unknown` → unknown; otherwise fail.
- The scheme combines its groups the same way as an `all` group.

Final result per scheme:

| Result | Meaning shown to the user |
|---|---|
| `eligible` | All rules met (still confirm on the official portal) |
| `not_eligible` | At least one rule not met, with the reason |
| `need_more_info` | Some answers are missing, or a rule must be checked officially; lists what is needed |
| `rules_not_verified` | Scheme has no verified rules yet; never shown as a match |

Every result lists each rule's answer, message, source document and page or section (test plan E10).
This fixes two live-site bugs: blank income treated as ₹0 (E6), and "80% match" for
schemes with no rules (E8).

## 6. Versioning and source verification

**Version status:** `draft` → `in_review` → `published` → `superseded`. A published
version can also be flagged `outdated` or `conflict`.

- Editors change only `draft` versions, then submit them for review.
- A reviewer either **verifies and publishes** the version, or **returns it to `draft`**
  with a comment.
- Publishing makes a version current and the previous one `superseded`.
- Published versions are never edited or deleted.
- Every eligibility result includes the scheme version used, so past answers can be explained.

**Independent second-person verification.** The reviewer must be a **different person**
from everyone who edited that version. This is checked by the server (`reviewed_by` must
not be any editor of the version) and recorded in the audit log.

**A version can be published only if:**

1. Every rule, required document and the benefits text cite a source **and** a page or section.
2. Every source URL's domain is on the **approved official-source list** (`approved_sources`).
   Only admins can add domains, and each addition is audited.
3. Every source was checked within the last **180 days**.
4. No unresolved `conflict` flag exists (for example, two official documents disagree).
5. It was verified by an independent reviewer (above).

**After publishing — re-checking sources:**

- **At most every 180 days:** a source not re-checked within 180 days marks its versions
  `outdated`. They stay visible with a warning until re-checked.
- **Earlier when a change is detected:** a scheduled job (Phase 9) re-downloads each
  source and compares its `content_hash`. If it changed, the versions using it are
  flagged for review immediately, without waiting for 180 days.
- Re-checking a source updates `checked_at` and is audited.

The public API returns **only published versions** (test plan D6).

## 7. Security and privacy

- **No accounts for citizens.** Eligibility needs no login.
- **Profiles are processed in memory and discarded.** Nothing about the user is
  stored or logged.
- **Logs** record only endpoint, status code, duration and counts — never request
  bodies or answers (P2).
- **Sensitive health answers** (pregnancy, TB) are asked only when a scheme needs them,
  and are never stored, logged or sent to the AI.
- **Supabase row-level security:** the public (anon) key can only read published data;
  it cannot write anything (P6). All writes go through the backend, which checks the
  admin role on the server (M2).
- The Supabase `service_role` key exists only in the backend's environment settings,
  never in the frontend or git.
- **Admin data:** only an admin's Supabase user ID and role are stored, plus their
  actions in the audit log (M4).
- **Rate limiting** on public endpoints (P8). Debug mode is off outside development (P10).

## 8. Failure handling

| Failure | Behaviour |
|---|---|
| Database unavailable | `503` with "Service temporarily unavailable — please use official portals" plus links |
| Invalid input | `422` listing which fields are wrong |
| Scheme has no verified rules | `rules_not_verified`, never a guess |

## 9. Test plan coverage

| Design part | Test plan items |
|---|---|
| Rule format, operators, groups | E1–E5 |
| Unknown answers | E6, E8 |
| Input validation | E7, P9 |
| Pure engine (no database, no AI) | E9, E11 |
| Results with sources | E10, E12 |
| Live-site rules (states, income, age, category, occupation, gender, area) expressible with `in`, `lte`, `gte`, `eq` | E13 |
| Versioning, approved sources, second-person verification | D3–D6, M3, M5 |
| Admin access and audit | M1–M5 |
| Privacy (no personal tables or logs) | P1–P3 |
| Row-level security | P6 |
