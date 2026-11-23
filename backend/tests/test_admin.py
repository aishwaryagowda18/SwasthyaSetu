"""Admin panel API tests (test plan M1-M5, plus security). Uses temporary data and accounts only."""

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import admin, auth, schemes
from app.main import app
from app.verification import CONFLICTING, MISSING_SOURCE, NEEDS_ATTENTION, Issue, Result

client = TestClient(app)
DATA = Path(__file__).resolve().parents[2] / "data"
PASSWORD = "correct-horse-battery"
DRAFT = "ab-pmjay"


@pytest.fixture(autouse=True)
def env(tmp_path, monkeypatch):
    (tmp_path / "schemes").mkdir()
    for name in ("ab-pmjay.json", "nikshay-poshan-yojana.json"):
        shutil.copy(DATA / "schemes" / name, tmp_path / "schemes")
    shutil.copy(DATA / "approved_sources.json", tmp_path)
    monkeypatch.setenv("SCHEMESAATHI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SCHEMESAATHI_ADMIN_USERS", str(tmp_path / "users.json"))
    monkeypatch.setenv("SCHEMESAATHI_AUDIT_LOG", str(tmp_path / "audit.jsonl"))
    schemes._load.cache_clear()
    auth.reset_state()
    for username, role in [("ed", "editor"), ("rev", "reviewer"), ("rev2", "reviewer"), ("boss", "admin"), ("view", "viewer")]:
        auth.add_user(username, f"{username.title()} User", role, PASSWORD)
    # Automated checks: no issues unless a test says otherwise (keeps tests independent of cached downloads).
    monkeypatch.setattr(admin, "_automated_check", lambda record: Result())
    yield tmp_path
    schemes._load.cache_clear()
    auth.reset_state()


def login(username):
    r = client.post("/admin/login", json={"username": username, "password": PASSWORD})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def public_ids():
    return [s["scheme_id"] for s in client.get("/schemes").json()["schemes"]]


def record(tmp, scheme_file="ab-pmjay.json"):
    return json.loads((tmp / "schemes" / scheme_file).read_text(encoding="utf-8"))


# ----- sign-in and sessions -----

def test_wrong_password_rejected():
    r = client.post("/admin/login", json={"username": "ed", "password": "wrong-password-123"})
    assert r.status_code == 401 and "Wrong username or password" in r.json()["detail"]


def test_unknown_user_gets_same_message():
    r = client.post("/admin/login", json={"username": "nobody", "password": "whatever-1234"})
    assert r.status_code == 401 and "Wrong username or password" in r.json()["detail"]


def test_lockout_after_repeated_failures():
    for _ in range(auth.MAX_FAILURES):
        client.post("/admin/login", json={"username": "ed", "password": "wrong-password-123"})
    r = client.post("/admin/login", json={"username": "ed", "password": PASSWORD})  # even the right password
    assert r.status_code == 401 and "Too many failed attempts" in r.json()["detail"]


def test_me_and_logout():
    h = login("rev")
    assert client.get("/admin/me", headers=h).json()["role"] == "reviewer"
    client.post("/admin/logout", headers=h)
    assert client.get("/admin/me", headers=h).status_code == 401


@pytest.mark.parametrize("path", ["/admin/me", "/admin/schemes", f"/admin/schemes/{DRAFT}", "/admin/sources", "/admin/audit"])
def test_not_signed_in_is_401(path):  # M1
    assert client.get(path).status_code == 401
    assert client.get(path, headers={"Authorization": "Bearer made-up-token"}).status_code == 401


def test_passwords_stored_only_as_hashes(env):
    text = (env / "users.json").read_text(encoding="utf-8")
    assert PASSWORD not in text and "scrypt$" in text


@pytest.mark.parametrize("args, error", [
    (("x", "X", "editor", "short"), "at least"),
    (("x", "X", "superuser", PASSWORD), "role must be"),
    (("bad name", "X", "editor", PASSWORD), "username"),
    (("ed", "Ed", "editor", PASSWORD), "already exists"),
])
def test_account_validation(args, error):
    with pytest.raises(ValueError, match=error):
        auth.add_user(*args)


def test_unknown_fields_rejected():
    assert client.post("/admin/login", json={"username": "ed", "password": PASSWORD, "role": "admin"}).status_code == 422


# ----- roles (M2, M5) -----

def test_viewer_can_read_but_not_submit():
    h = login("view")
    assert client.get("/admin/schemes", headers=h).status_code == 200
    assert client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=h).status_code == 403


def test_editor_cannot_publish():
    h = login("ed")
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=h)
    assert client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=h).status_code == 403


def test_only_admin_can_unpublish_approve_and_read_audit():
    h = login("rev")
    assert client.post("/admin/schemes/nikshay-poshan-yojana/unpublish", json={"comment": "x"}, headers=h).status_code == 403
    assert client.post("/admin/sources/igich.karnataka.gov.in/approve", headers=h).status_code == 403
    assert client.get("/admin/audit", headers=h).status_code == 403


# ----- review workflow and second-person rule (M3, M5) -----

def test_full_workflow_submit_then_independent_publish(env):
    assert DRAFT not in public_ids()
    assert client.post(f"/admin/schemes/{DRAFT}/submit", json={"comment": "ready"}, headers=login("ed")).json()["status"] == "in_review"
    assert DRAFT not in public_ids()  # in review is still not public
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish", "comment": "checked"}, headers=login("rev"))
    assert r.status_code == 200 and r.json()["status"] == "reviewed"
    rec = record(env)
    assert rec["rules"]["verified"] is True and rec["verification"]["reviewed_by"] == "rev"
    assert [h["action"] for h in rec["verification"]["history"]] == ["submitted", "published"]
    assert DRAFT in public_ids()
    # The verified apply link appears now that the scheme is published and its domain is approved.
    detail = client.get(f"/schemes/{DRAFT}").json()
    assert detail["apply_link"] == "https://beneficiary.nha.gov.in/"
    # Two unconfirmed flags without a public note produce one generic notice, not two copies.
    assert len(detail["notices"]) == len(set(detail["notices"])) == 1


def test_submitter_cannot_review_own_submission():
    h = login("rev")
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=h)
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=h)
    assert r.status_code == 409 and any("Independent review" in b for b in r.json()["detail"]["blockers"])
    assert DRAFT not in public_ids()


def test_preparer_cannot_review(env):
    def set_preparer(d):
        d["verification"]["prepared_by"] = "Rev User"  # display name of 'rev'
    path = env / "schemes" / "ab-pmjay.json"
    data = json.loads(path.read_text(encoding="utf-8")); set_preparer(data); path.write_text(json.dumps(data), encoding="utf-8")
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=login("ed"))
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=login("rev"))
    assert r.status_code == 409 and any("Independent review" in b for b in r.json()["detail"]["blockers"])


def test_cannot_publish_a_draft_that_was_not_submitted():
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=login("rev"))
    assert r.status_code == 409 and any("submitted for review" in b for b in r.json()["detail"]["blockers"])


def test_cannot_submit_twice():
    h = login("ed")
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=h)
    assert client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=h).status_code == 409


def test_return_needs_comment_and_goes_back_to_draft(env):
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=login("ed"))
    h = login("rev")
    assert client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "return"}, headers=h).status_code == 422
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "return", "comment": "Add documents"}, headers=h)
    assert r.json()["status"] == "draft"
    assert record(env)["verification"]["review_comment"] == "Add documents"
    assert DRAFT not in public_ids()


# ----- publishing gate -----

def _submit():
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=login("ed"))


def test_open_exceptions_must_be_acknowledged(monkeypatch):
    monkeypatch.setattr(admin, "_automated_check", lambda r: Result([Issue(NEEDS_ATTENTION, "required documents missing")]))
    _submit()
    h = login("rev")
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=h)
    assert r.status_code == 409 and any("acknowledged" in b for b in r.json()["detail"]["blockers"])
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish", "acknowledge_exceptions": True}, headers=h)
    assert r.status_code == 200


@pytest.mark.parametrize("category", [MISSING_SOURCE, CONFLICTING])
def test_missing_source_or_conflict_blocks_even_when_acknowledged(monkeypatch, category):
    monkeypatch.setattr(admin, "_automated_check", lambda r: Result([Issue(category, "problem")]))
    _submit()
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish", "acknowledge_exceptions": True}, headers=login("rev"))
    assert r.status_code == 409 and DRAFT not in public_ids()


def test_unapproved_source_domain_blocks(env):
    path = env / "approved_sources.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for d in data["domains"]:
        if d["domain"] == "www.pib.gov.in":
            d["status"] = "proposed"
    path.write_text(json.dumps(data), encoding="utf-8")
    schemes._load.cache_clear()
    _submit()
    r = client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish", "acknowledge_exceptions": True}, headers=login("rev"))
    assert r.status_code == 409 and any("not approved" in b for b in r.json()["detail"]["blockers"])


# ----- unpublish, sources, audit (M4) -----

def test_admin_unpublish_hides_scheme(env):
    assert "nikshay-poshan-yojana" in public_ids()
    h = login("boss")
    assert client.post("/admin/schemes/nikshay-poshan-yojana/unpublish", json={}, headers=h).status_code == 422  # reason required
    r = client.post("/admin/schemes/nikshay-poshan-yojana/unpublish", json={"comment": "source changed"}, headers=h)
    assert r.json()["status"] == "draft" and "nikshay-poshan-yojana" not in public_ids()


def test_admin_approves_source_domain(env):
    h = login("boss")
    assert client.post("/admin/sources/igich.karnataka.gov.in/approve", headers=h).json()["status"] == "approved"
    assert client.post("/admin/sources/igich.karnataka.gov.in/approve", headers=h).status_code == 409
    assert client.post("/admin/sources/unknown.gov.in/approve", headers=h).status_code == 404


def test_every_action_is_audited_without_secrets(env):
    client.post(f"/admin/schemes/{DRAFT}/submit", json={"comment": "ready"}, headers=login("ed"))
    client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=login("rev"))
    entries = client.get("/admin/audit", headers=login("boss")).json()["entries"]
    actions = [(e["user"], e["action"], e["target"]) for e in entries]
    assert ("ed", "submit", DRAFT) in actions and ("rev", "publish", DRAFT) in actions
    log = (env / "audit.jsonl").read_text(encoding="utf-8")
    assert PASSWORD not in log and "Bearer" not in log


def _log(env):
    return [json.loads(x) for x in (env / "audit.jsonl").read_text(encoding="utf-8").splitlines()]


def test_failed_and_locked_logins_are_audited_without_passwords(env):
    for _ in range(auth.MAX_FAILURES):
        client.post("/admin/login", json={"username": "ed", "password": "wrong-password-123"})
    client.post("/admin/login", json={"username": "ed", "password": PASSWORD})  # locked
    entries = _log(env)
    assert sum(e["action"] == "login_failed" and e["user"] == "ed" for e in entries) == auth.MAX_FAILURES
    assert any(e["action"] == "login_locked" and e["outcome"] == "failed" for e in entries)
    text = (env / "audit.jsonl").read_text(encoding="utf-8")
    assert "wrong-password-123" not in text and PASSWORD not in text


def test_forbidden_attempt_is_audited(env):
    client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=login("ed"))
    assert any(e["action"] == "forbidden" and e["user"] == "ed" and e["outcome"] == "denied"
               and e["target"].endswith(f"/admin/schemes/{DRAFT}/review") for e in _log(env))


def test_blocked_publish_is_audited_with_reasons(env):
    h = login("rev")
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=h)
    client.post(f"/admin/schemes/{DRAFT}/review", json={"decision": "publish"}, headers=h)  # own submission
    blocked = [e for e in _log(env) if e["action"] == "publish" and e["outcome"] == "blocked"]
    assert blocked and "Independent review" in blocked[0]["comment"]


def test_unknown_user_runs_the_same_password_check(monkeypatch):
    calls = []
    real = auth._password_ok
    monkeypatch.setattr(auth, "_password_ok", lambda pw, stored: calls.append(stored) or real(pw, stored))
    client.post("/admin/login", json={"username": "nobody", "password": "whatever-1234"})
    assert len(calls) == 1 and calls[0].startswith("scrypt$")  # dummy hash checked: no timing difference


def test_admin_list_includes_drafts_with_status():
    rows = {r["scheme_id"]: r for r in client.get("/admin/schemes", headers=login("view")).json()["schemes"]}
    assert rows[DRAFT]["status"] == "draft" and rows["nikshay-poshan-yojana"]["status"] == "reviewed"


def test_detail_says_whether_you_may_review(env):
    client.post(f"/admin/schemes/{DRAFT}/submit", json={}, headers=login("ed"))
    assert client.get(f"/admin/schemes/{DRAFT}", headers=login("ed")).json()["independent_reviewer_ok"] is False
    assert client.get(f"/admin/schemes/{DRAFT}", headers=login("rev2")).json()["independent_reviewer_ok"] is True
