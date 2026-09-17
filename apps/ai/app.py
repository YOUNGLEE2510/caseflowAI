from fastapi import FastAPI
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
app.include_router(classify_router)
app.include_router(similarity_router)
app.include_router(sla_router)
app.include_router(knowledge_router)
