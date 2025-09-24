from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class MetricType(str, Enum):
    """Supported metric types for histogram analysis"""
    FEATURE_SPLITTING = "feature_splitting"
    SEMDIST_MEAN = "semdist_mean"
    SEMDIST_MAX = "semdist_max"
    SCORE_FUZZ = "score_fuzz"
    SCORE_SIMULATION = "score_simulation"
    SCORE_DETECTION = "score_detection"
    SCORE_EMBEDDING = "score_embedding"

class CategoryType(str, Enum):
    """Node category types for Sankey diagrams"""
    ROOT = "root"
    FEATURE_SPLITTING = "feature_splitting"
    SEMANTIC_DISTANCE = "semantic_distance"
    SCORE_AGREEMENT = "score_agreement"

class ErrorResponse(BaseModel):
    """Standard error response format"""
    error: Dict[str, Any] = Field(
        ...,
        description="Error information",
        example={
            "code": "INVALID_FILTERS",
            "message": "One or more filter values are invalid",
            "details": {"invalid_fields": ["sae_id"]}
        }
    )

class Filters(BaseModel):
    """Common filter structure used across endpoints"""
    sae_id: Optional[List[str]] = Field(
        default=None,
        description="SAE model identifiers to filter by",
        example=["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"]
    )
    explanation_method: Optional[List[str]] = Field(
        default=None,
        description="Explanation methods to filter by",
        example=["quantiles", "top-act"]
    )
    llm_explainer: Optional[List[str]] = Field(
        default=None,
        description="LLM explainer models to filter by",
        example=["claude-3-opus"]
    )
    llm_scorer: Optional[List[str]] = Field(
        default=None,
        description="LLM scorer models to filter by",
        example=["gpt-4-turbo"]
    )

class Thresholds(BaseModel):
    """Threshold configuration for Sankey diagram generation"""
    feature_splitting: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Threshold for feature splitting classification (cosine similarity magnitude, typically 1e-5 to 1e-4)",
        example=0.00002
    )
    semdist_mean: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Threshold for semantic distance classification",
        example=0.15
    )
    score_high: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Threshold for 'high' score classification",
        example=0.8
    )

class ThresholdGroup(str, Enum):
    """Types of threshold groups for hierarchical management"""
    SEMANTIC_DISTANCE = "semantic_distance"  # Groups semantic distance nodes by splitting parent
    SCORE_AGREEMENT = "score_agreement"      # Groups score agreement nodes by semantic distance parent

class HierarchicalThresholds(BaseModel):
    """Hierarchical threshold configuration supporting parent-based grouping"""
    global_thresholds: Thresholds = Field(
        ...,
        description="Global threshold values used as defaults"
    )

    # Feature splitting threshold groups: can be customized by different conditions
    # Key format: "condition" -> feature splitting threshold for that condition
    feature_splitting_groups: Optional[Dict[str, float]] = Field(
        default=None,
        description="Feature splitting thresholds for different groupings",
        example={
            "default": 0.00002,
            "high_confidence": 0.00001
        }
    )

    # Semantic distance threshold groups: grouped by splitting parent
    # Key format: "split_{true/false}" -> all semantic distance nodes under this splitting parent
    semantic_distance_groups: Optional[Dict[str, float]] = Field(
        default=None,
        description="Semantic distance thresholds grouped by splitting parent",
        example={
            "split_true": 0.15,
            "split_false": 0.20
        }
    )

    # Score agreement threshold groups: grouped by semantic distance parent
    # Key format: "split_{true/false}_semdist_{high/low}" -> all score nodes under this semantic distance parent
    score_agreement_groups: Optional[Dict[str, Dict[str, float]]] = Field(
        default=None,
        description="Score thresholds grouped by semantic distance parent",
        example={
            "split_true_semdist_high": {
                "score_fuzz": 0.8,
                "score_simulation": 0.8,
                "score_detection": 0.8
            },
            "split_true_semdist_low": {
                "score_fuzz": 0.7,
                "score_simulation": 0.7,
                "score_detection": 0.7
            }
        }
    )

    # Individual node threshold overrides
    # Key format: "node_{nodeId}" -> threshold values for specific individual nodes
    individual_node_groups: Optional[Dict[str, Dict[str, float]]] = Field(
        default=None,
        description="Individual node threshold overrides",
        example={
            "node_split_true_semdist_high": {
                "semdist_mean": 0.25
            },
            "node_split_true_semdist_high_agree_all": {
                "score_fuzz": 0.9,
                "score_simulation": 0.85
            }
        }
    )

    def get_feature_splitting_threshold(self, condition: str = "default") -> float:
        """Get feature splitting threshold for a given condition (cosine similarity scale)"""
        if self.feature_splitting_groups and condition in self.feature_splitting_groups:
            return self.feature_splitting_groups[condition]
        return self.global_thresholds.feature_splitting

    def get_semdist_threshold_for_node(self, node_id: str) -> float:
        """Get semantic distance threshold for a node based on its parent grouping"""
        # First check for individual node override
        individual_group_id = f"node_{node_id}"
        if (self.individual_node_groups and
            individual_group_id in self.individual_node_groups and
            "semdist_mean" in self.individual_node_groups[individual_group_id]):
            return self.individual_node_groups[individual_group_id]["semdist_mean"]

        # Extract splitting parent from node_id (e.g., "split_true_semdist_high" -> "split_true")
        if "_semdist_" in node_id:
            splitting_parent = node_id.split("_semdist_")[0]  # e.g., "split_true"
            if self.semantic_distance_groups and splitting_parent in self.semantic_distance_groups:
                return self.semantic_distance_groups[splitting_parent]

        return self.global_thresholds.semdist_mean

    def get_score_thresholds_for_node(self, node_id: str) -> Dict[str, float]:
        """Get score thresholds for a node based on its parent grouping"""
        # Default to global score_high for all score types
        default_score = self.global_thresholds.score_high
        result = {
            "score_fuzz": default_score,
            "score_simulation": default_score,
            "score_detection": default_score
        }

        # Extract semantic distance parent from node_id (e.g., "split_true_semdist_high_agree_all" -> "split_true_semdist_high")
        if "_agree_" in node_id:
            semantic_parent = "_".join(node_id.split("_")[:-2])  # Remove "_agree_{type}" suffix
            if self.score_agreement_groups and semantic_parent in self.score_agreement_groups:
                # Merge hierarchical thresholds with defaults, so missing metrics use defaults
                group_thresholds = self.score_agreement_groups[semantic_parent]
                result.update(group_thresholds)

        # Check for individual node overrides (highest priority)
        individual_group_id = f"node_{node_id}"
        if self.individual_node_groups and individual_group_id in self.individual_node_groups:
            individual_thresholds = self.individual_node_groups[individual_group_id]
            # Only update the metrics that are explicitly set in individual overrides
            for score_type in ["score_fuzz", "score_simulation", "score_detection"]:
                if score_type in individual_thresholds:
                    result[score_type] = individual_thresholds[score_type]

        return result