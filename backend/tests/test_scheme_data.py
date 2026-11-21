"""Checks for draft scheme data files in data/schemes/ (test plan D3, D4, D6, E12)."""

import json
from pathlib import Path
from urllib.parse import urlparse

import pytest

from app.eligibility import evaluate_scheme
from app.models import Profile, SchemeRules

DATA = Path(__file__).resolve().parents[2] / "data"
APPROVED = {d["domain"] for d in json.loads((DATA / "approved_sources.json").read_text(encoding="utf-8"))["domains"]}
DRAFT_FILES = sorted((DATA / "schemes").glob("*.json"))


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def npy():
    return load(DATA / "schemes" / "nikshay-poshan-yojana.json")


def test_scheme_files_exist():
    assert DRAFT_FILES


@pytest.mark.parametrize("path", DRAFT_FILES, ids=lambda p: p.name)
def test_verification_status_matches_rules(path):
    data = load(path)
    rules = SchemeRules(**data["rules"])  # raises if any rule is badly written
    v = data["verification"]
    assert v["status"] in ("draft", "reviewed")
    if v["status"] == "draft":
        assert rules.verified is False and v["reviewed_by"] is None
    else:  # independent second-person review
        assert rules.verified is True
        assert v["reviewed_by"] and v["reviewed_at"]
        assert v["reviewed_by"] != v["prepared_by"]


@pytest.mark.parametrize("path", DRAFT_FILES, ids=lambda p: p.name)
def test_drafts_never_give_eligibility_results(path):
    data = load(path)
    if data["verification"]["status"] == "draft":
        rules = SchemeRules(**data["rules"])
        assert evaluate_scheme(rules, Profile(has_tb_diagnosis=True)).result == "rules_not_verified"


@pytest.mark.parametrize("path", DRAFT_FILES, ids=lambda p: p.name)
def test_every_item_cites_a_known_source_with_page_or_section(path):
    data = load(path)
    source_ids = {s["id"] for s in data["sources"]}
    items = [r for g in data["rules"]["groups"] for r in g["rules"]]
    items += data["benefits"] + data.get("historical_benefits", [])
    items += data["required_documents"] + data["how_to_apply"] + data["evidence"]
    for item in items:
        assert item["source_id"] in source_ids
        assert item.get("page") or item.get("section")
        for extra in item.get("supporting_source_ids", []):
            assert extra in source_ids


@pytest.mark.parametrize("path", DRAFT_FILES, ids=lambda p: p.name)
def test_every_source_is_on_an_approved_domain_and_dated(path):
    for source in load(path)["sources"]:
        assert urlparse(source["url"]).hostname in APPROVED
        assert source["checked_at"]
        if source.get("retrieved_by_system", True):
            assert source["content_hash"].startswith("sha256:")
        else:  # could not be fetched: must say so and carry no fingerprint
            assert source["content_hash"] is None and source["notes"]


def test_npy_current_and_historical_amounts(npy):
    current = [b for b in npy["benefits"] if "1,000" in b["text"]]
    historical = [b for b in npy["historical_benefits"] if "500" in b["text"]]
    assert len(current) == 1 and current[0]["status"] == "current"
    assert len(historical) == 1 and historical[0]["status"] == "superseded"


# ----- E12: hand-worked profiles for Ni-kshay Poshan Yojana -----

@pytest.fixture(scope="module")
def npy_rules_for_testing(npy):
    return SchemeRules(**npy["rules"])


def test_e12_tb_patient_needs_official_checks_never_auto_eligible(npy_rules_for_testing):
    res = evaluate_scheme(npy_rules_for_testing, Profile(has_tb_diagnosis=True))
    assert res.result == "need_more_info"
    assert len(res.manual_checks) == 2  # NIKSHAY registration, on treatment


def test_e12_person_without_tb_is_not_eligible(npy_rules_for_testing):
    assert evaluate_scheme(npy_rules_for_testing, Profile(has_tb_diagnosis=False)).result == "not_eligible"


def test_e12_tb_question_unanswered_asks_for_it(npy_rules_for_testing):
    res = evaluate_scheme(npy_rules_for_testing, Profile(age=40, state="Karnataka"))
    assert res.result == "need_more_info"
    assert res.missing_fields == ["has_tb_diagnosis"]


@pytest.mark.parametrize("answers", [
    {"age": 5}, {"age": 80}, {"annual_family_income": 50_000_000}, {"state": "Kerala"},
    {"social_category": "general"}, {"gender": "male"}, {"area_type": "urban"},
])
def test_e12_no_age_income_state_or_category_restriction(npy_rules_for_testing, answers):
    res = evaluate_scheme(npy_rules_for_testing, Profile(has_tb_diagnosis=True, **answers))
    assert res.result == "need_more_info"  # same as with no extra answers
