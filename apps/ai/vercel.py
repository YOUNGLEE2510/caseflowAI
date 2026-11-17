"""Vercel entrypoint: writable model cache stays in ephemeral /tmp storage."""
import os

os.environ.setdefault("MODEL_DIR", "/tmp/caseflow-models")
os.environ.setdefault("MODEL_REGISTRY_DIR", "/tmp/caseflow-models/registry")

from .app import app  # noqa: E402,F401
