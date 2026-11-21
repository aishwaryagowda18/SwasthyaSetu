"""API tests using the real scheme records, plus publishing-gate tests (test plan D6)."""

import json
import shutil
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import schemes
from app.main import app

client = TestClient(app)
DATA = Path(__file__).resolve().parents[2] / "data"
DRAFTS = sorted(json.loads(p.read_text(encoding="utf-8"))["scheme_id"]
                for p in (DATA / "schemes").glob("*.json")
                if json.loads(p.read_text(encoding="utf-8"))["verification"]["status"] == "draft")


def test_drafts_exist():
    assert {"ab-pmjay", "pmmvy", "rashtriya-arogya-nidhi", "niramaya", "ab-ark"} <= set(DRAFTS)


# ----- real data -----

def test_list_shows_only_reviewed_schemes():
    ids = [s["scheme_id"] for s in client.get("/schemes").json()["schemes"]]
    assert "nikshay-poshan-yojana" in ids
    assert not set(DRAFTS) & set(ids)  # unverified drafts are never shown


@pytest.mark.parametrize("draft", DRAFTS)
def test_draft_detail_is_not_found(draft):
    assert client.get(f"/schemes/{draft}").status_code == 404


def test_unknown_scheme_is_not_found():
    assert client.get("/schemes/does-not-exist").status_code == 404


def test_nikshay_detail_has_sources_current_and_historical_amounts():
    body = client.get("/schemes/nikshay-poshan-yojana").json()
    assert body["human_reviewed"] is True and body["disclaimer"]
    assert any("1,000" in b["text"] for b in body["benefits"])
    assert any("500" in b["text"] for b in body["historical_benefits"])
    source_ids = {s["id"] for s in body["sources"]}
    for section in ("eligibility", "benefits", "historical_benefits", "required_documents", "how_to_apply"):
        for item in body[section]:
            assert item["source_id"] in source_ids and (item["page"] or item["section"])
    assert any("Effective date" in n for n in body["notices"])  # uncertain detail is disclosed


def test_eligibility_uses_only_published_schemes():
    ids = {r["scheme_id"] for r in client.post("/eligibility/check", json={}).json()["results"]}
    assert "nikshay-poshan-yojana" in ids and not set(DRAFTS) & ids


def test_tb_patient_gets_need_more_info_with_official_checks():
    body = client.post("/eligibility/check", json={"has_tb_diagnosis": True}).json()
    npy = next(r for r in body["results"] if r["scheme_id"] == "nikshay-poshan-yojana")
    assert npy["result"] == "need_more_info" and len(npy["manual_checks"]) == 2


def test_no_tb_is_not_eligible_for_nikshay():
    body = client.post("/eligibility/check", json={"has_tb_diagnosis": False}).json()
    npy = next(r for r in body["results"] if r["scheme_id"] == "nikshay-poshan-yojana")
    assert npy["result"] == "not_eligible"


# ----- publishing gate, using a temporary copy of the data -----

@pytest.fixture
def temp_data(tmp_path, monkeypatch):
    (tmp_path / "schemes").mkdir()
    shutil.copy(DATA / "schemes" / "nikshay-poshan-yojana.json", tmp_path / "schemes")
    shutil.copy(DATA / "approved_sources.json", tmp_path)
    monkeypatch.setenv("SCHEMESAATHI_DATA_DIR", str(tmp_path))
    schemes._load.cache_clear()
    yield tmp_path
    schemes._load.cache_clear()


def _edit(path, change):
    data = json.loads(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(json.dumps(data), encoding="utf-8")
    schemes._load.cache_clear()


def _published_ids():
    return [s["scheme_id"] for s in client.get("/schemes").json()["schemes"]]


def test_gate_publishes_reviewed_record(temp_data):
    assert _published_ids() == ["nikshay-poshan-yojana"]


def test_gate_hides_draft(temp_data):
    _edit(temp_data / "schemes" / "nikshay-poshan-yojana.json",
          lambda d: d["verification"].update(status="draft"))
    assert _published_ids() == []


def test_gate_hides_unapproved_domain(temp_data):
    def unapprove(d):
        for dom in d["domains"]:
            dom["status"] = "proposed"
    _edit(temp_data / "approved_sources.json", unapprove)
    assert _published_ids() == []


def test_gate_hides_stale_source(temp_data):
    old = (date.today() - timedelta(days=181)).isoformat()
    _edit(temp_data / "schemes" / "nikshay-poshan-yojana.json",
          lambda d: d["sources"][0].update(checked_at=old))
    assert _published_ids() == []
    assert client.get("/schemes/nikshay-poshan-yojana").status_code == 404
