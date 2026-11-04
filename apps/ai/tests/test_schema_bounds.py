import pytest
from pydantic import ValidationError
from apps.ai.schemas import SimilarityRequest


def test_similarity_candidate_bounds():
    item = {"id": "case", "title": "Example", "text": "Content"}
    with pytest.raises(ValidationError):
        SimilarityRequest(text="example", items=[item] * 101)
    with pytest.raises(ValidationError):
        SimilarityRequest(text="example", items=[{**item, "text": "x" * 6001}])


def test_similarity_accepts_bounded_input():
    assert len(SimilarityRequest(text="example", items=[{"id": "1", "title": "Title", "text": "Content"}]).items) == 1
