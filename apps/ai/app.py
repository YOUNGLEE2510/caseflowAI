from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
import os
import hmac
from .routers.health import router as health_router
from .routers.classify import router as classify_router
from .routers.similarity import router as similarity_router
from .routers.sla import router as sla_router
from .routers.knowledge import router as knowledge_router

app = FastAPI(
    title="CaseFlow Intelligence Service",
    version="0.1.0",
    description="Vietnamese intake classification, similarity, retrieval and SLA risk baselines.",
)

app.include_router(health_router)
@app.middleware("http")
async def internal_auth(request: Request, call_next):
    token = os.environ.get("AI_INTERNAL_TOKEN", "")
    if request.url.path != "/health" and token:
        supplied = request.headers.get("X-Internal-Token", "")
        if not hmac.compare_digest(supplied.encode(), token.encode()):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

app.include_router(classify_router)
app.include_router(similarity_router)
app.include_router(sla_router)
app.include_router(knowledge_router)
