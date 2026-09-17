"""CaseFlow Intelligence Service — uvicorn entry point.

Usage:
    uvicorn main:app --app-dir apps/ai --host 127.0.0.1 --port 8001
"""
from .app import app  # noqa: F401
