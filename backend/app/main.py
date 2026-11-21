"""SchemeSaathi API - backend entry point.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI

APP_VERSION = "0.1.0"
SERVICE_NAME = "schemesaathi-api"

app = FastAPI(
    title="SchemeSaathi API",
    version=APP_VERSION,
    description=(
        "Backend for SchemeSaathi, a helper for Indian public health schemes. "
        "This is not an official government service. Always confirm details on the "
        "official scheme portal before applying."
    ),
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Report that the service is running. Used by tests and monitoring."""
    return {"status": "ok", "service": SERVICE_NAME, "version": APP_VERSION}
