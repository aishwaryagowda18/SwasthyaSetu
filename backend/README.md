# SchemeSaathi Backend

Python FastAPI backend. Currently a skeleton with one endpoint, `/health`.

## Requirements

- Python 3.12 or newer
- Windows commands are shown; run them from this `backend` folder.

## Setup (first time)

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

`.venv` is a private package folder for this project only. It is never committed.
Delete it to remove everything that was installed.

## Run the tests

```powershell
.venv\Scripts\python -m pytest -v
```

## Run the server locally

```powershell
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then open:

- http://127.0.0.1:8000/health — should return `{"status":"ok",...}`
- http://127.0.0.1:8000/docs — automatic API documentation

`127.0.0.1` means only this computer can reach the server. Press `Ctrl+C` to stop it.

## Admin panel (review and publishing)

Admin accounts are local (no external service). Create them yourself; passwords are typed
privately and stored only as salted scrypt hashes in `admin_users.json` (git-ignored).

```powershell
.venv\Scripts\python -m manage_admins add aishwarya --name "Aishwarya A" --role admin
.venv\Scripts\python -m manage_admins add reviewer2 --name "Second Reviewer" --role reviewer
.venv\Scripts\python -m manage_admins list
```

Then sign in at http://127.0.0.1:5173/admin/login (footer link "Admin sign in").

| Role | Can |
|---|---|
| viewer | read drafts and checks |
| editor | + submit a draft for review |
| reviewer | + publish or return a scheme in review |
| admin | + unpublish, approve source domains, read the audit log |

Workflow: **draft → submit (editor) → in review → publish (an independent reviewer) → public**.
The server enforces that the reviewer did not prepare or submit the scheme, blocks publishing with
unapproved/stale sources, missing sources or conflicts, and requires open exceptions to be
acknowledged. Every action is written to `admin_audit_log.jsonl` (git-ignored). Sessions are kept
in memory for 8 hours (restarting the server signs everyone out); 5 wrong passwords lock an
account for 15 minutes.

## All Schemes catalogue (unverified)

`data/catalogue/unverified_schemes.json` holds 387 central and Karnataka schemes (all categories)
copied from the old project's myScheme CSV. It is **not verified**: it is never used for eligibility,
every API response marks it `verified: false` with a warning, and it links to a reviewed record only
when that record is published. Damaged characters from the source are shown as `�`, never guessed.
To rebuild it (the old repository is only read, never changed), from `schemesaathi-platform/`:

```powershell
backend\.venv\Scripts\python -I tools\build_catalogue.py "..\SchemeSaathi" data\catalogue\unverified_schemes.json
```

## Chat assistant

`POST /chat` answers **from the scheme database, with no API needed**:

1. Aadhaar-like numbers, phone numbers and emails are removed from the message.
2. The type of question is detected: general, benefits, who can apply, documents, or how to apply.
3. Matching schemes are found by keyword search (reviewed records first, then the unverified catalogue).
   Place words like "Karnataka" alone don't make a scheme match; weak matches and duplicates are dropped.
4. Each suggested scheme comes with the matching sections taken from its record.
   Follow-ups ("what documents are needed?", "how do I apply for the second one?") use the schemes
   from the previous reply (`context_ids`, published records only).

The assistant never decides eligibility. Limited to 10 questions per minute per computer.

Optional: if `ANTHROPIC_API_KEY` is set in `backend/.env` (git-ignored; never paste it into chat or
commits), Claude Haiku 5.5 also writes a short summary from the same sources. If the key is missing or
the API fails, the database answer is used. Set `SCHEMESAATHI_DISABLE_AI=1` to never call the API;
the tests always do this.

## Files

| File | Purpose |
|---|---|
| `app/main.py` | The FastAPI app and public endpoints |
| `app/eligibility.py` | Deterministic eligibility engine |
| `app/schemes.py` | Loads scheme records; publishing gate; verified apply links |
| `app/admin.py`, `app/auth.py` | Admin API, accounts and sessions |
| `app/verification.py`, `verify_schemes.py` | Bulk source verification and CSV report |
| `app/catalogue.py` | Unverified catalogue loading and keyword search |
| `app/chat.py`, `app/config.py` | Chat assistant (retrieval, redaction, Claude call) and `.env` loading |
| `manage_admins.py` | Create, list and remove admin accounts |
| `tests/` | Automatic tests |
| `requirements.txt` | Packages needed to run (exact versions) |
| `requirements-dev.txt` | Extra packages for testing |
| `pyproject.toml` | Project and pytest settings |
