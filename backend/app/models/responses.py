from pydantic import BaseModel, Field
from typing import List, Dict, Optional

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

class HistogramData(BaseModel):
    """Histogram data structure"""
    bins: List[float] = Field(
        ...,
        description="Histogram bin centers"
    )
    counts: List[int] = Field(
        ...,
        description="Count of features in each bin"
    )
    bin_edges: List[float] = Field(
        ...,
        description="Histogram bin edges (length = bins + 1)"
    )

class StatisticsData(BaseModel):
    """Statistical summary data"""
    min: float = Field(..., description="Minimum value")
    max: float = Field(..., description="Maximum value")
    mean: float = Field(..., description="Mean value")
    median: float = Field(..., description="Median value")
    std: float = Field(..., description="Standard deviation")

class GroupedHistogramData(BaseModel):
    """Grouped histogram data for a specific group value"""
    group_value: str = Field(
        ...,
        description="The value for this group (e.g., specific LLM explainer name)"
    )
    histogram: HistogramData = Field(
        ...,
        description="Histogram data for this group"
    )
    statistics: StatisticsData = Field(
        ...,
        description="Statistical summary for this group"
    )
    total_features: int = Field(
        ...,
        description="Total number of features in this group"
    )

class HistogramResponse(BaseModel):
    """Response model for histogram data endpoint"""
    metric: str = Field(
        ...,
        description="The metric analyzed"
    )
    histogram: HistogramData = Field(
        ...,
        description="Histogram data (when not grouped)"
    )
    statistics: StatisticsData = Field(
        ...,
        description="Statistical summary (when not grouped)"
    )
    total_features: int = Field(
        ...,
        description="Total number of features in the filtered dataset"
    )
    grouped_data: Optional[List[GroupedHistogramData]] = Field(
        default=None,
        description="Grouped histogram data when groupBy is specified"
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
    # Legacy n-gram text (kept for backward compatibility)
    max_char_ngram: Optional[str] = Field(
        None,
        description="Most frequent character n-gram (legacy)"
    )
    max_word_ngram: Optional[str] = Field(
        None,
        description="Most frequent word n-gram (legacy)"
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

class FeatureGroup(BaseModel):
    """Single group of features within a threshold range"""
    group_index: int = Field(..., ge=0, description="Group index (0, 1, 2, ...)")
    range_label: str = Field(..., description="Human-readable range label (e.g., '< 0.50', '0.50 - 0.80')")
    feature_ids: Optional[List[int]] = Field(
        default=None,
        description="Feature IDs in this group (used for standard metrics)"
    )
    feature_ids_by_source: Optional[Dict[str, List[int]]] = Field(
        default=None,
        description="Feature IDs grouped by source_min (used for consistency metrics). Key is explainer name or metric name."
    )
    feature_count: int = Field(..., ge=0, description="Total number of unique features in this group")

class FeatureGroupResponse(BaseModel):
    """Response model for feature groups endpoint"""
    metric: str = Field(..., description="Metric used for grouping")
    groups: List[FeatureGroup] = Field(..., description="Feature groups created by threshold ranges")
    total_features: int = Field(..., ge=0, description="Total unique features after filtering")

# Activation Examples Models (Dual N-gram Architecture)

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

class ClusterPair(BaseModel):
    """Single cluster-based feature pair"""
    main_id: int = Field(..., description="First feature ID (smaller)")
    similar_id: int = Field(..., description="Second feature ID (larger)")
    pair_key: str = Field(..., description="Canonical pair key (format: 'main_id-similar_id')")
    cluster_id: int = Field(..., description="Cluster ID this pair belongs to")

class ClusterInfo(BaseModel):
    """Cluster information"""
    cluster_id: int = Field(..., description="Cluster ID")
    feature_ids: List[int] = Field(..., description="Feature IDs in this cluster")
    pair_count: int = Field(..., description="Number of pairs in this cluster")

class FilteringStats(BaseModel):
    """Statistics from the pair filtering process"""
    pairs_before_filtering: int = Field(
        ...,
        description="Number of pairs before filtering was applied"
    )
    pairs_after_filtering: int = Field(
        ...,
        description="Number of pairs after filtering was applied"
    )
    fallback_features: int = Field(
        ...,
        description="Number of features that needed fallback pairs"
    )
    clusters_processed: int = Field(
        ...,
        description="Total number of clusters processed"
    )


class FilteredClusterPairsResponse(BaseModel):
    """Response model for filtered cluster pairs endpoint"""
    pairs: List[ClusterPair] = Field(
        ...,
        description="Filtered pair objects with metadata"
    )
    pair_keys: List[str] = Field(
        ...,
        description="List of filtered pair keys for backward compatibility"
    )
    clusters: List[ClusterInfo] = Field(
        ...,
        description="Cluster information with feature members and pair counts"
    )
    feature_to_cluster: Dict[int, int] = Field(
        ...,
        description="Mapping of ALL feature IDs to their cluster IDs"
    )
    total_clusters: int = Field(
        ...,
        description="Total number of clusters with 2+ features"
    )
    total_pairs: int = Field(
        ...,
        description="Total number of pairs after filtering"
    )
    threshold_used: float = Field(
        ...,
        description="Distance threshold used for clustering"
    )
    truncated: bool = Field(
        default=False,
        description="Whether pair generation was truncated due to limit"
    )
    stats: FilteringStats = Field(
        ...,
        description="Filtering statistics"
    )