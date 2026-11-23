"""Local admin accounts and sessions (no external services).

- Accounts live in a JSON file that git ignores (default backend/admin_users.json,
  override with SCHEMESAATHI_ADMIN_USERS). Create them with:  python -m manage_admins add <username>
- Passwords are hashed with scrypt (Python standard library) and a random salt.
- Sessions are random tokens kept in memory for 8 hours; restarting the server signs everyone out.
- Repeated wrong passwords lock the account for 15 minutes.
"""

import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

ROLES = ("viewer", "editor", "reviewer", "admin")
SESSION_SECONDS = 8 * 60 * 60
MAX_FAILURES = 5
LOCKOUT_SECONDS = 15 * 60
MIN_PASSWORD_LENGTH = 12
DEFAULT_USERS_FILE = Path(__file__).resolve().parents[1] / "admin_users.json"

# What each role may do. Higher roles include the lower ones.
PERMISSIONS = {
    "viewer": {"read"},
    "editor": {"read", "submit"},
    "reviewer": {"read", "submit", "review"},
    "admin": {"read", "submit", "review", "approve_sources", "unpublish", "audit"},
}


@dataclass
class User:
    username: str
    display_name: str
    role: str

    def can(self, permission: str) -> bool:
        return permission in PERMISSIONS.get(self.role, set())


def users_file() -> Path:
    return Path(os.environ.get("SCHEMESAATHI_ADMIN_USERS", DEFAULT_USERS_FILE))


def _load() -> dict:
    path = users_file()
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"users": {}}


def _save(data: dict) -> None:
    path = users_file()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _password_ok(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    candidate = hash_password(password, bytes.fromhex(salt_hex)).split("$")[2]
    return hmac.compare_digest(candidate, digest_hex)


def add_user(username: str, display_name: str, role: str, password: str) -> None:
    if role not in ROLES:
        raise ValueError(f"role must be one of {', '.join(ROLES)}")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if not username.isidentifier():
        raise ValueError("username must be letters, digits or underscores")
    data = _load()
    if username in data["users"]:
        raise ValueError("user already exists")
    data["users"][username] = {"display_name": display_name, "role": role, "password": hash_password(password)}
    _save(data)


def remove_user(username: str) -> bool:
    data = _load()
    if data["users"].pop(username, None) is None:
        return False
    _save(data)
    return True


def list_users() -> list[User]:
    return [User(u, v["display_name"], v["role"]) for u, v in sorted(_load()["users"].items())]


# ----- sessions (in memory) -----

_sessions: dict[str, tuple[str, float]] = {}  # token -> (username, expires_at)
_failures: dict[str, list[float]] = {}  # username -> recent failure times


class LoginError(Exception):
    def __init__(self, message: str, locked: bool = False):
        super().__init__(message)
        self.locked = locked


_dummy_hash: str | None = None


def _dummy() -> str:
    """A fixed hash checked for unknown usernames, so every failed login takes the same time."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_urlsafe(16))
    return _dummy_hash


def login(username: str, password: str) -> tuple[str, User]:
    now = time.time()
    recent = [t for t in _failures.get(username, []) if now - t < LOCKOUT_SECONDS]
    if len(recent) >= MAX_FAILURES:
        raise LoginError("Too many failed attempts. Try again in 15 minutes.", locked=True)
    if len(_failures) > 1000:  # many different usernames tried: drop expired records
        prune_failures()
    record = _load()["users"].get(username)
    # Always run the slow hash check (against a dummy for unknown users) to prevent username discovery by timing.
    password_ok = _password_ok(password, record["password"] if record else _dummy())
    if record is None or not password_ok:
        _failures[username] = recent + [now]
        raise LoginError("Wrong username or password.")
    _failures.pop(username, None)
    token = secrets.token_urlsafe(32)
    _sessions[token] = (username, now + SESSION_SECONDS)
    return token, User(username, record["display_name"], record["role"])


def user_for_token(token: str) -> User | None:
    entry = _sessions.get(token)
    if entry is None:
        return None
    username, expires = entry
    record = _load()["users"].get(username)
    if time.time() > expires or record is None:  # expired, or account removed
        _sessions.pop(token, None)
        return None
    return User(username, record["display_name"], record["role"])


def logout(token: str) -> None:
    _sessions.pop(token, None)


def reset_state() -> None:
    """For tests only."""
    _sessions.clear()
    _failures.clear()


def prune_failures() -> None:
    """Drop failure records older than the lockout window (keeps memory bounded)."""
    now = time.time()
    for name in list(_failures):
        _failures[name] = [t for t in _failures[name] if now - t < LOCKOUT_SECONDS]
        if not _failures[name]:
            del _failures[name]
