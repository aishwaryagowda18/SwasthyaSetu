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

## Files

| File | Purpose |
|---|---|
| `app/main.py` | The FastAPI app and its endpoints |
| `tests/` | Automatic tests |
| `requirements.txt` | Packages needed to run (exact versions) |
| `requirements-dev.txt` | Extra packages for testing |
| `pyproject.toml` | Project and pytest settings |
