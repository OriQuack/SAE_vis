"""
Quantile-based sampling utilities for the SAE preprocessing pipeline.

Provides functions for selecting representative examples across activation
value distributions using rank-based quantile sampling.
"""

from typing import List, Tuple, TypeVar, Callable, Optional

T = TypeVar('T')


def select_top_k_per_quantile(
    examples: List[T],
    k: int,
    num_quantiles: int = 4,
    key: Optional[Callable[[T], float]] = None
) -> List[T]:
    """Select top k examples per quantile using rank-based sampling.

    Uses rank-based (positional) sampling instead of value-based quantiles
    to handle degenerate distributions where values cluster.

    Args:
        examples: List of items to sample from
        k: Number to select per quantile
        num_quantiles: Number of quantiles to divide into
        key: Optional function to extract sort key (default: use item directly)

    Returns:
        Top k*num_quantiles examples distributed across value range
    """
    if len(examples) == 0:
        return []

    total_target = k * num_quantiles

    # Sort by key descending (highest values first)
    if key is not None:
        sorted_examples = sorted(examples, key=key, reverse=True)
    else:
        sorted_examples = sorted(examples, reverse=True)

    num_examples = len(sorted_examples)

    if num_examples <= total_target:
        return sorted_examples

    # Rank-based sampling: divide into equal-sized groups by position
    group_size = num_examples // num_quantiles
    selected = []

    for i in range(num_quantiles):
        start_idx = i * group_size
        # Last group gets any remainder
        end_idx = start_idx + group_size if i < num_quantiles - 1 else num_examples
        group = sorted_examples[start_idx:end_idx]
        # Take top k from each group (already sorted desc)
        selected.extend(group[:k])

    return selected


def select_top_k_per_quantile_tuples(
    examples: List[Tuple],
    k: int,
    num_quantiles: int = 4,
    value_index: int = 1
) -> List[Tuple]:
    """Select top k examples per quantile for tuple-based data.

    Specialized version for activation examples which are typically tuples of:
    (prompt_id, max_activation, prompt_tokens, max_token_pos)

    Args:
        examples: List of tuples
        k: Number to select per quantile
        num_quantiles: Number of quantiles
        value_index: Index of the value to sort by (default: 1 for max_activation)

    Returns:
        Selected tuples distributed across activation range
    """
    return select_top_k_per_quantile(
        examples,
        k,
        num_quantiles,
        key=lambda x: x[value_index]
    )


def get_quantile_boundaries(values: List[float], num_quantiles: int) -> List[float]:
    """Calculate quantile boundaries for a list of values.

    Args:
        values: List of numeric values
        num_quantiles: Number of quantiles

    Returns:
        List of boundary values (length = num_quantiles - 1)
    """
    if len(values) < num_quantiles:
        return []

    import numpy as np
    quantile_points = [i / num_quantiles for i in range(1, num_quantiles)]
    return [float(np.quantile(values, q)) for q in quantile_points]


def assign_quantile_index(
    value: float,
    values: List[float],
    num_quantiles: int
) -> int:
    """Assign a quantile index to a value based on rank.

    Uses rank-based assignment rather than value-based to handle
    degenerate distributions.

    Args:
        value: The value to assign
        values: All values (for determining rank)
        num_quantiles: Number of quantiles

    Returns:
        Quantile index (0 to num_quantiles - 1)
    """
    num_values = len(values)
    if num_values <= num_quantiles:
        # Find position in sorted list
        sorted_values = sorted(values, reverse=True)
        try:
            idx = sorted_values.index(value)
            return min(idx, num_quantiles - 1)
        except ValueError:
            return 0

    # Sort descending and find rank
    sorted_values = sorted(values, reverse=True)
    try:
        rank = sorted_values.index(value)
    except ValueError:
        return 0

    group_size = num_values // num_quantiles
    return min(rank // group_size, num_quantiles - 1)


def stratified_sample(
    items: List[T],
    n_samples: int,
    key: Callable[[T], float]
) -> List[T]:
    """Sample items with stratification across value distribution.

    Ensures samples are drawn evenly across the range of values.

    Args:
        items: List of items to sample from
        n_samples: Target number of samples
        key: Function to extract sort key

    Returns:
        Stratified sample of items
    """
    if len(items) <= n_samples:
        return items

    # Sort by key descending
    sorted_items = sorted(items, key=key, reverse=True)

    # Select evenly spaced items
    step = len(sorted_items) / n_samples
    return [sorted_items[int(i * step)] for i in range(n_samples)]
