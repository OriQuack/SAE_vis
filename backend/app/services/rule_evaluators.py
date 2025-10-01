"""
Split rule evaluators for the new threshold system.

This module provides evaluators for different types of split rules:
- RangeSplitRule: Evaluates single metric against thresholds
- PatternSplitRule: Matches multi-metric patterns
- ExpressionSplitRule: Evaluates complex logical expressions
"""

import logging
import re
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass

from ..models.threshold import (
    RangeSplitRule,
    PatternSplitRule,
    PatternCondition,
    ExpressionSplitRule,
    SplitRule,
    RangeInfo,
    PatternInfo,
    ExpressionInfo,
    ParentSplitRuleInfo
)
from .data_constants import (
    SPLIT_TYPE_RANGE, SPLIT_TYPE_PATTERN, SPLIT_TYPE_EXPRESSION,
    CONDITION_STATE_HIGH, CONDITION_STATE_LOW, CONDITION_STATE_IN_RANGE, CONDITION_STATE_OUT_RANGE,
    EXPR_OP_AND, EXPR_OP_OR, EXPR_OP_NOT, EXPR_OP_PYTHON_AND, EXPR_OP_PYTHON_OR, EXPR_OP_PYTHON_NOT
)

logger = logging.getLogger(__name__)


@dataclass
class EvaluationResult:
    """Result of split rule evaluation"""
    child_id: str
    branch_index: int
    split_info: ParentSplitRuleInfo
    triggering_values: Dict[str, float]


class SplitEvaluator:
    """Main evaluator class for all split rule types"""

    def evaluate(
        self,
        feature_row: Dict[str, Any],
        split_rule: SplitRule,
        children_ids: List[str]
    ) -> EvaluationResult:
        """
        Evaluate a split rule against a feature row.

        Args:
            feature_row: Dictionary containing feature metric values
            split_rule: The split rule to evaluate
            children_ids: List of child node IDs (for branch index)

        Returns:
            EvaluationResult with selected child and metadata
        """
        if isinstance(split_rule, RangeSplitRule):
            return self.evaluate_range_split(feature_row, split_rule, children_ids)
        elif isinstance(split_rule, PatternSplitRule):
            return self.evaluate_pattern_split(feature_row, split_rule, children_ids)
        elif isinstance(split_rule, ExpressionSplitRule):
            return self.evaluate_expression_split(feature_row, split_rule, children_ids)
        else:
            raise ValueError(f"Unknown split rule type: {type(split_rule)}")

    def evaluate_range_split(
        self,
        feature_row: Dict[str, Any],
        rule: RangeSplitRule,
        children_ids: List[str]
    ) -> EvaluationResult:
        """
        Evaluate a range-based split rule.

        For thresholds [t1, t2, t3], creates ranges:
        - Range 0: value < t1
        - Range 1: t1 <= value < t2
        - Range 2: t2 <= value < t3
        - Range 3: value >= t3
        """
        value = feature_row.get(rule.metric, 0.0)
        if value is None:
            value = 0.0

        # Find which range the value falls into
        selected_range = 0
        for i, threshold in enumerate(rule.thresholds):
            if value >= threshold:
                selected_range = i + 1
            else:
                break

        # Ensure we have enough children
        if selected_range >= len(children_ids):
            logger.warning(
                f"Range {selected_range} exceeds children count {len(children_ids)}. "
                f"Using last child."
            )
            selected_range = len(children_ids) - 1

        child_id = children_ids[selected_range]

        # Build split info
        split_info = ParentSplitRuleInfo(
            type=SPLIT_TYPE_RANGE,
            range_info=RangeInfo(
                metric=rule.metric,
                thresholds=rule.thresholds,
                selected_range=selected_range
            )
        )

        return EvaluationResult(
            child_id=child_id,
            branch_index=selected_range,
            split_info=split_info,
            triggering_values={rule.metric: value}
        )

    def evaluate_pattern_split(
        self,
        feature_row: Dict[str, Any],
        rule: PatternSplitRule,
        children_ids: List[str]
    ) -> EvaluationResult:
        """
        Evaluate a pattern-based split rule.

        Evaluates conditions to determine metric states (high/low/in_range/out_range),
        then matches against patterns in order.
        """
        metric_states, triggering_values = self._evaluate_all_conditions(feature_row, rule.conditions)

        # Try to match patterns in order
        for pattern_index, pattern in enumerate(rule.patterns):
            if self._pattern_matches(metric_states, pattern.match):
                return self._build_pattern_result(
                    pattern, pattern_index, children_ids, triggering_values
                )

        # No pattern matched, use default
        return self._build_default_pattern_result(rule, children_ids, triggering_values)

    def _evaluate_all_conditions(
        self, feature_row: Dict[str, Any], conditions: Dict[str, Any]
    ) -> Tuple[Dict[str, Optional[str]], Dict[str, Any]]:
        """Evaluate all conditions and return metric states and triggering values."""
        metric_states = {}
        triggering_values = {}

        for metric, condition in conditions.items():
            value = feature_row.get(metric)
            if value is None:
                metric_states[metric] = CONDITION_STATE_LOW
                triggering_values[metric] = None
                logger.debug(f"Metric {metric}: value=None, state=LOW")
                continue

            triggering_values[metric] = value
            state = self._evaluate_condition(value, condition)
            metric_states[metric] = state
            logger.debug(f"Metric {metric}: value={value}, threshold={condition.threshold}, state={state}")

        return metric_states, triggering_values

    def _build_pattern_result(
        self,
        pattern,
        pattern_index: int,
        children_ids: List[str],
        triggering_values: Dict[str, Any]
    ) -> EvaluationResult:
        """Build evaluation result for matched pattern."""
        matching_child = self._find_matching_child(pattern.child_id, children_ids)

        if matching_child:
            branch_index = children_ids.index(matching_child)
        else:
            logger.warning(
                f"Pattern child_id '{pattern.child_id}' not found in children_ids: {children_ids}. "
                f"Using first child as fallback."
            )
            branch_index = 0
            matching_child = children_ids[0] if children_ids else pattern.child_id

        split_info = ParentSplitRuleInfo(
            type=SPLIT_TYPE_PATTERN,
            pattern_info=PatternInfo(
                pattern_index=pattern_index,
                pattern_description=pattern.description,
                matched_pattern={k: v for k, v in pattern.match.items() if v is not None}
            )
        )

        return EvaluationResult(
            child_id=matching_child,
            branch_index=branch_index,
            split_info=split_info,
            triggering_values=triggering_values
        )

    def _build_default_pattern_result(
        self, rule: PatternSplitRule, children_ids: List[str], triggering_values: Dict[str, Any]
    ) -> EvaluationResult:
        """Build evaluation result for default case (no pattern matched)."""
        child_id = rule.default_child_id if rule.default_child_id else (
            children_ids[-1] if children_ids else "unknown"
        )

        try:
            branch_index = children_ids.index(child_id)
        except ValueError:
            branch_index = len(children_ids) - 1 if children_ids else 0

        split_info = ParentSplitRuleInfo(
            type='pattern',
            pattern_info=PatternInfo(
                pattern_index=-1,
                pattern_description="Default (no pattern matched)",
                matched_pattern={}
            )
        )

        return EvaluationResult(
            child_id=child_id,
            branch_index=branch_index,
            split_info=split_info,
            triggering_values=triggering_values
        )

    def evaluate_expression_split(
        self,
        feature_row: Dict[str, Any],
        rule: ExpressionSplitRule,
        children_ids: List[str]
    ) -> EvaluationResult:
        """
        Evaluate an expression-based split rule.

        WARNING: This uses eval() which can be dangerous. In production,
        use a safe expression evaluator like simpleeval or numexpr.
        """
        triggering_values = self._extract_triggering_values(feature_row, rule.available_metrics)

        # Try to match branches in order
        for branch_index, branch in enumerate(rule.branches):
            try:
                if self._evaluate_expression(branch.condition, triggering_values):
                    return self._build_expression_result(
                        branch, branch_index, children_ids, triggering_values
                    )
            except Exception as e:
                logger.error(f"Error evaluating expression '{branch.condition}': {e}")
                continue

        # No branch matched, use default
        return self._build_default_expression_result(rule, children_ids, triggering_values)

    def _extract_triggering_values(
        self, feature_row: Dict[str, Any], available_metrics: Optional[List[str]]
    ) -> Dict[str, float]:
        """Extract triggering values from feature row."""
        triggering_values = {}

        if available_metrics:
            for metric in available_metrics:
                triggering_values[metric] = feature_row.get(metric, 0.0)
        else:
            # Extract all numeric values
            for key, value in feature_row.items():
                if isinstance(value, (int, float)):
                    triggering_values[key] = value

        return triggering_values

    def _build_expression_result(
        self, branch, branch_index: int, children_ids: List[str], triggering_values: Dict[str, float]
    ) -> EvaluationResult:
        """Build evaluation result for matched expression branch."""
        try:
            child_branch_index = children_ids.index(branch.child_id)
        except ValueError:
            logger.warning(f"Branch child_id '{branch.child_id}' not in children_ids")
            child_branch_index = 0

        split_info = ParentSplitRuleInfo(
            type=SPLIT_TYPE_EXPRESSION,
            expression_info=ExpressionInfo(
                branch_index=branch_index,
                condition=branch.condition,
                description=branch.description
            )
        )

        return EvaluationResult(
            child_id=branch.child_id,
            branch_index=child_branch_index,
            split_info=split_info,
            triggering_values=triggering_values
        )

    def _build_default_expression_result(
        self, rule: ExpressionSplitRule, children_ids: List[str], triggering_values: Dict[str, float]
    ) -> EvaluationResult:
        """Build evaluation result for default case (no expression matched)."""
        child_id = rule.default_child_id
        try:
            branch_index = children_ids.index(child_id)
        except ValueError:
            branch_index = len(children_ids) - 1 if children_ids else 0

        split_info = ParentSplitRuleInfo(
            type=SPLIT_TYPE_EXPRESSION,
            expression_info=ExpressionInfo(
                branch_index=-1,
                condition="default",
                description="Default (no expression matched)"
            )
        )

        return EvaluationResult(
            child_id=child_id,
            branch_index=branch_index,
            split_info=split_info,
            triggering_values=triggering_values
        )

    def _evaluate_condition(
        self,
        value: float,
        condition: PatternCondition
    ) -> Optional[str]:
        """
        Evaluate a single condition to determine metric state.

        Returns: 'high', 'low', 'in_range', 'out_range', or None
        """
        if condition.threshold is not None:
            return CONDITION_STATE_HIGH if value >= condition.threshold else CONDITION_STATE_LOW

        if condition.min is not None and condition.max is not None:
            if condition.min <= value <= condition.max:
                return CONDITION_STATE_IN_RANGE
            else:
                return CONDITION_STATE_OUT_RANGE

        if condition.operator and condition.value is not None:
            result = self._apply_operator(value, condition.operator, condition.value)
            return CONDITION_STATE_HIGH if result else CONDITION_STATE_LOW

        return None

    def _apply_operator(self, value: float, operator: str, threshold: float) -> bool:
        """Apply a comparison operator"""
        operators = {
            '>': lambda v, t: v > t,
            '>=': lambda v, t: v >= t,
            '<': lambda v, t: v < t,
            '<=': lambda v, t: v <= t,
            '==': lambda v, t: abs(v - t) < 1e-9,
            '!=': lambda v, t: abs(v - t) >= 1e-9
        }

        if operator not in operators:
            raise ValueError(f"Unknown operator: {operator}")

        return operators[operator](value, threshold)

    def _pattern_matches(
        self,
        metric_states: Dict[str, Optional[str]],
        pattern_match: Dict[str, Optional[str]]
    ) -> bool:
        """
        Check if metric states match a pattern.

        Pattern matching rules:
        - If pattern value is None, it's a wildcard (always matches)
        - Otherwise, metric state must equal pattern value
        """
        for metric, expected_state in pattern_match.items():
            if expected_state is None:
                # Wildcard - always matches
                continue

            actual_state = metric_states.get(metric)
            if actual_state != expected_state:
                return False

        return True

    def _find_matching_child(
        self,
        pattern_child_id: str,
        children_ids: List[str]
    ) -> Optional[str]:
        """
        Find child that matches pattern, regardless of hierarchy position.

        Handles:
        - Exact matches (backward compatibility)
        - Suffix matches (score agreement at end)
        - Component matches (score agreement in middle/beginning)

        Args:
            pattern_child_id: The pattern's child_id (e.g., '2_of_3_high_fuzz_det')
            children_ids: List of actual child node IDs

        Returns:
            Matching child ID or None if not found
        """
        # First try exact match (fastest and most reliable)
        if pattern_child_id in children_ids:
            return pattern_child_id

        # Then try suffix match (for current hierarchy where score is at end)
        for child_id in children_ids:
            if child_id.endswith(pattern_child_id) or child_id.endswith('_' + pattern_child_id):
                return child_id

        # Then try component-based matching (for score agreement in middle/beginning)
        pattern_parts = pattern_child_id.split('_')

        for child_id in children_ids:
            child_parts = child_id.split('_')

            # Check if pattern parts appear consecutively in child parts
            # This handles cases like:
            # pattern: '2_of_3_high_fuzz_det'
            # child: 'root_2_of_3_high_fuzz_det_split_true_semdist_high'
            for i in range(len(child_parts) - len(pattern_parts) + 1):
                if child_parts[i:i+len(pattern_parts)] == pattern_parts:
                    return child_id

        # No match found
        return None

    def _evaluate_expression(
        self,
        expression: str,
        context: Dict[str, float]
    ) -> bool:
        """
        Safely evaluate a boolean expression.

        In production, replace this with a safe expression evaluator like:
        - simpleeval
        - numexpr
        - asteval

        For now, we'll use a very restricted eval with safety checks.
        """
        # Replace logical operators with Python equivalents
        expression = expression.replace(EXPR_OP_AND, EXPR_OP_PYTHON_AND)
        expression = expression.replace(EXPR_OP_OR, EXPR_OP_PYTHON_OR)
        expression = expression.replace(EXPR_OP_NOT, EXPR_OP_PYTHON_NOT)

        # Basic safety check - only allow certain characters
        allowed_chars = set('0123456789.()><=! andornotTrueFalse_')
        for metric in context.keys():
            allowed_chars.update(metric)

        if not all(c in allowed_chars or c.isspace() for c in expression):
            raise ValueError(f"Expression contains disallowed characters: {expression}")

        # Create evaluation namespace
        namespace = dict(context)
        namespace['True'] = True
        namespace['False'] = False

        try:
            # WARNING: eval() is dangerous! Use a safe evaluator in production!
            result = eval(expression, {"__builtins__": {}}, namespace)
            return bool(result)
        except Exception as e:
            logger.error(f"Expression evaluation failed: {expression}, error: {e}")
            return False


class BatchSplitEvaluator:
    """Optimized evaluator for batch processing with Polars DataFrames"""

    def __init__(self):
        self.evaluator = SplitEvaluator()

    def evaluate_dataframe(
        self,
        df,  # polars.DataFrame
        split_rule: SplitRule,
        children_ids: List[str]
    ) -> Tuple[List[str], List[int], List[Dict[str, float]]]:
        """
        Evaluate split rule for entire DataFrame.

        Returns:
            Tuple of (child_ids, branch_indices, triggering_values_list)
        """
        child_ids = []
        branch_indices = []
        triggering_values_list = []

        # Convert to dict rows for evaluation
        for row in df.iter_rows(named=True):
            result = self.evaluator.evaluate(row, split_rule, children_ids)
            child_ids.append(result.child_id)
            branch_indices.append(result.branch_index)
            triggering_values_list.append(result.triggering_values)

        return child_ids, branch_indices, triggering_values_list