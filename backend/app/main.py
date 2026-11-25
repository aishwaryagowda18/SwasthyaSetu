"""SchemeSaathi API - backend entry point.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI, HTTPException, Query, Request

from app.config import load_env

load_env()  # reads backend/.env (git-ignored), e.g. ANTHROPIC_API_KEY

from app import catalogue, chat  # noqa: E402
from app.admin import router as admin_router  # noqa: E402
from app.eligibility import check_eligibility  # noqa: E402
from app.models import (  # noqa: E402
    CitedItem,
    EligibilityResponse,
    Profile,
    SchemeDetail,
    SchemeList,
    SchemeSummary,
    SourceRef,
)
from app.schemes import load_all, official_apply_link, published_records, published_rules  # noqa: E402

APP_VERSION = "0.1.0"
SERVICE_NAME = "schemesaathi-api"
DISCLAIMER = (
    "This is not an official government service. Results are guidance only; "
    "always confirm eligibility on the official scheme portal before applying."
)

app = FastAPI(
    title="SchemeSaathi API",
    version=APP_VERSION,
    description=(
        "Backend for SchemeSaathi, a helper for Indian public health schemes. "
        "This is not an official government service. Always confirm details on the "
        "official scheme portal before applying."
    ),
)


app.include_router(admin_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Report that the service is running. Used by tests and monitoring."""
    return {"status": "ok", "service": SERVICE_NAME, "version": APP_VERSION}


@app.post("/eligibility/check", tags=["eligibility"])
def eligibility_check(profile: Profile) -> EligibilityResponse:
    """Check answers against each published scheme's rules. Answers are not stored or logged."""
    return EligibilityResponse(
        disclaimer=DISCLAIMER,
        sample_data=False,
        results=check_eligibility(profile, published_rules()),
    )


def _summary(rec: dict) -> dict:
    return {
        "scheme_id": rec["scheme_id"],
        "name": rec["name"],
        "level": rec.get("level", ""),
        "state": rec.get("state"),
        "issuing_body": rec.get("issuing_body", ""),
        "last_checked": min(s["checked_at"] for s in rec["sources"]),
        "apply_link": official_apply_link(rec, load_all()[1]),
    }


def _cited(items: list[dict], text_key: str = "text") -> list[CitedItem]:
    return [CitedItem(text=i[text_key], source_id=i["source_id"], page=i.get("page"),
                      section=i.get("section")) for i in items]


@app.get("/schemes", tags=["schemes"])
def list_schemes() -> SchemeList:
    """Published, human-reviewed schemes only. Drafts are never listed."""
    return SchemeList(disclaimer=DISCLAIMER,
                      schemes=[SchemeSummary(**_summary(r)) for r in published_records()])


@app.get("/schemes/{scheme_id}", tags=["schemes"])
def get_scheme(scheme_id: str) -> SchemeDetail:
    """Details of one published scheme, with official sources for every item."""
    rec = next((r for r in published_records() if r["scheme_id"] == scheme_id), None)
    if rec is None:
        raise HTTPException(status_code=404, detail="Scheme not found")
    rules = [r for g in rec["rules"]["groups"] for r in g["rules"]]
    return SchemeDetail(
        **_summary(rec),
        eligibility=_cited(rules, "message"),
        benefits=_cited(rec.get("benefits", [])),
        historical_benefits=_cited(rec.get("historical_benefits", [])),
        required_documents=_cited(rec.get("required_documents", []), "name"),
        how_to_apply=_cited(rec.get("how_to_apply", [])),
        # Citizens see a plain-language note; internal reviewer wording is never shown.
        notices=list(dict.fromkeys(  # de-duplicated, order kept
            f.get("public_note") or "Some details of this scheme are awaiting official confirmation."
            for f in rec.get("flags", []) if f.get("type") == "unconfirmed")),
        sources=[SourceRef(id=s["id"], title=s["title"], url=s["url"], checked_at=s["checked_at"])
                 for s in rec["sources"]],
        human_reviewed=True,
        disclaimer=DISCLAIMER,
    )


# ----- Unverified catalogue (never used for eligibility) -----

@app.get("/catalogue", tags=["catalogue"])
def catalogue_search(
    q: str = Query(default="", max_length=200),
    level: str | None = Query(default=None, pattern="^(central|state)$"),
    state: str | None = Query(default=None, max_length=80),
    category: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=20, ge=1, le=50),
) -> dict:
    """Search ALL schemes from the unverified catalogue. Every result is marked verified=false."""
    found = catalogue.search(q, level, state, category)
    start = (page - 1) * page_size
    published = {r["scheme_id"] for r in published_records()}
    results = []
    for _, e in found[start:start + page_size]:
        s = catalogue.summary(e)
        if s["reviewed_scheme_id"] not in published:  # link only to reviewed versions that are public
            s["reviewed_scheme_id"] = None
        results.append(s)
    return {"warning": catalogue.WARNING, "total": len(found), "page": page, "page_size": page_size, "results": results}


@app.get("/catalogue/facets", tags=["catalogue"])
def catalogue_facets() -> dict:
    return catalogue.facets()


@app.get("/catalogue/{entry_id}", tags=["catalogue"])
def catalogue_entry(entry_id: str) -> dict:
    entry = catalogue.get(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Scheme not found")
    published = {r["scheme_id"] for r in published_records()}
    return {**entry, "verified": False, "warning": catalogue.WARNING,
            "reviewed_scheme_id": entry.get("reviewed_scheme_id") if entry.get("reviewed_scheme_id") in published else None}


# ----- Chatbot -----

@app.post("/chat", tags=["chat"])
def chat_endpoint(body: chat.ChatRequest, request: Request) -> chat.ChatResponse:
    """Answer a question from reviewed and unverified scheme data. Messages are not stored or logged."""
    if not chat.allow(request.client.host if request.client else "unknown"):
        raise HTTPException(status_code=429, detail="Too many questions. Please wait a minute and try again.")
    return chat.answer(body)
