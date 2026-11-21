"""Eligibility engine tests (test plan E1-E11) and API validation.

All rules here are SAMPLE TEST RULES, not real scheme data.
"""

import ast
import socket
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.eligibility import check_eligibility, evaluate_scheme
from app.main import app
from app.models import Profile, Rule, SchemeRules
from tests.sample_schemes import SAMPLE_TEST_SCHEMES

client = TestClient(app)
SRC = "SAMPLE-TEST-ONLY"


def rule(field, operator, value=None, **extra):
    return {"field": field, "operator": operator, "value": value,
            "message": f"{field} {operator} {value}", "source_id": SRC, "page": 1, **extra}


def scheme(*rules, mode="all", verified=True):
    return SchemeRules(scheme_id="t", name="Test scheme", version=1, verified=verified,
                       groups=[{"key": "g", "mode": mode, "rules": list(rules)}] if rules else [])


def result_for(s, **answers):
    return evaluate_scheme(s, Profile(**answers)).result


# ----- E1-E3: boundaries -----

@pytest.mark.parametrize("age, expected", [(17, "not_eligible"), (18, "eligible"), (19, "eligible")])
def test_e1_minimum_age_boundary(age, expected):
    assert result_for(scheme(rule("age", "gte", 18)), age=age) == expected


@pytest.mark.parametrize("age, expected", [(59, "eligible"), (60, "eligible"), (61, "not_eligible")])
def test_e2_maximum_age_boundary(age, expected):
    assert result_for(scheme(rule("age", "lte", 60)), age=age) == expected


@pytest.mark.parametrize("income, expected", [
    (249_999, "eligible"), (250_000, "eligible"), (250_001, "not_eligible")])
def test_e3_income_limit_boundary(income, expected):
    assert result_for(scheme(rule("annual_family_income", "lte", 250_000)),
                      annual_family_income=income) == expected


# ----- E4-E5: other rule types, with reasons -----

def test_e4_state_rule_with_reason():
    res = evaluate_scheme(scheme(rule("state", "in", ["Karnataka"], message="Resident of Karnataka")),
                          Profile(state="Kerala"))
    assert res.result == "not_eligible"
    failed = [r for g in res.groups for r in g.rules if r.outcome == "fail"]
    assert [r.message for r in failed] == ["Resident of Karnataka"]


@pytest.mark.parametrize("r, match, no_match", [
    (rule("gender", "eq", "female"), {"gender": "female"}, {"gender": "male"}),
    (rule("social_category", "in", ["sc", "st"]), {"social_category": "st"}, {"social_category": "general"}),
    (rule("social_category", "not_in", ["general"]), {"social_category": "obc"}, {"social_category": "general"}),
    (rule("area_type", "eq", "rural"), {"area_type": "rural"}, {"area_type": "urban"}),
    (rule("occupation", "in", ["farmer"]), {"occupation": "farmer"}, {"occupation": "student"}),
    (rule("has_disability", "is_true"), {"has_disability": True}, {"has_disability": False}),
    (rule("has_disability", "is_false"), {"has_disability": False}, {"has_disability": True}),
])
def test_e5_each_rule_type_matches_and_fails(r, match, no_match):
    assert result_for(scheme(r), **match) == "eligible"
    assert result_for(scheme(r), **no_match) == "not_eligible"


def test_e5_any_group_needs_only_one_pass():
    s = scheme(rule("annual_family_income", "lte", 100_000), rule("social_category", "in", ["sc"]), mode="any")
    assert result_for(s, annual_family_income=900_000, social_category="sc") == "eligible"
    assert result_for(s, annual_family_income=900_000, social_category="general") == "not_eligible"


# ----- E6: missing answers never cause not_eligible -----

def test_e6_missing_income_needs_more_info_not_zero():
    res = evaluate_scheme(scheme(rule("annual_family_income", "lte", 250_000)), Profile())
    assert res.result == "need_more_info"
    assert res.missing_fields == ["annual_family_income"]


def test_e6_missing_answer_in_any_group_is_unknown_not_fail():
    s = scheme(rule("annual_family_income", "lte", 100_000), rule("social_category", "in", ["sc"]), mode="any")
    assert result_for(s, social_category="general") == "need_more_info"


def test_e6_known_failure_still_reported_when_other_answers_missing():
    res = evaluate_scheme(scheme(rule("age", "gte", 18), rule("annual_family_income", "lte", 1)), Profile(age=10))
    assert res.result == "not_eligible"  # because of the failed age rule, not the missing income
    assert [r.outcome for r in res.groups[0].rules] == ["fail", "unknown"]


def test_e6_empty_profile_never_not_eligible_for_any_sample_scheme():
    results = check_eligibility(Profile(), SAMPLE_TEST_SCHEMES)
    assert "not_eligible" not in {r.result for r in results}


def test_e6_manual_check_gives_need_more_info():
    s = SchemeRules(scheme_id="t", name="t", version=1, verified=True, groups=[{"key": "g", "mode": "all", "rules": [
        {"operator": "manual_check", "message": "Listed in official database", "source_id": SRC, "section": "S"}]}])
    res = evaluate_scheme(s, Profile(age=30))
    assert res.result == "need_more_info"
    assert res.manual_checks == ["Listed in official database"]


def test_sensitive_field_requested_only_when_a_scheme_needs_it():
    by_id = {r.scheme_id: r for r in check_eligibility(
        Profile(gender="female", age=30, annual_family_income=100_000, state="Karnataka"), SAMPLE_TEST_SCHEMES)}
    assert "is_pregnant_or_lactating" in by_id["sample-maternity-either-or"].missing_fields
    assert "is_pregnant_or_lactating" not in by_id["sample-age-income-state"].missing_fields


def test_missing_field_not_requested_when_group_already_passed():
    s = scheme(rule("annual_family_income", "lte", 100_000), rule("social_category", "in", ["sc"]), mode="any")
    res = evaluate_scheme(s, Profile(social_category="sc"))
    assert res.result == "eligible" and res.missing_fields == []


# ----- E8: unverified rules kept separate -----

def test_e8_unverified_scheme_is_never_a_match():
    res = evaluate_scheme(scheme(rule("age", "gte", 0), verified=False), Profile(age=30))
    assert res.result == "rules_not_verified"
    assert res.groups == []  # rules are not even evaluated


def test_e8_scheme_with_no_rules_is_not_verified():
    assert result_for(scheme(), age=30) == "rules_not_verified"


# ----- E9: deterministic -----

def test_e9_same_input_same_output_100_times():
    profile = Profile(age=30, gender="female", state="Karnataka", annual_family_income=200_000)
    first = [r.model_dump() for r in check_eligibility(profile, SAMPLE_TEST_SCHEMES)]
    for _ in range(100):
        assert [r.model_dump() for r in check_eligibility(profile, SAMPLE_TEST_SCHEMES)] == first


# ----- E10: every result explains itself, with a source -----

def test_e10_every_rule_result_has_message_and_source_location():
    for res in check_eligibility(Profile(age=30), SAMPLE_TEST_SCHEMES):
        for group in res.groups:
            for r in group.rules:
                assert r.message and r.source_id and (r.page or r.section)


def test_e10_rule_without_page_or_section_is_rejected():
    with pytest.raises(ValidationError, match="page or section"):
        Rule(field="age", operator="gte", value=18, message="m", source_id=SRC)


@pytest.mark.parametrize("bad", [
    {"field": "age", "operator": "in", "value": 18},  # in needs a list
    {"field": "state", "operator": "gte", "value": 5},  # numbers only on number fields
    {"field": "age", "operator": "gte", "value": "18"},  # value must be a number
    {"field": "age", "operator": "manual_check"},  # manual_check takes no field
    {"field": "has_disability", "operator": "eq", "value": "yes"},  # yes/no needs is_true/is_false
])
def test_badly_written_rules_are_rejected(bad):
    with pytest.raises(ValidationError):
        Rule(**bad, message="m", source_id=SRC, page=1)


# ----- E11: no AI, database or network -----

def test_e11_engine_imports_nothing_external():
    tree = ast.parse(Path("app/eligibility.py").read_text(encoding="utf-8"))
    imported = {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)} | {
        a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    assert imported <= {"collections.abc", "app.models"}


def test_e11_engine_works_with_network_disabled(monkeypatch):
    def no_network(*args, **kwargs):
        raise AssertionError("network used")
    monkeypatch.setattr(socket, "socket", no_network)
    assert check_eligibility(Profile(age=30), SAMPLE_TEST_SCHEMES)


# ----- API: /eligibility/check -----

def test_api_uses_real_data_not_samples():
    body = client.post("/eligibility/check", json={"age": 30}).json()
    assert body["sample_data"] is False and "not an official government service" in body["disclaimer"]
    assert not any(r["scheme_id"].startswith("sample-") for r in body["results"])


def test_api_empty_body_is_valid_and_never_not_eligible():
    response = client.post("/eligibility/check", json={})
    assert response.status_code == 200
    assert "not_eligible" not in {r["result"] for r in response.json()["results"]}


# ----- E7: invalid input is rejected cleanly -----

@pytest.mark.parametrize("bad_input", [
    {"age": -5}, {"age": 200}, {"age": "abc"}, {"age": "30"}, {"age": 25.5},
    {"annual_family_income": -1}, {"state": "Atlantis"}, {"gender": "unknown"},
    {"has_disability": "yes"}, {"is_pregnant_or_lactating": 1},
    {"aadhaar": "000000000000"},  # unknown fields (e.g. personal data) are rejected
])
def test_e7_invalid_input_returns_422(bad_input):
    response = client.post("/eligibility/check", json=bad_input)
    assert response.status_code == 422


def test_e7_non_json_body_returns_422():
    response = client.post("/eligibility/check", content="not json",
                           headers={"Content-Type": "application/json"})
    assert response.status_code == 422
