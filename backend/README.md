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

## Files

| File | Purpose |
|---|---|
| `app/main.py` | The FastAPI app and public endpoints |
| `app/eligibility.py` | Deterministic eligibility engine |
| `app/schemes.py` | Loads scheme records; publishing gate; verified apply links |
| `app/admin.py`, `app/auth.py` | Admin API, accounts and sessions |
| `app/verification.py`, `verify_schemes.py` | Bulk source verification and CSV report |
| `manage_admins.py` | Create, list and remove admin accounts |
| `tests/` | Automatic tests |
| `requirements.txt` | Packages needed to run (exact versions) |
| `requirements-dev.txt` | Extra packages for testing |
| `pyproject.toml` | Project and pytest settings |
