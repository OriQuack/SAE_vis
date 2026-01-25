"""
Pattern type utility functions.

Provides dynamic pattern_type computation that was previously done in preprocessing.
This allows changing thresholds without regenerating parquet files.

Also provides utility for selecting the longest n-gram above a Jaccard threshold
from per-k Jaccard values.
"""

from typing import Dict, List, Optional

# =============================================================================
# Default thresholds for pattern type classification
# Separate thresholds for intra-feature (within a feature's activations) and
# inter-feature (between two features' activations) comparisons
# =============================================================================

# Intra-feature thresholds (comparing activations within the same feature)
# These tend to be higher since same-feature activations should be more similar
INTRA_SEMANTIC_THRESHOLD = 0.6
INTRA_LEXICAL_THRESHOLD = 0.5
INTRA_NGRAM_JACCARD_THRESHOLD = 0.5

# Inter-feature thresholds (comparing activations between different features)
# These can be lower since cross-feature patterns are typically weaker
INTER_SEMANTIC_THRESHOLD = 0.6
INTER_LEXICAL_THRESHOLD = 0.2
INTER_NGRAM_JACCARD_THRESHOLD = 0.2


def compute_pattern_type(
    semantic_sim: Optional[float],
    char_jaccard: Optional[float],
    word_jaccard: Optional[float],
    semantic_threshold: Optional[float] = None,
    lexical_threshold: Optional[float] = None,
    is_inter: bool = False
) -> str:
    """
    Compute pattern type from raw similarity values.

    This replaces the hardcoded classification in step_10 and step_11 preprocessing,
    allowing dynamic threshold adjustment at runtime.

    Args:
        semantic_sim: Semantic embedding similarity (avg pairwise for intra, direct for inter)
        char_jaccard: Character n-gram Jaccard similarity
        word_jaccard: Word n-gram Jaccard similarity
        semantic_threshold: Threshold for semantic classification (default depends on is_inter)
        lexical_threshold: Threshold for lexical classification (default depends on is_inter)
        is_inter: If True, use inter-feature thresholds; if False, use intra-feature thresholds

    Returns:
        Pattern type: "Semantic", "Lexical", "Both", or "None"
    """
    # Select appropriate default thresholds based on comparison type
    if semantic_threshold is None:
        semantic_threshold = INTER_SEMANTIC_THRESHOLD if is_inter else INTRA_SEMANTIC_THRESHOLD
    if lexical_threshold is None:
        lexical_threshold = INTER_LEXICAL_THRESHOLD if is_inter else INTRA_LEXICAL_THRESHOLD

    has_semantic = (semantic_sim or 0) >= semantic_threshold
    has_lexical = max(char_jaccard or 0, word_jaccard or 0) >= lexical_threshold

    if has_semantic and has_lexical:
        return "Both"
    elif has_semantic:
        return "Semantic"
    elif has_lexical:
        return "Lexical"
    return "None"


def select_longest_ngram_above_threshold(
    per_k_jaccard: Optional[Dict],
    per_k_ngrams: Optional[List[Dict]],
    threshold: Optional[float] = None,
    is_inter: bool = False
) -> Optional[Dict]:
    """Select the longest n-gram with Jaccard >= threshold.

    This enables displaying the most meaningful n-gram pattern by choosing
    the longest (most specific) n-gram that still has significant overlap,
    rather than just the n-gram with highest Jaccard (which is often short).

    Args:
        per_k_jaccard: Dict mapping k-size → Jaccard value
                       (e.g., {2: 0.3, 3: 0.5, 4: 0.4, 5: 0.2})
                       Or struct with k2, k3, k4, k5 fields
        per_k_ngrams: List of {k/ngram_size, ngram, ...} dicts
        threshold: Minimum Jaccard to consider (default depends on is_inter)
        is_inter: If True, use inter-feature threshold; if False, use intra-feature threshold

    Returns:
        The n-gram dict for largest k above threshold, or None if none qualify
    """
    # Select appropriate default threshold based on comparison type
    if threshold is None:
        threshold = INTER_NGRAM_JACCARD_THRESHOLD if is_inter else INTRA_NGRAM_JACCARD_THRESHOLD
    if not per_k_jaccard or not per_k_ngrams:
        return None

    # Handle both dict format and struct format from parquet
    # Struct format has keys like "k2", "k3", etc.
    jaccard_by_k = {}
    for key, value in per_k_jaccard.items():
        if isinstance(key, str) and key.startswith("k"):
            # Struct format: "k2" -> 2
            try:
                k = int(key[1:])
                if value is not None:
                    jaccard_by_k[k] = value
            except (ValueError, TypeError):
                pass
        elif isinstance(key, int):
            # Dict format: 2 -> value
            if value is not None:
                jaccard_by_k[key] = value

    if not jaccard_by_k:
        return None

    # Find valid k-sizes above threshold
    valid_k = [k for k, v in jaccard_by_k.items() if v >= threshold]
    if not valid_k:
        return None

    # Get largest k (longest n-gram)
    target_k = max(valid_k)

    # Find corresponding n-gram
    for ng in per_k_ngrams:
        # Handle both "k" and "ngram_size" field names
        k = ng.get("k") or ng.get("ngram_size")
        if k == target_k:
            return ng

    return None


def get_best_ngram_text(
    per_k_jaccard: Optional[Dict],
    per_k_ngrams: Optional[List[Dict]],
    fallback_text: Optional[str] = None,
    threshold: Optional[float] = None,
    is_inter: bool = False
) -> Optional[str]:
    """Get the text of the longest n-gram above threshold, with fallback.

    Convenience function that extracts just the n-gram text string.

    Args:
        per_k_jaccard: Dict mapping k-size → Jaccard value
        per_k_ngrams: List of {k/ngram_size, ngram, ...} dicts
        fallback_text: Text to return if no n-gram qualifies (e.g., overall top n-gram)
        threshold: Minimum Jaccard to consider (default depends on is_inter)
        is_inter: If True, use inter-feature threshold; if False, use intra-feature threshold

    Returns:
        N-gram text string, or fallback_text if none qualify
    """
    best_ngram = select_longest_ngram_above_threshold(
        per_k_jaccard, per_k_ngrams, threshold, is_inter
    )
    if best_ngram:
        return best_ngram.get("ngram")
    return fallback_text


def get_best_ngram_with_positions(
    per_k_jaccard: Optional[Dict],
    per_k_ngrams: Optional[List[Dict]],
    threshold: Optional[float] = None,
    is_inter: bool = False
) -> Optional[Dict]:
    """Get the longest n-gram above threshold WITH its full position data.

    This is used to replace positions in quantile_examples with positions
    from the selected best n-gram (longest above threshold), so highlighting
    matches the displayed n-gram text.

    Args:
        per_k_jaccard: Dict mapping k-size → Jaccard value
        per_k_ngrams: List of {k/ngram_size, ngram, occurrences: [...]} dicts
        threshold: Minimum Jaccard to consider (default depends on is_inter)
        is_inter: If True, use inter-feature threshold; if False, use intra-feature threshold

    Returns:
        Full n-gram dict with 'ngram', 'ngram_size'/'k', and 'occurrences',
        or None if no n-gram qualifies
    """
    return select_longest_ngram_above_threshold(
        per_k_jaccard, per_k_ngrams, threshold, is_inter
    )
