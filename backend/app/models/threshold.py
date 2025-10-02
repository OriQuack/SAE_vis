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

# Import constants for consistent string management
from ..services.data_constants import (
    SPLIT_TYPE_RANGE, SPLIT_TYPE_PATTERN, SPLIT_TYPE_EXPRESSION,
    CONDITION_STATE_HIGH, CONDITION_STATE_LOW, CONDITION_STATE_IN_RANGE, CONDITION_STATE_OUT_RANGE,
    CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_DISTANCE, CATEGORY_SCORE_AGREEMENT
)


# ============================================================================
# CATEGORY TYPE DEFINITION
# ============================================================================

class CategoryType(str, Enum):
    """Node category types for Sankey diagrams and visualization"""
    ROOT = CATEGORY_ROOT
    FEATURE_SPLITTING = CATEGORY_FEATURE_SPLITTING
    SEMANTIC_DISTANCE = CATEGORY_SEMANTIC_DISTANCE
    SCORE_AGREEMENT = CATEGORY_SCORE_AGREEMENT
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
    type: Literal["range"] = Field(default=SPLIT_TYPE_RANGE)
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
    type: Literal["pattern"] = Field(default=SPLIT_TYPE_PATTERN)
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
    type: Literal["expression"] = Field(default=SPLIT_TYPE_EXPRESSION)
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
    selected_range: Optional[int] = Field(None, description="Index of the range that was selected (0 to len(thresholds))")


class PatternInfo(BaseModel):
    """Information about a pattern match that occurred"""
    pattern_index: int
    pattern_description: Optional[str] = None
    matched_pattern: Optional[Dict[str, str]] = Field(None, description="The actual pattern that matched")


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
        """Ensure the correct info field is populated based on type (optional for frontend compatibility)"""
        # Made optional to support frontend structures that don't include runtime classification info
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
    triggering_values: Optional[Dict[str, Optional[float]]] = Field(
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
                # Allow for prefixed child IDs (frontend compatibility)
                pattern_child_ids = {p.child_id for p in split_rule.patterns}
                if split_rule.default_child_id:
                    pattern_child_ids.add(split_rule.default_child_id)

                # Check if each pattern child_id exists as a suffix in actual children_ids
                missing = set()
                for pattern_id in pattern_child_ids:
                    if not any(child_id.endswith(pattern_id) for child_id in v):
                        missing.add(pattern_id)

                if missing:
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

    # Performance optimization: cache for O(1) node lookups
    _nodes_by_id: Optional[Dict[str, SankeyThreshold]] = None
    _nodes_by_stage: Optional[Dict[int, List[SankeyThreshold]]] = None

    class Config:
        # Allow private attributes for caching
        underscore_attrs_are_private = True

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

    def __init__(self, **data):
        """Initialize and build lookup caches"""
        super().__init__(**data)
        self._build_lookup_caches()

    def _build_lookup_caches(self):
        """Build lookup caches for O(1) access"""
        self._nodes_by_id = {node.id: node for node in self.nodes}
        self._nodes_by_stage = {}
        for node in self.nodes:
            if node.stage not in self._nodes_by_stage:
                self._nodes_by_stage[node.stage] = []
            self._nodes_by_stage[node.stage].append(node)

    def get_root(self) -> SankeyThreshold:
        """Get the root node of the structure"""
        # Use cached lookup if available
        if self._nodes_by_stage and 0 in self._nodes_by_stage:
            return self._nodes_by_stage[0][0]
        return next(n for n in self.nodes if n.stage == 0)

    def get_node_by_id(self, node_id: str) -> Optional[SankeyThreshold]:
        """Find a node by its ID - O(1) with cache"""
        if self._nodes_by_id is None:
            self._build_lookup_caches()
        return self._nodes_by_id.get(node_id)

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

    def get_ancestors(self, node_id: str) -> List[str]:
        """Get all ancestor node IDs from parent path - uses parent_path for efficiency"""
        node = self.get_node_by_id(node_id)
        if not node:
            return []
        return [p.parent_id for p in node.parent_path]

    def get_path_constraints(self, node_id: str) -> List[Dict[str, Any]]:
        """
        Extract path constraints from parent_path for efficient filtering.
        Returns list of constraint dicts with metric, thresholds, and branch info.
        """
        node = self.get_node_by_id(node_id)
        if not node:
            return []

        constraints = []
        for parent_info in node.parent_path:
            constraint = {
                "parent_id": parent_info.parent_id,
                "branch_index": parent_info.branch_index,
                "split_type": parent_info.parent_split_rule.type
            }

            # Extract specific constraint details based on split type
            if parent_info.parent_split_rule.type == "range":
                if parent_info.parent_split_rule.range_info:
                    constraint["metric"] = parent_info.parent_split_rule.range_info.metric
                    constraint["thresholds"] = parent_info.parent_split_rule.range_info.thresholds
                    constraint["selected_range"] = parent_info.parent_split_rule.range_info.selected_range
            elif parent_info.parent_split_rule.type == "pattern":
                if parent_info.parent_split_rule.pattern_info:
                    constraint["pattern_index"] = parent_info.parent_split_rule.pattern_info.pattern_index

            # Include triggering values if available (useful for exact filtering)
            if parent_info.triggering_values:
                constraint["triggering_values"] = parent_info.triggering_values

            constraints.append(constraint)

        return constraints

    def get_nodes_at_stage(self, stage: int) -> List[SankeyThreshold]:
        """Get all nodes at a specific stage - O(1) with cache"""
        if self._nodes_by_stage is None:
            self._build_lookup_caches()
        return self._nodes_by_stage.get(stage, [])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "nodes": [node.dict() for node in self.nodes],
            "metrics": self.metrics,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ThresholdStructure":
        """Create from dictionary"""
        return cls(**data)