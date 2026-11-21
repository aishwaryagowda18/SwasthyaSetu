"""SchemeSaathi API - backend entry point.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI

from app.eligibility import check_eligibility
from app.models import EligibilityResponse, Profile, SchemeRules

APP_VERSION = "0.1.0"
SERVICE_NAME = "schemesaathi-api"
DISCLAIMER = (
    "This is not an official government service. Results are guidance only; "
    "always confirm eligibility on the official scheme portal before applying."
)

# ---------------------------------------------------------------------------
# SAMPLE TEST RULES ONLY - NOT REAL SCHEMES, NOT OFFICIAL DATA.
# They exist only to demonstrate and test the engine. Verified official schemes
# replace them in Step 4. Every response says "sample_data": true while these are used.
# ---------------------------------------------------------------------------
_SAMPLE_SOURCE = "SAMPLE-TEST-ONLY"
SAMPLE_TEST_SCHEMES = [
    SchemeRules(
        scheme_id="sample-age-income-state", name="SAMPLE A - age, income and state (test only)",
        version=1, verified=True,
        groups=[{"key": "basic", "mode": "all", "rules": [
            {"field": "age", "operator": "gte", "value": 18, "message": "Age 18 or above",
             "source_id": _SAMPLE_SOURCE, "section": "Sample A"},
            {"field": "age", "operator": "lte", "value": 60, "message": "Age 60 or below",
             "source_id": _SAMPLE_SOURCE, "section": "Sample A"},
            {"field": "annual_family_income", "operator": "lte", "value": 250000,
             "message": "Family income up to 2,50,000 rupees per year",
             "source_id": _SAMPLE_SOURCE, "section": "Sample A"},
            {"field": "state", "operator": "in", "value": ["Karnataka"],
             "message": "Resident of Karnataka", "source_id": _SAMPLE_SOURCE, "section": "Sample A"},
        ]}],
    ),
    SchemeRules(
        scheme_id="sample-maternity-either-or", name="SAMPLE B - either/or and sensitive field (test only)",
        version=1, verified=True,
        groups=[
            {"key": "who", "mode": "all", "rules": [
                {"field": "gender", "operator": "eq", "value": "female", "message": "Women only",
                 "source_id": _SAMPLE_SOURCE, "section": "Sample B"},
                {"field": "is_pregnant_or_lactating", "operator": "is_true",
                 "message": "Pregnant or breastfeeding", "source_id": _SAMPLE_SOURCE, "section": "Sample B"},
            ]},
            {"key": "income_or_category", "mode": "any", "rules": [
                {"field": "annual_family_income", "operator": "lte", "value": 800000,
                 "message": "Family income up to 8,00,000 rupees per year",
                 "source_id": _SAMPLE_SOURCE, "section": "Sample B"},
                {"field": "social_category", "operator": "in", "value": ["sc", "st"],
                 "message": "SC or ST category", "source_id": _SAMPLE_SOURCE, "section": "Sample B"},
            ]},
        ],
    ),
    SchemeRules(
        scheme_id="sample-manual-check", name="SAMPLE C - needs an official check (test only)",
        version=1, verified=True,
        groups=[{"key": "basic", "mode": "all", "rules": [
            {"field": "annual_family_income", "operator": "lte", "value": 100000,
             "message": "Family income up to 1,00,000 rupees per year",
             "source_id": _SAMPLE_SOURCE, "section": "Sample C"},
            {"operator": "manual_check", "message": "Family must be listed in the official beneficiary database",
             "source_id": _SAMPLE_SOURCE, "section": "Sample C"},
        ]}],
    ),
    SchemeRules(
        scheme_id="sample-unverified", name="SAMPLE D - rules not verified yet (test only)",
        version=1, verified=False,
    ),
]

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
    """Check answers against each scheme's rules. Answers are not stored or logged."""
    return EligibilityResponse(
        disclaimer=DISCLAIMER,
        sample_data=True,
        results=check_eligibility(profile, SAMPLE_TEST_SCHEMES),
    )
