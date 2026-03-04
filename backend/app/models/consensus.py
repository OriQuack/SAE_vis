from pydantic import BaseModel
from typing import List, Optional


class FeatureConsensusRequest(BaseModel):
    """Request for feature consensus data."""
    feature_id: int


class ClusterPhrase(BaseModel):
    """Single phrase within a cluster."""
    text: str
    explainer: str
    phrase_weight: float
    quality_score: Optional[float] = None
    distance_to_medoid: float
    activation_similarity: float
    start_char: Optional[int] = None
    end_char: Optional[int] = None


class ConsensusItem(BaseModel):
    """Single item in consensus results (medoid or outlier)."""
    cluster_id: int
    phrase: str
    explainer: str
    activation_similarity: float
    quality_score: Optional[float] = None
    avg_quality_score: Optional[float] = None
    is_outlier: bool
    phrase_weight: Optional[float] = None
    start_char: Optional[int] = None
    end_char: Optional[int] = None
    cluster_size: Optional[int] = None
    cluster_score: Optional[float] = None
    cluster_coherence: Optional[float] = None
    cluster_phrases: Optional[List[ClusterPhrase]] = None


class FeatureConsensusResponse(BaseModel):
    """Response containing consensus data for a feature."""
    feature_id: int
    consensus_score: float
    num_clusters: int
    num_outliers: int
    items: List[ConsensusItem]
