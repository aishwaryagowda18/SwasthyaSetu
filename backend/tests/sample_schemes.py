"""SAMPLE TEST RULES ONLY - NOT REAL SCHEMES, NOT OFFICIAL DATA. Used by engine tests."""

from app.models import SchemeRules

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
