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
| `/catalogue` | All Schemes: 387 central and Karnataka schemes, **unverified**, with search, tabs and category filter |
| `/catalogue/:id` | One unverified catalogue entry, with a warning banner |

The "Ask SchemeSathi" button (every page) opens the chat assistant. It suggests schemes with benefits
and marks each source Verified or Unverified. Messages stay in memory only and are cleared on reload.

"Apply on Official Website" appears only when the API returns a verified official URL;
otherwise "Link not available" is shown. URLs are never generated in the frontend.

Answers stay in memory only (never saved in the browser or on the server).
Only human-reviewed schemes are shown; drafts return "not available".

## Kannada and voice

- **Language:** the "ಕನ್ನಡ / English" button in the header switches the interface. Interface text is
  written as `t("English text")`; translations are in `src/kn.ts` (a test fails if any is missing).
  Scheme content from official sources stays as written (not machine-translated). The choice is kept
  in memory only. The Kannada text is a first draft and should be checked by a native speaker.
- **Chatbot:** replies in the chosen language and understands common Kannada words (see
  `KANNADA_WORDS` in `backend/app/chat.py`).
- **Voice:** the microphone button uses the browser's speech recognition (Edge/Chrome; it may send audio
  to Microsoft/Google, which the chat window says while listening). "Read aloud" uses the device's
  voices; if no Kannada voice is installed, the user is told instead of hearing garbled speech.
- **Last checked:** reviewed scheme cards and results show when their official sources were last checked;
  All Schemes shows that its data is from about January 2025.

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
