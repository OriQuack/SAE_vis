from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class FilteredClusterPairsRequest(BaseModel):
    """Request model for getting filtered cluster-based pairs"""
    feature_ids: List[int] = Field(
        ...,
        description="List of feature IDs from selected segment"
    )
    threshold: Optional[float] = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Distance threshold for cutting dendrogram (0-1, higher=fewer clusters)"
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
