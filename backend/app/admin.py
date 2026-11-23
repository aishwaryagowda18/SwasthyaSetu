"""Admin API: review and publish scheme records.

Workflow:  draft --submit (editor)--> in_review --publish (reviewer)--> reviewed (public)
                                                \--return (reviewer)--> draft
           reviewed --unpublish (admin)--> draft

Rules enforced on the server:
  - Independent second-person review: the reviewer cannot be anyone who prepared or submitted it.
  - Publishing gate: approved source domains, sources checked within 180 days, no missing sources
    or conflicting information, and open exceptions must be explicitly acknowledged.
  - Every action is written to the audit log.
"""

import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app import auth, schemes
from app.verification import CONFLICTING, MISSING_SOURCE, check_record

router = APIRouter(prefix="/admin", tags=["admin"])
DEFAULT_AUDIT_LOG = Path(__file__).resolve().parents[1] / "admin_audit_log.jsonl"


# ----- request / response shapes -----

class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class SubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    comment: str = Field(default="", max_length=1000)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["publish", "return"]
    comment: str = Field(default="", max_length=1000)
    acknowledge_exceptions: bool = False


class UnpublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    comment: str = Field(min_length=1, max_length=1000)


# ----- helpers -----

def current_user(authorization: str = Header(default="")) -> auth.User:
    token = authorization.removeprefix("Bearer ").strip()
    user = auth.user_for_token(token) if token else None
    if user is None:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return user


def require(permission: str):
    def check(request: Request, user: auth.User = Depends(current_user)) -> auth.User:
        if not user.can(permission):
            _audit(user, "forbidden", f"{request.method} {request.url.path}", f"role lacks '{permission}'", outcome="denied")
            raise HTTPException(status_code=403, detail="Your role does not allow this action.")
        return user
    return check


def _audit(user: "auth.User | str", action: str, target: str, comment: str = "", outcome: str = "success") -> None:
    """Append one audit entry. Never pass passwords or tokens here."""
    path = Path(os.environ.get("SCHEMESAATHI_AUDIT_LOG", DEFAULT_AUDIT_LOG))
    username, role = (user.username, user.role) if isinstance(user, auth.User) else (str(user)[:64], "-")
    entry = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "user": username,
             "role": role, "action": action, "target": target, "outcome": outcome, "comment": comment}
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def _blocked(user: auth.User, action: str, target: str, message: str, blockers: list[str] | None = None):
    """Audit a refused action, then refuse it with 409."""
    _audit(user, action, target, "; ".join(blockers) if blockers else message, outcome="blocked")
    raise HTTPException(status_code=409, detail={"message": message, "blockers": blockers} if blockers else message)


def _record_paths() -> dict[str, Path]:
    out = {}
    for p in sorted((schemes.data_dir() / "schemes").glob("*.json")):
        out[json.loads(p.read_text(encoding="utf-8"))["scheme_id"]] = p
    return out


def _load_record(scheme_id: str) -> tuple[Path, dict]:
    path = _record_paths().get(scheme_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return path, json.loads(path.read_text(encoding="utf-8"))


def _save_record(path: Path, record: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)
    schemes._load.cache_clear()  # public API sees the change immediately


def _approved() -> dict[str, str]:
    return schemes.load_all()[1]


def _automated_check(record: dict):
    """Run the bulk-verification checks using cached source copies (no network)."""
    from verify_schemes import fetch, to_doc  # local import: tooling module
    docs = {s["id"]: to_doc(*fetch(s["url"], offline=True)) for s in record.get("sources", [])}
    return check_record(record, _approved(), docs, date.today())


def _editors(record: dict) -> set[str]:
    v = record.get("verification", {})
    return {x for x in [v.get("prepared_by"), v.get("submitted_by"), *v.get("edited_by", [])] if x}


def _history(record: dict, user: auth.User, action: str, comment: str) -> None:
    record["verification"].setdefault("history", []).append(
        {"action": action, "by": user.username, "at": date.today().isoformat(), "comment": comment})


def publish_blockers(record: dict, reviewer: auth.User, acknowledged: bool) -> list[str]:
    v = record.get("verification", {})
    blockers = []
    if v.get("status") != "in_review":
        blockers.append("Only schemes submitted for review can be published.")
    if reviewer.username in _editors(record) or reviewer.display_name in _editors(record):
        blockers.append("Independent review required: you prepared or submitted this scheme.")
    approved = _approved()
    for src in record.get("sources", []):
        domain = urlparse(src.get("url", "")).hostname or ""
        if approved.get(domain) != "approved":
            blockers.append(f"Source domain {domain} is not approved.")
        try:
            if (date.today() - date.fromisoformat(src["checked_at"])).days > schemes.MAX_SOURCE_AGE_DAYS:
                blockers.append(f"Source {src['id']} was checked more than 180 days ago.")
        except (KeyError, ValueError):
            blockers.append(f"Source {src.get('id')} has no valid check date.")
    result = _automated_check(record)
    for issue in result.issues:
        if issue.exception and issue.category in (MISSING_SOURCE, CONFLICTING):
            blockers.append(f"{issue.category}: {issue.message}")
    open_exceptions = [i for i in result.issues if i.exception and i.category not in (MISSING_SOURCE, CONFLICTING)]
    if open_exceptions and not acknowledged:
        blockers.append(f"{len(open_exceptions)} open exception(s) must be checked and acknowledged before publishing.")
    return blockers


def _row(record: dict) -> dict:
    v = record.get("verification", {})
    result = _automated_check(record)
    return {
        "scheme_id": record["scheme_id"], "name": record["name"], "level": record.get("level"),
        "state": record.get("state"), "status": v.get("status", "draft"),
        "prepared_by": v.get("prepared_by"), "submitted_by": v.get("submitted_by"),
        "reviewed_by": v.get("reviewed_by"), "check_category": result.category,
        "exceptions": [i.message for i in result.issues if i.exception],
    }


# ----- routes -----

@router.post("/login")
def admin_login(body: LoginRequest) -> dict:
    try:
        token, user = auth.login(body.username, body.password)
    except auth.LoginError as exc:
        _audit(body.username, "login_locked" if exc.locked else "login_failed", "-", outcome="failed")
        raise HTTPException(status_code=401, detail=str(exc))
    _audit(user, "login", "-")
    return {"token": token, "user": {"username": user.username, "display_name": user.display_name, "role": user.role}}


@router.post("/logout")
def admin_logout(authorization: str = Header(default=""), user: auth.User = Depends(current_user)) -> dict:
    auth.logout(authorization.removeprefix("Bearer ").strip())
    _audit(user, "logout", "-")
    return {"ok": True}


@router.get("/me")
def admin_me(user: auth.User = Depends(current_user)) -> dict:
    return {"username": user.username, "display_name": user.display_name, "role": user.role,
            "permissions": sorted(auth.PERMISSIONS[user.role])}


@router.get("/schemes")
def admin_list(user: auth.User = Depends(require("read"))) -> dict:
    return {"schemes": [_row(json.loads(p.read_text(encoding="utf-8"))) for p in _record_paths().values()]}


@router.get("/schemes/{scheme_id}")
def admin_detail(scheme_id: str, user: auth.User = Depends(require("read"))) -> dict:
    _, record = _load_record(scheme_id)
    result = _automated_check(record)
    return {
        "record": record,
        "check_category": result.category,
        "issues": [{"category": i.category, "message": i.message, "exception": i.exception} for i in result.issues],
        "independent_reviewer_ok": user.username not in _editors(record) and user.display_name not in _editors(record),
    }


@router.post("/schemes/{scheme_id}/submit")
def admin_submit(scheme_id: str, body: SubmitRequest, user: auth.User = Depends(require("submit"))) -> dict:
    path, record = _load_record(scheme_id)
    v = record["verification"]
    if v.get("status") != "draft":
        _blocked(user, "submit", scheme_id, "Only drafts can be submitted for review.")
    v.update(status="in_review", submitted_by=user.username, submitted_at=date.today().isoformat())
    _history(record, user, "submitted", body.comment)
    _save_record(path, record)
    _audit(user, "submit", scheme_id, body.comment)
    return {"status": "in_review"}


@router.post("/schemes/{scheme_id}/review")
def admin_review(scheme_id: str, body: ReviewRequest, user: auth.User = Depends(require("review"))) -> dict:
    path, record = _load_record(scheme_id)
    v = record["verification"]
    if body.decision == "return":
        if v.get("status") != "in_review":
            _blocked(user, "return", scheme_id, "Only schemes in review can be returned.")
        if not body.comment.strip():
            raise HTTPException(status_code=422, detail="Please explain what needs to change.")
        v.update(status="draft", review_comment=body.comment)
        _history(record, user, "returned", body.comment)
        _save_record(path, record)
        _audit(user, "return", scheme_id, body.comment)
        return {"status": "draft"}

    blockers = publish_blockers(record, user, body.acknowledge_exceptions)
    if blockers:
        _blocked(user, "publish", scheme_id, "Cannot publish yet.", blockers)
    v.update(status="reviewed", reviewed_by=user.username, reviewed_at=date.today().isoformat(),
             review_comment=body.comment)
    record["rules"]["verified"] = True
    _history(record, user, "published", body.comment)
    _save_record(path, record)
    _audit(user, "publish", scheme_id, body.comment)
    return {"status": "reviewed"}


@router.post("/schemes/{scheme_id}/unpublish")
def admin_unpublish(scheme_id: str, body: UnpublishRequest, user: auth.User = Depends(require("unpublish"))) -> dict:
    path, record = _load_record(scheme_id)
    v = record["verification"]
    if v.get("status") != "reviewed":
        _blocked(user, "unpublish", scheme_id, "Only published schemes can be unpublished.")
    v.update(status="draft")
    record["rules"]["verified"] = False
    _history(record, user, "unpublished", body.comment)
    _save_record(path, record)
    _audit(user, "unpublish", scheme_id, body.comment)
    return {"status": "draft"}


@router.get("/sources")
def admin_sources(user: auth.User = Depends(require("read"))) -> dict:
    data = json.loads((schemes.data_dir() / "approved_sources.json").read_text(encoding="utf-8"))
    return {"domains": data["domains"]}


@router.post("/sources/{domain}/approve")
def admin_approve_source(domain: str, user: auth.User = Depends(require("approve_sources"))) -> dict:
    path = schemes.data_dir() / "approved_sources.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    entry = next((d for d in data["domains"] if d["domain"] == domain), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    if entry["status"] == "approved":
        _blocked(user, "approve_source", domain, "Domain is already approved.")
    entry.update(status="approved", approved_by=user.username, approved_at=date.today().isoformat())
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)
    schemes._load.cache_clear()
    _audit(user, "approve_source", domain)
    return {"status": "approved"}


@router.get("/audit")
def admin_audit(user: auth.User = Depends(require("audit"))) -> dict:
    path = Path(os.environ.get("SCHEMESAATHI_AUDIT_LOG", DEFAULT_AUDIT_LOG))
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    return {"entries": [json.loads(x) for x in lines[-200:]][::-1]}
