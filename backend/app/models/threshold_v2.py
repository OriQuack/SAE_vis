"""
New threshold system models for flexible, scalable feature classification.

This module defines the v2 threshold system that supports:
- Dynamic stage ordering
- Multiple split rule types (range, pattern, expression)
- Individual metric handling
- Parent path tracking
"""

from enum import Enum
from typing import List, Dict, Optional, Union, Any, Literal
from pydantic import BaseModel, Field, validator
import json


# ============================================================================
# CATEGORY TYPE DEFINITION
# ============================================================================

class CategoryType(str, Enum):
    """Node category types for Sankey diagrams and visualization"""
    ROOT = "root"
    FEATURE_SPLITTING = "feature_splitting"
    SEMANTIC_DISTANCE = "semantic_distance"
    SCORE_AGREEMENT = "score_agreement"
    # Can be extended with new categories without code changes


# ============================================================================
# SPLIT RULE DEFINITIONS
# ============================================================================

class RangeSplitRule(BaseModel):
    """
    Range-based split rule for single metric thresholds.
    Divides children based on value ranges of a single metric.

    Example:
        metric="semdist_mean", thresholds=[0.1, 0.3, 0.6]
        Creates 4 branches: <0.1, 0.1-0.3, 0.3-0.6, >=0.6
    """
    type: Literal["range"] = Field(default="range")
    metric: str = Field(..., description="The metric name to evaluate")
    thresholds: List[float] = Field(
        ...,
        description="Array of threshold values that define N+1 branches",
        min_items=1
    )

    @validator('thresholds')
    def validate_thresholds_order(cls, v):
        """Ensure thresholds are in ascending order"""
        if len(v) > 1:
            for i in range(1, len(v)):
                if v[i] <= v[i-1]:
                    raise ValueError(f"Thresholds must be in ascending order: {v}")
        return v


class PatternCondition(BaseModel):
    """Condition definition for a single metric in pattern matching"""
    threshold: Optional[float] = Field(None, description="Simple threshold for high/low classification")
    min: Optional[float] = Field(None, description="Minimum value for range condition")
    max: Optional[float] = Field(None, description="Maximum value for range condition")
    operator: Optional[Literal['>', '>=', '<', '<=', '==', '!=']] = Field(
        None,
        description="Comparison operator for more complex conditions"
    )
    value: Optional[float] = Field(None, description="Value to compare against when using operator")

    @validator('*', pre=False)
    def validate_condition(cls, v, values):
        """Validate that at least one condition type is specified"""
        # This runs after all fields are set
        if all(val is None for val in values.values()):
            # Will be caught by the parent validator
            pass
        return v


class Pattern(BaseModel):
    """Pattern definition for multi-metric matching"""
    match: Dict[str, Optional[Literal['high', 'low', 'in_range', 'out_range']]] = Field(
        ...,
        description="Pattern to match - metric names and their expected states"
    )
    child_id: str = Field(..., description="Child node ID to select when this pattern matches")
    description: Optional[str] = Field(None, description="Optional description for documentation/debugging")


class PatternSplitRule(BaseModel):
    """
    Pattern-based split rule for multi-metric conditions.
    Allows flexible pattern matching with multiple metrics.

    This replaces the hardcoded "1 of 3 high", "2 of 3 high" logic
    with flexible, configurable patterns.
    """
    type: Literal["pattern"] = Field(default="pattern")
    conditions: Dict[str, PatternCondition] = Field(
        ...,
        description="Condition definitions for each metric"
    )
    patterns: List[Pattern] = Field(
        ...,
        description="Pattern matching rules evaluated in order",
        min_items=1
    )
    default_child_id: Optional[str] = Field(
        None,
        description="Default child ID when no patterns match"
    )

    @validator('conditions')
    def validate_conditions(cls, v):
        """Ensure each condition has at least one criterion"""
        for metric, condition in v.items():
            if not any([
                condition.threshold is not None,
                condition.min is not None or condition.max is not None,
                condition.operator is not None and condition.value is not None
            ]):
                raise ValueError(f"Condition for metric '{metric}' must specify at least one criterion")
        return v


class ExpressionBranch(BaseModel):
    """Branch definition for expression-based splitting"""
    condition: str = Field(
        ...,
        description="Condition expression as string (e.g., 'score_fuzz > 0.5 && score_sim > 0.5')"
    )
    child_id: str = Field(..., description="Child node ID when condition evaluates to true")
    description: Optional[str] = Field(None, description="Optional description of this branch")


class ExpressionSplitRule(BaseModel):
    """
    Expression-based split rule for complex logical conditions.
    Uses string expressions for maximum flexibility.

    WARNING: Expression evaluation should be done safely in production.
    Consider using a safe expression evaluator library.
    """
    type: Literal["expression"] = Field(default="expression")
    available_metrics: Optional[List[str]] = Field(
        None,
        description="Available metrics that can be used in expressions"
    )
    branches: List[ExpressionBranch] = Field(
        ...,
        description="Branch conditions evaluated in order",
        min_items=1
    )
    default_child_id: str = Field(
        ...,
        description="Required default child for when all conditions are false"
    )


# Union type for all split rules
SplitRule = Union[RangeSplitRule, PatternSplitRule, ExpressionSplitRule]


# ============================================================================
# PARENT PATH INFORMATION
# ============================================================================

class RangeInfo(BaseModel):
    """Information about a range split that was applied"""
    metric: str
    thresholds: List[float]
    selected_range: int = Field(..., description="Index of the range that was selected (0 to len(thresholds))")


class PatternInfo(BaseModel):
    """Information about a pattern match that occurred"""
    pattern_index: int
    pattern_description: Optional[str] = None
    matched_pattern: Dict[str, str] = Field(..., description="The actual pattern that matched")


class ExpressionInfo(BaseModel):
    """Information about an expression branch that was taken"""
    branch_index: int
    condition: str
    description: Optional[str] = None


class ParentSplitRuleInfo(BaseModel):
    """Information about the split rule that was applied at parent node"""
    type: Literal['range', 'pattern', 'expression']
    range_info: Optional[RangeInfo] = None
    pattern_info: Optional[PatternInfo] = None
    expression_info: Optional[ExpressionInfo] = None

    @validator('*', pre=False)
    def validate_info_matches_type(cls, v, values):
        """Ensure the correct info field is populated based on type"""
        if 'type' in values:
            rule_type = values['type']
            if rule_type == 'range' and v is None and cls.__name__ == 'range_info':
                raise ValueError("range_info must be provided for range type")
            elif rule_type == 'pattern' and v is None and cls.__name__ == 'pattern_info':
                raise ValueError("pattern_info must be provided for pattern type")
            elif rule_type == 'expression' and v is None and cls.__name__ == 'expression_info':
                raise ValueError("expression_info must be provided for expression type")
        return v


class ParentPathInfo(BaseModel):
    """
    Detailed information about how we arrived at current node from parent.
    Includes both the split rule used and the branch taken.
    """
    parent_id: str = Field(..., description="Parent node ID")
    parent_split_rule: ParentSplitRuleInfo = Field(
        ...,
        description="The split rule that was applied at the parent node"
    )
    branch_index: int = Field(
        ...,
        description="The branch index taken from parent's children_ids array"
    )
    triggering_values: Optional[Dict[str, float]] = Field(
        None,
        description="The actual metric values that led to this branch"
    )


# ============================================================================
# MAIN NODE DEFINITION
# ============================================================================

class SankeyThreshold(BaseModel):
    """
    Complete node definition for hierarchical decision tree.
    Supports splitting from root (stage 0) through all subsequent stages.

    This is the main structure that replaces the old ThresholdNode/ThresholdTree system.
    """
    id: str = Field(..., description="Unique identifier for this node")
    stage: int = Field(
        ...,
        description="Stage number in the tree hierarchy (0 = root)",
        ge=0
    )
    category: CategoryType = Field(
        ...,
        description="Category type of this node for visualization"
    )
    parent_path: List[ParentPathInfo] = Field(
        default_factory=list,
        description="Path information from root to this node"
    )
    split_rule: Optional[SplitRule] = Field(
        None,
        description="Split rule applied at this node (None for leaf nodes)"
    )
    children_ids: List[str] = Field(
        default_factory=list,
        description="Array of child node IDs (empty for leaf nodes)"
    )

    @validator('children_ids')
    def validate_children_consistency(cls, v, values):
        """Ensure children count matches split rule expectations"""
        if 'split_rule' in values and values['split_rule'] is not None:
            split_rule = values['split_rule']

            if isinstance(split_rule, RangeSplitRule):
                expected = len(split_rule.thresholds) + 1
                if len(v) != expected:
                    raise ValueError(
                        f"RangeSplitRule with {len(split_rule.thresholds)} thresholds "
                        f"requires exactly {expected} children, got {len(v)}"
                    )

            elif isinstance(split_rule, PatternSplitRule):
                # Pattern rules can have variable children based on patterns
                # Just ensure we have at least the explicitly defined patterns
                pattern_child_ids = {p.child_id for p in split_rule.patterns}
                if split_rule.default_child_id:
                    pattern_child_ids.add(split_rule.default_child_id)

                if not pattern_child_ids.issubset(set(v)):
                    missing = pattern_child_ids - set(v)
                    raise ValueError(f"PatternSplitRule missing children: {missing}")

            elif isinstance(split_rule, ExpressionSplitRule):
                # Expression rules need at least the branch children + default
                branch_child_ids = {b.child_id for b in split_rule.branches}
                branch_child_ids.add(split_rule.default_child_id)

                if not branch_child_ids.issubset(set(v)):
                    missing = branch_child_ids - set(v)
                    raise ValueError(f"ExpressionSplitRule missing children: {missing}")

        elif len(v) > 0:
            # If no split rule, should have no children
            raise ValueError("Node without split_rule cannot have children")

        return v

    class Config:
        json_encoders = {
            CategoryType: lambda v: v.value
        }


# ============================================================================
# THRESHOLD STRUCTURE (replaces ThresholdTree)
# ============================================================================

class ThresholdStructure(BaseModel):
    """
    Complete threshold structure for the entire classification pipeline.
    This replaces the old ThresholdTree with a more flexible structure.
    """
    nodes: List[SankeyThreshold] = Field(
        ...,
        description="All nodes in the threshold structure",
        min_items=1
    )
    metrics: List[str] = Field(
        default_factory=list,
        description="List of all metrics used in the structure"
    )
    version: int = Field(
        default=2,
        description="Version number for compatibility checking"
    )

    @validator('nodes')
    def validate_structure(cls, v):
        """Validate the overall structure consistency"""
        # Check for root node
        root_nodes = [n for n in v if n.stage == 0]
        if len(root_nodes) != 1:
            raise ValueError(f"Must have exactly one root node (stage=0), found {len(root_nodes)}")

        # Check all referenced children exist
        node_ids = {n.id for n in v}
        for node in v:
            for child_id in node.children_ids:
                if child_id not in node_ids:
                    raise ValueError(f"Node '{node.id}' references non-existent child '{child_id}'")

        # Validate parent paths
        for node in v:
            if node.stage > 0 and len(node.parent_path) != node.stage:
                raise ValueError(
                    f"Node '{node.id}' at stage {node.stage} should have "
                    f"{node.stage} parent path entries, has {len(node.parent_path)}"
                )

        return v

    def get_root(self) -> SankeyThreshold:
        """Get the root node of the structure"""
        return next(n for n in self.nodes if n.stage == 0)

    def get_node_by_id(self, node_id: str) -> Optional[SankeyThreshold]:
        """Find a node by its ID"""
        return next((n for n in self.nodes if n.id == node_id), None)

    def get_children(self, parent_id: str) -> List[SankeyThreshold]:
        """Get all children of a parent node"""
        parent = self.get_node_by_id(parent_id)
        if not parent:
            return []

        children = []
        for child_id in parent.children_ids:
            child = self.get_node_by_id(child_id)
            if child:
                children.append(child)

        return children

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "nodes": [node.dict() for node in self.nodes],
            "metrics": self.metrics,
            "version": self.version
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ThresholdStructure":
        """Create from dictionary"""
        return cls(**data)


# ============================================================================
# MIGRATION UTILITIES
# ============================================================================

def create_default_v2_structure() -> ThresholdStructure:
    """
    Create a default v2 threshold structure that matches the current 3-stage flow.
    This is used for initial migration and testing.
    """
    nodes = []

    # Root node
    root = SankeyThreshold(
        id="root",
        stage=0,
        category=CategoryType.ROOT,
        parent_path=[],
        split_rule=RangeSplitRule(
            type="range",
            metric="feature_splitting",
            thresholds=[0.00002]  # Default threshold from old system
        ),
        children_ids=["split_false", "split_true"]
    )
    nodes.append(root)

    # Stage 1: Feature splitting nodes
    for split_val in ["false", "true"]:
        split_node = SankeyThreshold(
            id=f"split_{split_val}",
            stage=1,
            category=CategoryType.FEATURE_SPLITTING,
            parent_path=[
                ParentPathInfo(
                    parent_id="root",
                    parent_split_rule=ParentSplitRuleInfo(
                        type="range",
                        range_info=RangeInfo(
                            metric="feature_splitting",
                            thresholds=[0.00002],
                            selected_range=0 if split_val == "false" else 1
                        )
                    ),
                    branch_index=0 if split_val == "false" else 1
                )
            ],
            split_rule=RangeSplitRule(
                type="range",
                metric="semdist_mean",
                thresholds=[0.15]  # Default from old system
            ),
            children_ids=[f"split_{split_val}_semdist_low", f"split_{split_val}_semdist_high"]
        )
        nodes.append(split_node)

        # Stage 2: Semantic distance nodes
        for semdist_val in ["low", "high"]:
            semdist_node_id = f"split_{split_val}_semdist_{semdist_val}"
            semdist_node = SankeyThreshold(
                id=semdist_node_id,
                stage=2,
                category=CategoryType.SEMANTIC_DISTANCE,
                parent_path=[
                    ParentPathInfo(
                        parent_id="root",
                        parent_split_rule=ParentSplitRuleInfo(
                            type="range",
                            range_info=RangeInfo(
                                metric="feature_splitting",
                                thresholds=[0.00002],
                                selected_range=0 if split_val == "false" else 1
                            )
                        ),
                        branch_index=0 if split_val == "false" else 1
                    ),
                    ParentPathInfo(
                        parent_id=f"split_{split_val}",
                        parent_split_rule=ParentSplitRuleInfo(
                            type="range",
                            range_info=RangeInfo(
                                metric="semdist_mean",
                                thresholds=[0.15],
                                selected_range=0 if semdist_val == "low" else 1
                            )
                        ),
                        branch_index=0 if semdist_val == "low" else 1
                    )
                ],
                split_rule=PatternSplitRule(
                    type="pattern",
                    conditions={
                        "score_fuzz": PatternCondition(threshold=0.5),
                        "score_simulation": PatternCondition(threshold=0.5),
                        "score_detection": PatternCondition(threshold=0.2)
                    },
                    patterns=[
                        Pattern(
                            match={
                                "score_fuzz": "high",
                                "score_simulation": "high",
                                "score_detection": "high"
                            },
                            child_id=f"{semdist_node_id}_agree_all3high",
                            description="All 3 scores high"
                        ),
                        Pattern(
                            match={
                                "score_fuzz": "high",
                                "score_simulation": "high",
                                "score_detection": "low"
                            },
                            child_id=f"{semdist_node_id}_agree_2of3high",
                            description="2 of 3 high (fuzz & sim)"
                        ),
                        Pattern(
                            match={
                                "score_fuzz": "high",
                                "score_simulation": "low",
                                "score_detection": "high"
                            },
                            child_id=f"{semdist_node_id}_agree_2of3high",
                            description="2 of 3 high (fuzz & det)"
                        ),
                        Pattern(
                            match={
                                "score_fuzz": "low",
                                "score_simulation": "high",
                                "score_detection": "high"
                            },
                            child_id=f"{semdist_node_id}_agree_2of3high",
                            description="2 of 3 high (sim & det)"
                        ),
                        Pattern(
                            match={
                                "score_fuzz": "high",
                                "score_simulation": "low",
                                "score_detection": "low"
                            },
                            child_id=f"{semdist_node_id}_agree_1of3high",
                            description="1 of 3 high (fuzz)"
                        ),
                        Pattern(
                            match={
                                "score_fuzz": "low",
                                "score_simulation": "high",
                                "score_detection": "low"
                            },
                            child_id=f"{semdist_node_id}_agree_1of3high",
                            description="1 of 3 high (sim)"
                        ),
                        Pattern(
                            match={
                                "score_fuzz": "low",
                                "score_simulation": "low",
                                "score_detection": "high"
                            },
                            child_id=f"{semdist_node_id}_agree_1of3high",
                            description="1 of 3 high (det)"
                        ),
                        Pattern(
                            match={
                                "score_fuzz": "low",
                                "score_simulation": "low",
                                "score_detection": "low"
                            },
                            child_id=f"{semdist_node_id}_agree_all3low",
                            description="All 3 scores low"
                        )
                    ],
                    default_child_id=f"{semdist_node_id}_agree_all3low"
                ),
                children_ids=[
                    f"{semdist_node_id}_agree_all3low",
                    f"{semdist_node_id}_agree_1of3high",
                    f"{semdist_node_id}_agree_2of3high",
                    f"{semdist_node_id}_agree_all3high"
                ]
            )
            nodes.append(semdist_node)

            # Stage 3: Score agreement nodes (leaf nodes)
            for agreement in ["all3low", "1of3high", "2of3high", "all3high"]:
                agreement_node = SankeyThreshold(
                    id=f"{semdist_node_id}_agree_{agreement}",
                    stage=3,
                    category=CategoryType.SCORE_AGREEMENT,
                    parent_path=semdist_node.parent_path + [
                        ParentPathInfo(
                            parent_id=semdist_node_id,
                            parent_split_rule=ParentSplitRuleInfo(
                                type="pattern",
                                pattern_info=PatternInfo(
                                    pattern_index=0,  # Will be set correctly during classification
                                    pattern_description=f"Score agreement: {agreement}",
                                    matched_pattern={}
                                )
                            ),
                            branch_index=["all3low", "1of3high", "2of3high", "all3high"].index(agreement)
                        )
                    ],
                    split_rule=None,  # Leaf nodes
                    children_ids=[]
                )
                nodes.append(agreement_node)

    # Collect all metrics
    metrics = [
        "feature_splitting",
        "semdist_mean",
        "score_fuzz",
        "score_simulation",
        "score_detection"
    ]

    return ThresholdStructure(
        nodes=nodes,
        metrics=metrics,
        version=2
    )