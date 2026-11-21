"""SchemeSaathi API - backend entry point.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI, HTTPException

from app.eligibility import check_eligibility
from app.models import (
    CitedItem,
    EligibilityResponse,
    Profile,
    SchemeDetail,
    SchemeList,
    SchemeSummary,
    SourceRef,
)
from app.schemes import load_all, official_apply_link, published_records, published_rules

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
        notices=[f.get("public_note") or "Some details of this scheme are awaiting official confirmation."
                 for f in rec.get("flags", []) if f.get("type") == "unconfirmed"],
        sources=[SourceRef(id=s["id"], title=s["title"], url=s["url"], checked_at=s["checked_at"])
                 for s in rec["sources"]],
        human_reviewed=True,
        disclaimer=DISCLAIMER,
    )
