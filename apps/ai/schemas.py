from typing import Literal
from pydantic import BaseModel, Field

class TextRequest(BaseModel):
    text: str = Field(min_length=3, max_length=5_000)


class SimilarItem(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(max_length=200)
    text: str = Field(max_length=6000)


class SimilarityRequest(TextRequest):
    items: list[SimilarItem] = Field(max_length=100)
    threshold: float = Field(default=0.28, ge=0, le=1)


class SlaRequest(BaseModel):
    elapsedHours: float = Field(ge=0, allow_inf_nan=False)
    dueHours: float = Field(allow_inf_nan=False)
    transfers: int = Field(ge=0)
    workload: int = Field(ge=0)
    remainingSteps: int = Field(ge=0)
    priority: Literal["low", "normal", "high", "urgent"]


class KnowledgeArticle(BaseModel):
    id: str
    title: str
    content: str = Field(max_length=50_000)
    category: str
    sourceLabel: str


class KnowledgeRequest(BaseModel):
    query: str = Field(min_length=3, max_length=1_000)
    articles: list[KnowledgeArticle] = Field(max_length=50)
    topK: int = Field(default=4, ge=1, le=10)

