"""Shared test settings."""

import pytest


@pytest.fixture(autouse=True)
def _no_real_ai(monkeypatch):
    """Tests must never call the real (paid) Claude API, even if backend/.env holds a key."""
    monkeypatch.setenv("SCHEMESAATHI_DISABLE_AI", "1")
    from app import chat
    chat._calls.clear()  # reset the chat rate limiter between tests
