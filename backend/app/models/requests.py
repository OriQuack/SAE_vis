from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Union
from .common import Filters, Thresholds, MetricType, HierarchicalThresholds

class HistogramRequest(BaseModel):
    """Request model for histogram data endpoint"""
    filters: Filters = Field(
        ...,
        description="Filter criteria for data subset"
    )
    metric: MetricType = Field(
        ...,
        description="Metric name to analyze for histogram"
    )
    bins: Optional[int] = Field(
        default=20,
        ge=5,
        le=100,
        description="Number of histogram bins"
    )

class SankeyRequest(BaseModel):
    """Request model for Sankey diagram data endpoint"""
    filters: Filters = Field(
        ...,
        description="Filter criteria for data subset"
    )
    thresholds: Thresholds = Field(
        ...,
        description="Threshold values for categorization"
    )
    nodeThresholds: Optional[Dict[str, Dict[str, float]]] = Field(
        default=None,
        description="Legacy node-specific threshold overrides by nodeId and metric (for backward compatibility)"
    )
    hierarchicalThresholds: Optional[HierarchicalThresholds] = Field(
        default=None,
        description="New hierarchical threshold system supporting parent-based grouping"
    )

    @validator('hierarchicalThresholds', pre=True, always=True)
    def set_hierarchical_thresholds(cls, v, values):
        """Auto-generate hierarchical thresholds from legacy fields if not provided"""
        if v is None and 'thresholds' in values:
            # Convert legacy format to hierarchical format
            global_thresholds = values['thresholds']
            node_thresholds = values.get('nodeThresholds')

            # Initialize hierarchical structure
            hierarchical = HierarchicalThresholds(global_thresholds=global_thresholds)

            if node_thresholds:
                # Convert legacy nodeThresholds to hierarchical format
                semantic_distance_groups = {}
                score_agreement_groups = {}

                for node_id, metrics in node_thresholds.items():
                    # Handle semantic distance nodes
                    if "_semdist_" in node_id and "_agree_" not in node_id:
                        # Extract splitting parent (e.g., "split_true_semdist_high" -> "split_true")
                        splitting_parent = node_id.split("_semdist_")[0]
                        if "semdist_mean" in metrics:
                            semantic_distance_groups[splitting_parent] = metrics["semdist_mean"]

                    # Handle score agreement nodes
                    elif "_agree_" in node_id:
                        # Extract semantic distance parent (e.g., "split_true_semdist_high_agree_all" -> "split_true_semdist_high")
                        semantic_parent = "_".join(node_id.split("_")[:-2])
                        score_metrics = {}
                        for score_type in ["score_fuzz", "score_simulation", "score_detection"]:
                            if score_type in metrics:
                                score_metrics[score_type] = metrics[score_type]
                        if score_metrics:
                            score_agreement_groups[semantic_parent] = score_metrics

                # Set hierarchical groups if any were found
                if semantic_distance_groups:
                    hierarchical.semantic_distance_groups = semantic_distance_groups
                if score_agreement_groups:
                    hierarchical.score_agreement_groups = score_agreement_groups

            return hierarchical

        return v

class ComparisonRequest(BaseModel):
    """Request model for comparison/alluvial diagram data endpoint"""
    sankey_left: SankeyRequest = Field(
        ...,
        description="Configuration for left Sankey diagram"
    )
    sankey_right: SankeyRequest = Field(
        ...,
        description="Configuration for right Sankey diagram"
    )

    @validator('sankey_right')
    def validate_different_configs(cls, v, values):
        """Ensure the two Sankey configurations are actually different"""
        if 'sankey_left' in values:
            left_config = values['sankey_left']
            if left_config.filters == v.filters and left_config.thresholds == v.thresholds:
                raise ValueError("Left and right Sankey configurations must be different")
        return v