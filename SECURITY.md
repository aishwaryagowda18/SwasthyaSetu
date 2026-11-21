# Security and Privacy Rules

These rules apply to all code, data and contributors in this project.

## Personal data

- **Never collect, store or upload** Aadhaar numbers, Aadhaar copies, income
  certificates or any other personal identity documents.
- Eligibility answers (age, state, income range, etc.) are used only for the current
  request and are **not saved**.
- **No chat history or voice recordings are stored.** Audio is processed in memory
  and discarded.
- Logs must not contain personal details. Log events and error types, not user input.

## Secrets

- API keys, passwords and database credentials go **only** in a local `.env` file.
- `.env` is never committed. Only `.env.example` (names, no values) is committed.
- Never paste secret keys (for example the Supabase `service_role` key) into chat,
  issues, screenshots or code.
- If a secret is ever committed or shared: **revoke it immediately**, then remove it
  from git history.

## Data sources

- Scheme information must come from **verified official government sources**.
- Every fact should record its source document, page and the date it was checked.
- Outdated or conflicting information must be flagged, not silently used.

## Admin access

- Admin features require login with a role check performed on the server.
- Admin changes are recorded in an audit log.

## Reporting a problem

If you find a security or privacy issue, do not open a public issue. Contact the
project maintainers privately with a description of the problem.
