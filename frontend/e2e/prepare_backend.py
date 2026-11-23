"""Prepare a throwaway copy of the data and test admin accounts for end-to-end tests.

The real data/ folder and real admin accounts are never modified by e2e tests.
Run by playwright.config.ts before the backend starts.
"""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "test-results" / "e2e-backend"  # git-ignored

sys.path.insert(0, str(ROOT / "backend"))
import os  # noqa: E402

os.environ["SCHEMESAATHI_ADMIN_USERS"] = str(OUT / "users.json")
from app import auth  # noqa: E402

TEST_PASSWORD = "e2e-test-password-123"  # test accounts only, in a throwaway folder

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "data" / "schemes").mkdir(parents=True)
for p in (ROOT / "data" / "schemes").glob("*.json"):
    shutil.copy(p, OUT / "data" / "schemes")
shutil.copy(ROOT / "data" / "approved_sources.json", OUT / "data")
for username, name, role in [("e2e_editor", "E2E Editor", "editor"), ("e2e_reviewer", "E2E Reviewer", "reviewer")]:
    auth.add_user(username, name, role, TEST_PASSWORD)
print(f"e2e backend data prepared in {OUT}")
