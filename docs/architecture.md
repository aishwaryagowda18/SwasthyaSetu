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
