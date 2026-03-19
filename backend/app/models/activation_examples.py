from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class ActivationExamplesRequest(BaseModel):
    """Request model for fetching activation examples."""
    feature_ids: List[int]


class CharNgramPosition(BaseModel):
    """Position of a character n-gram within a token"""
    token_position: int = Field(..., description="Token index in the prompt")
    char_offset: int = Field(..., description="Character offset within the normalized token (0-indexed)")


class ActivationPair(BaseModel):
    """Token activation value pair"""
    token_position: int = Field(..., description="Token index in the prompt")
    activation_value: float = Field(..., description="Activation strength at this position")


class NgramPosition(BaseModel):
    """Position of the selected best n-gram (unified format)"""
    token_position: int = Field(..., description="Token index in the prompt")
    char_offset: Optional[int] = Field(None, description="Character offset within the normalized token (None for word n-grams)")


class QuantileExample(BaseModel):
    """Single activation example from a quantile"""
    quantile_index: int = Field(..., ge=0, le=3, description="Quantile group (0-3) based on activation strength")
    prompt_id: int = Field(..., description="Prompt identifier")
    prompt_tokens: List[str] = Field(..., description="Token array with '▁' prefix stripped")
    activation_pairs: List[ActivationPair] = Field(..., description="List of (token_position, activation_value) pairs")
    max_activation: float = Field(..., description="Maximum activation value for this example")
    max_activation_position: int = Field(..., description="Token position of maximum activation")
    ngram_positions: List[NgramPosition] = Field(
        default_factory=list,
        description="List of {token_position, char_offset} where the selected best n-gram appears (unified format)"
    )
    highlights: Optional[Dict[str, List[List[float]]]] = Field(
        None, description="Per-component highlight data: {component: [[position, score], ...]}"
    )


class ActivationExampleData(BaseModel):
    """Activation example data with dual n-gram metrics"""
    quantile_examples: List[QuantileExample] = Field(
        ...,
        description="Pre-organized activation examples (8 total, 2 per quantile)"
    )
    semantic_similarity: Optional[float] = Field(
        default=0.0,
        description="Average pairwise semantic similarity"
    )
    char_ngram_max_jaccard: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Jaccard similarity for the most frequent character n-gram"
    )
    word_ngram_max_jaccard: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Jaccard similarity for the most frequent word n-gram"
    )
    top_char_ngram_text: Optional[str] = Field(
        None,
        description="The actual character n-gram text (legacy, see best_char_ngram_text)"
    )
    top_word_ngram_text: Optional[str] = Field(
        None,
        description="The actual word n-gram text (legacy, see best_word_ngram_text)"
    )
    pattern_type: str = Field(
        ...,
        description="Pattern classification: Semantic, Lexical, Both, or None (uses char OR word Jaccard > 0.3)"
    )
    # Best n-gram text (longest above threshold, pre-computed in step_10)
    best_char_ngram_text: Optional[str] = Field(
        None,
        description="Best character n-gram text (longest above Jaccard threshold)"
    )
    best_word_ngram_text: Optional[str] = Field(
        None,
        description="Best word n-gram text (longest above Jaccard threshold)"
    )


class ActivationExamplesResponse(BaseModel):
    """Response model for activation examples endpoint (dual n-gram architecture)"""
    examples: Dict[int, ActivationExampleData] = Field(
        ...,
        description="Dictionary mapping feature_id to activation example data"
    )
