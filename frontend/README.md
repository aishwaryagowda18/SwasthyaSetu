# SchemeSaathi Frontend

React + Vite + TypeScript + Tailwind, with a design inspired by the Whitepace SaaS landing page
(navy, blue and yellow; Inter).
It talks to the FastAPI backend through `/api` (forwarded to `http://127.0.0.1:8000` in development).

## Pages

| Route | Page |
|---|---|
| `/` | Home: how it works, reviewed schemes (search + All / Central / Karnataka State tabs) |
| `/questionnaire` | 4-step questionnaire; every question optional |
| `/results` | Eligibility results with level tabs; asks follow-up questions (e.g. TB) only when a scheme needs them |
| `/schemes/:id` | Scheme details with official sources, page/section references and notices |

"Apply on Official Website" appears only when the API returns a verified official URL;
otherwise "Link not available" is shown. URLs are never generated in the frontend.

Answers stay in memory only (never saved in the browser or on the server).
Only human-reviewed schemes are shown; drafts return "not available".

## Run locally (Windows)

```powershell
# 1. Backend (in another terminal, from backend/)
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Frontend (from frontend/)
npm install
npm run dev        # http://127.0.0.1:5173
```

## Tests

```powershell
npm test           # unit tests (Vitest, API mocked)
npm run build      # type check + production build
npm run e2e        # full user journey in Microsoft Edge against the real backend
```
