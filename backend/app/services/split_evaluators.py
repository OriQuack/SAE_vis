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

from ..models.threshold_v2 import (
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
            type='range',
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
        # First, evaluate all conditions to get metric states
        metric_states = {}
        triggering_values = {}

        for metric, condition in rule.conditions.items():
            value = feature_row.get(metric)
            if value is None:
                metric_states[metric] = None
                triggering_values[metric] = None
                continue

            triggering_values[metric] = value
            metric_states[metric] = self._evaluate_condition(value, condition)

        # Now match against patterns in order
        for pattern_index, pattern in enumerate(rule.patterns):
            if self._pattern_matches(metric_states, pattern.match):
                # Found matching pattern
                try:
                    branch_index = children_ids.index(pattern.child_id)
                except ValueError:
                    logger.warning(f"Pattern child_id '{pattern.child_id}' not in children_ids")
                    branch_index = 0

                split_info = ParentSplitRuleInfo(
                    type='pattern',
                    pattern_info=PatternInfo(
                        pattern_index=pattern_index,
                        pattern_description=pattern.description,
                        matched_pattern={k: v for k, v in pattern.match.items() if v is not None}
                    )
                )

                return EvaluationResult(
                    child_id=pattern.child_id,
                    branch_index=branch_index,
                    split_info=split_info,
                    triggering_values=triggering_values
                )

        # No pattern matched, use default
        if rule.default_child_id:
            child_id = rule.default_child_id
        else:
            # No default specified, use last child
            child_id = children_ids[-1] if children_ids else "unknown"

        try:
            branch_index = children_ids.index(child_id)
        except ValueError:
            branch_index = len(children_ids) - 1 if children_ids else 0

        split_info = ParentSplitRuleInfo(
            type='pattern',
            pattern_info=PatternInfo(
                pattern_index=-1,  # Indicates default was used
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
        triggering_values = {}

        # Extract relevant metric values for the expression
        if rule.available_metrics:
            for metric in rule.available_metrics:
                value = feature_row.get(metric, 0.0)
                triggering_values[metric] = value
        else:
            # Extract all numeric values from feature_row
            for key, value in feature_row.items():
                if isinstance(value, (int, float)):
                    triggering_values[key] = value

        # Evaluate branches in order
        for branch_index, branch in enumerate(rule.branches):
            try:
                # Create a safe evaluation context
                # In production, use a proper expression evaluator
                result = self._evaluate_expression(branch.condition, triggering_values)

                if result:
                    # Branch condition is true
                    try:
                        child_branch_index = children_ids.index(branch.child_id)
                    except ValueError:
                        logger.warning(f"Branch child_id '{branch.child_id}' not in children_ids")
                        child_branch_index = 0

                    split_info = ParentSplitRuleInfo(
                        type='expression',
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

            except Exception as e:
                logger.error(f"Error evaluating expression '{branch.condition}': {e}")
                continue

        # No branch matched, use default
        child_id = rule.default_child_id
        try:
            branch_index = children_ids.index(child_id)
        except ValueError:
            branch_index = len(children_ids) - 1 if children_ids else 0

        split_info = ParentSplitRuleInfo(
            type='expression',
            expression_info=ExpressionInfo(
                branch_index=-1,  # Indicates default was used
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
            return 'high' if value >= condition.threshold else 'low'

        if condition.min is not None and condition.max is not None:
            if condition.min <= value <= condition.max:
                return 'in_range'
            else:
                return 'out_range'

        if condition.operator and condition.value is not None:
            result = self._apply_operator(value, condition.operator, condition.value)
            return 'high' if result else 'low'

        return None

    def _apply_operator(
        self,
        value: float,
        operator: str,
        threshold: float
    ) -> bool:
        """Apply a comparison operator"""
        if operator == '>':
            return value > threshold
        elif operator == '>=':
            return value >= threshold
        elif operator == '<':
            return value < threshold
        elif operator == '<=':
            return value <= threshold
        elif operator == '==':
            return abs(value - threshold) < 1e-9  # Float equality with tolerance
        elif operator == '!=':
            return abs(value - threshold) >= 1e-9
        else:
            raise ValueError(f"Unknown operator: {operator}")

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
        expression = expression.replace('&&', ' and ')
        expression = expression.replace('||', ' or ')
        expression = expression.replace('!', ' not ')

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