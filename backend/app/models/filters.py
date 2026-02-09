from pydantic import BaseModel, Field
from typing import List


class FilterOptionsResponse(BaseModel):
    """Response model for filter options endpoint"""
    sae_id: List[str] = Field(
        ...,
        description="Available SAE model identifiers"
    )
    explanation_method: List[str] = Field(
        ...,
        description="Available explanation methods"
    )
    llm_explainer: List[str] = Field(
        ...,
        description="Available LLM explainer models"
    )
    llm_scorer: List[str] = Field(
        ...,
        description="Available LLM scorer models"
    )
