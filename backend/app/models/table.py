from pydantic import BaseModel, Field
from typing import List, Dict, Optional

from .common import Filters


class TableDataRequest(BaseModel):
    """Request model for table visualization data endpoint"""
    filters: Filters = Field(
        default_factory=lambda: Filters(),
        description="Filter criteria for data subset"
    )


class InterFeatureSimilarityInfo(BaseModel):
    """Model for inter-feature activation similarity information"""
    pattern_type: str = Field(
        ...,
        description="Pattern type: Semantic, Lexical, Both, or None"
    )
    semantic_similarity: Optional[float] = Field(
        None,
        ge=-1.0,
        le=1.0,
        description="Semantic similarity score (activation embeddings)"
    )
    char_jaccard: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Character n-gram Jaccard similarity"
    )
    word_jaccard: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Word n-gram Jaccard similarity"
    )
    # Unified best n-gram fields (word preferred over char)
    best_ngram_type: Optional[str] = Field(
        None,
        description="Type of best n-gram: 'word' or 'char'"
    )
    best_ngram_text: Optional[str] = Field(
        None,
        description="Best n-gram text (word preferred over char)"
    )
    main_ngram_positions: Optional[List[Dict]] = Field(
        None,
        description="N-gram positions in main feature"
    )
    similar_ngram_positions: Optional[List[Dict]] = Field(
        None,
        description="N-gram positions in similar feature"
    )


class DecoderSimilarFeature(BaseModel):
    """Model for a single similar decoder feature"""
    feature_id: int = Field(
        ...,
        ge=0,
        description="Similar feature ID"
    )
    cosine_similarity: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Cosine similarity with the source feature"
    )
    inter_feature_similarity: Optional[InterFeatureSimilarityInfo] = Field(
        None,
        description="Inter-feature activation similarity pattern information"
    )


class ScorerScoreSet(BaseModel):
    """Score set for each scorer (s1, s2, s3)"""
    s1: Optional[float] = Field(None, description="Score for scorer 1")
    s2: Optional[float] = Field(None, description="Score for scorer 2")
    s3: Optional[float] = Field(None, description="Score for scorer 3")


class HighlightSegment(BaseModel):
    """
    A single text segment with optional syntax highlighting.

    Used for displaying explanation text with visual highlights showing
    alignment between different LLM explainers.
    """
    text: str = Field(..., description="The text content of this segment")
    highlight: bool = Field(False, description="Whether this segment should be highlighted")
    color: Optional[str] = Field(None, description="Color for exact matches (green gradient)")
    style: Optional[str] = Field(None, description="Style for semantic matches ('bold')")
    metadata: Optional[Dict] = Field(
        None,
        description="Additional metadata: match_type ('exact'|'semantic'), similarity, ngram_length, shared_with (explainer indices)"
    )


class HighlightedExplanation(BaseModel):
    """
    Complete highlighted explanation with all text segments.

    Represents an explanation broken into segments, where some segments
    are highlighted to show alignment with other LLM explanations.
    """
    segments: List[HighlightSegment] = Field(..., description="List of text segments with highlight information")


class ExplainerScoreData(BaseModel):
    """Scores for a single explainer (embedding + fuzz/detection per scorer)"""
    embedding: Optional[float] = Field(None, description="Embedding score for this explainer")
    quality_score: Optional[float] = Field(None, description="Quality score (mean of embedding, fuzz, detection) for this explainer")
    fuzz: ScorerScoreSet = Field(..., description="Fuzz scores for each scorer (s1, s2, s3)")
    detection: ScorerScoreSet = Field(..., description="Detection scores for each scorer (s1, s2, s3)")
    explanation_text: Optional[str] = Field(None, description="Explanation text for this explainer")
    highlighted_explanation: Optional[HighlightedExplanation] = Field(
        None,
        description="Highlighted explanation with syntax highlighting showing alignment across LLM explainers"
    )
    semantic_similarity: Optional[Dict[str, float]] = Field(
        None,
        description="Pairwise cosine similarity to other explainers. Key: other explainer name (e.g., 'qwen', 'openai'), Value: cosine similarity (0-1)"
    )


class FeatureTableRow(BaseModel):
    """Single feature row with scores for all explainers"""
    feature_id: int = Field(..., ge=0, description="Feature ID")
    decoder_similarity: Optional[List[DecoderSimilarFeature]] = Field(
        None,
        description="List of top 10 most similar decoder features (sorted descending by cosine_similarity)"
    )
    decoder_similarity_merge_threshold: Optional[float] = Field(
        None,
        description="Merge threshold value for decoder similarity (aggregate metric for grouping/filtering)"
    )
    intra_feature_sim: Optional[float] = Field(
        None,
        description="Intra-feature similarity: max(intra_ngram_jaccard, intra_semantic_sim) from svm_feature_metrics"
    )
    explainers: Dict[str, ExplainerScoreData] = Field(
        ...,
        description="Scores for each explainer (llama, qwen, openai)"
    )


class MetricNormalizationStats(BaseModel):
    """Global normalization statistics for a metric (used for min-max normalization)"""
    min: float = Field(..., description="Global minimum value")
    max: float = Field(..., description="Global maximum value")


class FeatureTableDataResponse(BaseModel):
    """Response model for feature-level table visualization data (824 rows)"""
    features: List[FeatureTableRow] = Field(..., description="Feature-level rows (one per feature_id)")
    total_features: int = Field(..., ge=0, description="Total number of features")
    explainer_ids: List[str] = Field(..., description="List of explainer IDs present in data")
    scorer_ids: List[str] = Field(..., description="List of scorer IDs present in data (for S1, S2, S3 labels)")
    global_stats: Dict[str, MetricNormalizationStats] = Field(..., description="Global normalization statistics for each metric (embedding, fuzz, detection)")
