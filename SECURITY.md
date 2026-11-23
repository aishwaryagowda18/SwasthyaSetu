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
- Independent second-person review is enforced by the server before a scheme is published.
- Admin actions are recorded in an audit log, including failed logins, lockouts, forbidden
  attempts and blocked actions. Passwords and tokens are never logged.
- Admin accounts (`backend/admin_users.json`) and the audit log (`backend/admin_audit_log.jsonl`)
  are local files and are never committed to git.

## TODO before production deployment (known limitations)

The current admin panel is designed for local use. Resolve these before any public deployment:

1. **Sessions and lockout counters are in memory.** A backend restart signs everyone out and
   resets lockout counters. Store sessions and failed-login counters persistently (e.g. Supabase).
2. **Lockout is per username only.** An attacker can deliberately lock out a real admin, and trying
   many usernames is not limited per IP. Add per-IP rate limiting on `/admin/login` (test plan P8).
3. **The session token is held in browser memory and sent as a Bearer header.** Script injection
   (XSS) on the page could read it while signed in. Serve only over HTTPS, add a strict
   Content-Security-Policy header, or move to HttpOnly + Secure + SameSite cookies with CSRF protection.
4. **Unauthenticated requests to admin endpoints are not audited** (to avoid log flooding).
   Failed logins are audited. Consider rate-limited logging of repeated 401s.

## Reporting a problem

If you find a security or privacy issue, do not open a public issue. Contact the
project maintainers privately with a description of the problem.
