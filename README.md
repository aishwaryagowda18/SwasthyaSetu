# SchemeSaathi Platform

An AI-assisted helper for **Indian public health schemes**. It helps people find
schemes, understand benefits, check eligibility and prepare application documents.

> **Disclaimer:** SchemeSaathi is **not an official government service** and is not
> affiliated with any government body. Information is drawn from official government
> sources, but always confirm eligibility and details on the official scheme portal
> before applying.

## Scope (initial)

- Central government public health schemes
- Karnataka state public health schemes
- Languages: English and Kannada (planned)

## Core principles

1. **Official sources only.** Every scheme fact links to an official document and page.
2. **Eligibility is decided by tested Python rules, never by the AI.** The AI only
   explains official text.
3. **No personal data is stored.** No Aadhaar numbers, personal documents, chat
   history or voice recordings. See [SECURITY.md](SECURITY.md).
4. **Neutral recommendations.** No ads or sponsored placements.

## Folder guide

| Folder / file | Purpose |
|---|---|
| `docs/` | Architecture and design decisions |
| `backend/` | Python FastAPI backend: eligibility engine, scheme API, bulk source verification |
| `data/` | Official, non-personal scheme records (drafts and reviewed) and the approved source list |
| `frontend/` | React web app (Whitepace-inspired design) |
| `tools/` | One-time data tools |
| `.env.example` | Names of required settings. Copy to `.env` and fill in locally. |

## Status

MVP: FastAPI backend (eligibility engine, published schemes, bulk source verification) and a
React frontend (discovery, questionnaire, results, scheme details).
See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).
See [docs/architecture.md](docs/architecture.md) for the agreed plan.
