"""Tests for automated scheme checks. All documents here are made-up test data."""

import copy
from datetime import date

import pytest

from app.verification import (
    AUTO_SUPPORTED, CONFLICTING, MISSING_SOURCE, NEEDS_ATTENTION,
    SourceDoc, check_legacy_row, check_record, find_duplicates, numbers_in, quote_found,
)

TODAY = date(2026, 11, 21)
APPROVED = {"health.gov.in": "approved", "new.gov.in": "proposed"}
PAGE1 = "Eligibility: family income up to Rs. 2,50,000 per year. Age 18 years or above."
PAGE2 = "Benefit: Rs. 1000 per month paid through DBT."
DOC = SourceDoc(pages=[PAGE1, PAGE2], text=PAGE1 + "\n" + PAGE2, content_hash="sha256:abc")


def good_record():
    src = "src-test"
    return {
        "scheme_id": "test", "name": "Test Scheme",
        "verification": {"status": "draft", "prepared_by": "AI", "reviewed_by": None},
        "sources": [{"id": src, "url": "https://health.gov.in/doc.pdf", "checked_at": "2026-11-01",
                     "content_hash": "sha256:abc"}],
        "rules": {"scheme_id": "test", "name": "Test Scheme", "version": 1, "verified": False, "groups": [
            {"key": "g", "mode": "all", "rules": [
                {"field": "annual_family_income", "operator": "lte", "value": 250000,
                 "message": "Income up to 2,50,000", "source_id": src, "page": 1},
                {"field": "age", "operator": "gte", "value": 18, "message": "Age 18+", "source_id": src, "page": 1},
            ]}]},
        "benefits": [{"text": "Rs 1,000 per month", "source_id": src, "page": 2}],
        "required_documents": [{"name": "Bank account", "source_id": src, "page": 2}],
        "how_to_apply": [{"text": "Apply at the health centre", "source_id": src, "page": 2}],
        "evidence": [
            {"claim": "income", "source_id": src, "page": 1, "quote": "family income up to Rs. 2,50,000 per year"},
            {"claim": "age", "source_id": src, "page": 1, "quote": "Age 18 years or above"},
            {"claim": "benefit", "source_id": src, "page": 2, "quote": "Rs. 1000 per month paid through DBT"},
        ],
        "flags": [],
    }


def check(rec, docs=None, approved=APPROVED):
    return check_record(rec, approved, {"src-test": DOC} if docs is None else docs, TODAY)


# ----- helpers -----

@pytest.mark.parametrize("text, expected", [
    ("Rs. 2,50,000", {250000}), ("250000", {250000}), ("2.5 lakh", {250000}),
    ("Rs 1,000 per month", {1000}), ("1 crore", {10_000_000}),
])
def test_numbers_in_handles_indian_formats(text, expected):
    assert expected <= numbers_in(text)


def test_quote_found_ignores_spacing_case_and_curly_quotes():
    assert quote_found("the PATIENT’s   records", "against the patient's records.")
    assert quote_found("income up to ... per year", PAGE1)
    assert not quote_found("income up to Rs. 3,00,000", PAGE1)


# ----- categories -----

def test_fully_supported_record():
    res = check(good_record())
    assert res.category == AUTO_SUPPORTED, [i.message for i in res.issues]


def test_no_sources_is_missing_official_source():
    rec = good_record()
    rec["sources"], rec["evidence"] = [], []
    assert check(rec, docs={}).category == MISSING_SOURCE


def test_unapproved_domain_is_missing_official_source():
    assert check(good_record(), approved={}).category == MISSING_SOURCE


def test_proposed_domain_needs_attention():
    rec = good_record()
    rec["sources"][0]["url"] = "https://new.gov.in/doc.pdf"
    assert check(rec).category == NEEDS_ATTENTION


def test_quote_not_on_cited_page_needs_attention():
    rec = good_record()
    rec["evidence"][0]["page"] = 2  # income quote is really on page 1
    res = check(rec)
    assert res.category == NEEDS_ATTENTION
    assert any("not found on cited page" in i.message for i in res.issues)


def test_rule_value_without_supporting_quote_needs_attention():
    rec = good_record()
    rec["rules"]["groups"][0]["rules"][0]["value"] = 300000
    res = check(rec)
    assert any("value 300000 not found" in i.message for i in res.issues)


def test_benefit_amount_without_supporting_quote_needs_attention():
    rec = good_record()
    rec["benefits"][0]["text"] = "Rs 1,500 per month"
    assert any("benefit amount 1500" in i.message for i in check(rec).issues)


def test_stale_source_needs_attention():
    rec = good_record()
    rec["sources"][0]["checked_at"] = "2026-01-01"
    assert any("days ago" in i.message for i in check(rec).issues)


def test_changed_document_needs_attention():
    changed = SourceDoc(pages=DOC.pages, text=DOC.text, content_hash="sha256:different")
    res = check(good_record(), docs={"src-test": changed})
    assert any("content has changed" in i.message for i in res.issues)


def test_unreachable_source_needs_attention():
    res = check(good_record(), docs={"src-test": SourceDoc(error="HTTP 403")})
    assert res.category == NEEDS_ATTENTION


def test_reviewer_confirmed_unfetchable_source_is_information_only():
    rec = good_record()
    rec["verification"] = {"status": "reviewed", "prepared_by": "AI", "reviewed_by": "R", "reviewed_at": "2026-11-21"}
    rec["sources"].append({"id": "src-web", "url": "https://health.gov.in/page", "checked_at": "2026-11-21",
                           "content_hash": None, "retrieved_by_system": False})
    res = check(rec, docs={"src-test": DOC, "src-web": SourceDoc(error="HTTP 403")})
    assert res.category == AUTO_SUPPORTED
    assert any("confirmed by reviewer" in i.message and not i.exception for i in res.issues)


def test_cached_copy_note_is_information_only():
    cached = SourceDoc(pages=DOC.pages, text=DOC.text, content_hash="sha256:abc",
                       note="live download failed (SSL); checked the cached copy instead")
    res = check(good_record(), docs={"src-test": cached})
    assert res.category == AUTO_SUPPORTED
    assert any("cached copy" in i.message and not i.exception for i in res.issues)


def test_missing_fields_need_attention():
    rec = good_record()
    rec["how_to_apply"] = []
    assert any("missing how to apply" in i.message for i in check(rec).issues)


def test_contradictory_limits_are_conflicting():
    rec = good_record()
    rec["rules"]["groups"][0]["rules"].append(
        {"field": "age", "operator": "lte", "value": 10, "message": "Age up to 10", "source_id": "src-test", "page": 1})
    assert check(rec).category == CONFLICTING


def test_unresolved_conflict_flag_is_conflicting():
    rec = good_record()
    rec["flags"] = [{"type": "conflict", "detail": "two documents disagree"}]
    assert check(rec).category == CONFLICTING


def test_unconfirmed_flag_needs_attention():
    rec = good_record()
    rec["flags"] = [{"type": "unconfirmed", "detail": "effective date"}]
    assert check(rec).category == NEEDS_ATTENTION


def test_automated_checks_never_change_verification_status():
    rec = good_record()
    before = copy.deepcopy(rec)
    check(rec)
    assert rec == before  # checking a record never edits it


# ----- legacy rows and duplicates -----

def test_legacy_row_is_missing_official_source():
    row = {"official_website": "https://health.gov.in", "health_relevance": "likely_health_care",
           "eligibility_criteria": "x", "benefits": "x", "documents_required": "x", "application_process": "x"}
    assert check_legacy_row(row, APPROVED, None).category == MISSING_SOURCE


def test_duplicates_found_by_name_or_url():
    dupes = find_duplicates([
        ("a", "Nikshay Poshan Yojana", "https://x.gov.in/1"),
        ("b", "Ni-kshay Poshan Yojana (Nutritional Support)", "https://x.gov.in/2"),
        ("c", "Other Scheme", "https://x.gov.in/1"),
        ("d", "Unrelated", "https://y.gov.in"),
    ])
    assert set(dupes["a"]) == {"b", "c"} and dupes["d"] == []
