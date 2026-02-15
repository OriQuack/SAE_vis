"""
N-gram extraction utilities for the SAE preprocessing pipeline.

Provides functions for extracting character-level and word-level n-grams
from tokenized text, along with Jaccard similarity computation.
"""

from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from .tokens import normalize_token, reconstruct_words_with_positions


def extract_character_ngrams(text: str, n: int) -> List[str]:
    """Extract character n-grams from text.

    Args:
        text: Input text
        n: N-gram size

    Returns:
        List of character n-grams
    """
    if len(text) < n:
        return []
    return [text[i:i+n] for i in range(len(text) - n + 1)]


def extract_token_char_ngrams(
    tokens: List[str],
    ngram_sizes: List[int]
) -> Dict[str, List[Tuple[int, str, int]]]:
    """Extract character n-grams from individual tokens (not concatenated).

    Extracts n-grams from each token separately, preserving token boundaries.
    This captures morphological patterns like suffixes and prefixes.

    Args:
        tokens: List of token strings
        ngram_sizes: List of n-gram sizes to extract (e.g., [2, 3, 4])

    Returns:
        Dict mapping n-gram → [(token_index, token_text, char_offset), ...]
        where char_offset is the starting position of the n-gram within the normalized token
    """
    ngram_map = defaultdict(list)

    for token_idx, token in enumerate(tokens):
        # Normalize token (strip '▁' prefix)
        token_normalized = normalize_token(token).lower()

        # Skip very short tokens
        if len(token_normalized) < 2:
            continue

        # Extract character n-grams within this token
        for ngram_size in ngram_sizes:
            if len(token_normalized) >= ngram_size:
                for i in range(len(token_normalized) - ngram_size + 1):
                    ngram = token_normalized[i:i+ngram_size]
                    # Store: (token_index, original_token_text, char_offset)
                    ngram_map[ngram].append((token_idx, token, i))

    return dict(ngram_map)


def extract_token_char_ngrams_simple(
    tokens: List[str],
    ngram_sizes: List[int]
) -> Dict[str, List[Tuple[int, str]]]:
    """Extract character n-grams from tokens (simplified version without char_offset).

    Args:
        tokens: List of token strings
        ngram_sizes: List of n-gram sizes to extract

    Returns:
        Dict mapping n-gram to list of (token_index, original_token)
    """
    ngram_map = defaultdict(list)

    for token_idx, token in enumerate(tokens):
        # Normalize token (strip '▁' prefix)
        token_normalized = normalize_token(token).lower()

        # Extract character n-grams within this token
        for ngram_size in ngram_sizes:
            if len(token_normalized) >= ngram_size:
                for i in range(len(token_normalized) - ngram_size + 1):
                    ngram = token_normalized[i:i+ngram_size]
                    ngram_map[ngram].append((token_idx, token))

    return dict(ngram_map)


def extract_word_ngrams(
    tokens: List[str],
    ngram_sizes: List[int]
) -> Dict[str, List[int]]:
    """Extract word-level n-grams by reconstructing full words from subword tokens.

    Args:
        tokens: List of token strings
        ngram_sizes: List of word n-gram sizes (1=unigram, 2=bigram, etc.)

    Returns:
        Dict mapping word_ngram → [start_token_positions]
    """
    # Reconstruct words with their token positions
    words_with_positions = reconstruct_words_with_positions(tokens)

    if not words_with_positions:
        return {}

    word_ngram_map = defaultdict(list)

    # Extract word n-grams
    for ngram_size in ngram_sizes:
        if len(words_with_positions) >= ngram_size:
            for i in range(len(words_with_positions) - ngram_size + 1):
                # Safety check for index bounds
                if i >= len(words_with_positions) or i + ngram_size > len(words_with_positions):
                    continue

                # Create word n-gram (space-separated, lowercase)
                word_ngram = " ".join([w[0] for w in words_with_positions[i:i+ngram_size]])
                # Use token position of first word in n-gram
                start_token_pos = words_with_positions[i][1]
                word_ngram_map[word_ngram].append(start_token_pos)

    return dict(word_ngram_map)


def compute_jaccard_similarity(set_a: Set[str], set_b: Set[str]) -> float:
    """Compute Jaccard similarity between two sets.

    Args:
        set_a: First set
        set_b: Second set

    Returns:
        Jaccard similarity coefficient (0.0 to 1.0)
    """
    if len(set_a) == 0 and len(set_b) == 0:
        return 0.0  # Both empty = no evidence of similarity
    if len(set_a) == 0 or len(set_b) == 0:
        return 0.0  # One empty, one not

    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


def find_top_ngram(
    ngram_counts: Dict[str, int],
    tie_breaker: str = "length"
) -> Optional[str]:
    """Find the most frequent n-gram with tie-breaking.

    Args:
        ngram_counts: Dictionary mapping n-gram to count
        tie_breaker: "length" prefers longer n-grams, "alpha" uses alphabetical order

    Returns:
        The top n-gram or None if empty
    """
    if not ngram_counts:
        return None

    max_count = max(ngram_counts.values())
    tied_ngrams = [ng for ng, cnt in ngram_counts.items() if cnt == max_count]

    if tie_breaker == "length":
        # Prefer longer n-grams (more specific)
        return max(tied_ngrams, key=lambda x: (len(x.split()) if ' ' in x else len(x), x))
    else:
        # Alphabetical
        return min(tied_ngrams)


def compute_per_k_jaccard_all(
    examples_a: List[Tuple],
    examples_b: List[Tuple],
    ngram_sizes: List[int],
    window_size: int,
    is_word: bool = False
) -> Dict[int, float]:
    """Compute Jaccard similarity for each k-size separately.

    Returns a dictionary mapping k-size to mean Jaccard similarity.
    This enables selecting the "longest n-gram above threshold" for display.

    Args:
        examples_a: List of (prompt_id, activation, tokens, max_pos) tuples
        examples_b: Same format, or same as examples_a for intra-feature
        ngram_sizes: List of n-gram sizes (e.g., [2, 3, 4, 5] for char, [1, 2, 3] for word)
        window_size: Token window size around max activation position
        is_word: If True, extract word n-grams; if False, extract character n-grams

    Returns:
        Dict mapping k-size → mean Jaccard (e.g., {2: 0.3, 3: 0.5, 4: 0.4, 5: 0.2})
    """
    from .tokens import extract_token_window
    import numpy as np

    if not examples_a or not examples_b:
        return {}

    # Check if this is intra-feature (same list) comparison
    is_intra_feature = examples_a is examples_b

    per_k_results = {}

    for k in ngram_sizes:
        # Extract n-gram sets for this k only
        sets_a = []
        for _, _, tokens, max_pos in examples_a:
            window = extract_token_window(tokens, max_pos, window_size)
            if is_word:
                ngrams = extract_word_ngrams(window, [k])
            else:
                ngrams = extract_token_char_ngrams_simple(window, [k])
            sets_a.append(set(ngrams.keys()))

        # For inter-feature, extract sets_b separately
        if is_intra_feature:
            sets_b = sets_a
        else:
            sets_b = []
            for _, _, tokens, max_pos in examples_b:
                window = extract_token_window(tokens, max_pos, window_size)
                if is_word:
                    ngrams = extract_word_ngrams(window, [k])
                else:
                    ngrams = extract_token_char_ngrams_simple(window, [k])
                sets_b.append(set(ngrams.keys()))

        # Compute pairwise Jaccard
        pairwise = []
        for i, set_a in enumerate(sets_a):
            for j, set_b in enumerate(sets_b):
                # For intra-feature, skip self-comparison (same index)
                if is_intra_feature and i >= j:
                    continue
                pairwise.append(compute_jaccard_similarity(set_a, set_b))

        if pairwise:
            per_k_results[k] = float(np.mean(pairwise))

    return per_k_results


def compute_per_k_max_jaccard(
    examples_a: List[Tuple],
    examples_b: List[Tuple],
    ngram_sizes: List[int],
    window_size: int,
    is_word: bool = False
) -> Tuple[Optional[float], Optional[float]]:
    """Compute Jaccard similarity per k-size, return max mean and its corresponding std.

    This addresses the issue where pooling all n-gram sizes together causes
    set cardinality explosion, resulting in very low Jaccard scores even when
    features share the same n-gram/word patterns.

    For intra-feature comparison: pass the same list as examples_a and examples_b
    For inter-feature comparison: pass different lists

    Args:
        examples_a: List of (prompt_id, activation, tokens, max_pos) tuples
        examples_b: Same format, or same as examples_a for intra-feature
        ngram_sizes: List of n-gram sizes (e.g., [2, 3, 4, 5] for char, [1, 2, 3] for word)
        window_size: Token window size around max activation position
        is_word: If True, extract word n-grams; if False, extract character n-grams

    Returns:
        Tuple of (max_mean_jaccard, corresponding_std), or (None, None) if empty inputs
    """
    from .tokens import extract_token_window
    import numpy as np

    if not examples_a or not examples_b:
        return None, None

    # Check if this is intra-feature (same list) comparison
    is_intra_feature = examples_a is examples_b

    # Store (mean, std, k_size) tuples to enable tie-breaking by length
    per_k_results = []

    for k in ngram_sizes:
        # Extract n-gram sets for this k only
        sets_a = []
        for _, _, tokens, max_pos in examples_a:
            window = extract_token_window(tokens, max_pos, window_size)
            if is_word:
                ngrams = extract_word_ngrams(window, [k])
            else:
                ngrams = extract_token_char_ngrams_simple(window, [k])
            sets_a.append(set(ngrams.keys()))

        # For inter-feature, extract sets_b separately
        if is_intra_feature:
            sets_b = sets_a
        else:
            sets_b = []
            for _, _, tokens, max_pos in examples_b:
                window = extract_token_window(tokens, max_pos, window_size)
                if is_word:
                    ngrams = extract_word_ngrams(window, [k])
                else:
                    ngrams = extract_token_char_ngrams_simple(window, [k])
                sets_b.append(set(ngrams.keys()))

        # Compute pairwise Jaccard
        pairwise = []
        for i, set_a in enumerate(sets_a):
            for j, set_b in enumerate(sets_b):
                # For intra-feature, skip self-comparison (same index)
                if is_intra_feature and i >= j:
                    continue
                pairwise.append(compute_jaccard_similarity(set_a, set_b))

        if pairwise:
            per_k_results.append((float(np.mean(pairwise)), float(np.std(pairwise)), k))

    if not per_k_results:
        return None, None

    # Return max Jaccard; prefer longer n-gram (larger k) on tie
    best = max(per_k_results, key=lambda x: (x[0], x[2]))
    return best[0], best[1]


def select_longest_ngram_above_threshold(
    per_k_jaccard: Optional[Dict],
    per_k_ngrams: Optional[List[Dict]],
    threshold: float
) -> Optional[Dict]:
    """
    Select the longest n-gram with Jaccard >= threshold.

    Args:
        per_k_jaccard: Dict mapping k-size to Jaccard value.
            Supports both dict format ({2: 0.3, 3: 0.5}) and struct format ({"k2": 0.3, "k3": 0.5}).
        per_k_ngrams: List of n-gram dicts with keys: ngram, k/ngram_size, occurrences, etc.
        threshold: Minimum Jaccard to consider valid.

    Returns:
        The n-gram dict for largest k above threshold, or None if none qualify.
    """
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


def select_best_ngram(
    word_per_k_jaccard: Optional[Dict],
    word_ngrams: Optional[List[Dict]],
    char_per_k_jaccard: Optional[Dict],
    char_ngrams: Optional[List[Dict]],
    threshold: float
) -> Dict[str, Any]:
    """
    Select ONE best n-gram for display. Prefers word over char (more semantically meaningful).

    This is the unified selection logic used by both Step 10 (intra-feature) and
    Step 11 (inter-feature) to ensure consistent n-gram selection behavior.

    Args:
        word_per_k_jaccard: Word n-gram per-k Jaccard values
        word_ngrams: List of word n-gram dicts with ngram, k/ngram_size, occurrences
        char_per_k_jaccard: Char n-gram per-k Jaccard values
        char_ngrams: List of char n-gram dicts with ngram, k/ngram_size, occurrences
        threshold: Minimum Jaccard to consider valid

    Returns:
        Dict with keys:
        - type: 'word' | 'char' | None
        - text: str | None (the n-gram text)
        - size: int (k value, e.g., 3 for trigram)
        - main_positions: list | None (positions in main feature - for inter-feature)
        - similar_positions: list | None (positions in similar feature - for inter-feature)
        - occurrences: list | None (positions for intra-feature)
    """
    # Try word first (more meaningful)
    best_word = select_longest_ngram_above_threshold(
        word_per_k_jaccard, word_ngrams, threshold
    )
    if best_word and best_word.get("ngram"):
        return {
            "type": "word",
            "text": best_word.get("ngram"),
            "size": best_word.get("ngram_size") or best_word.get("k") or 0,
            "main_positions": best_word.get("main_occurrences"),
            "similar_positions": best_word.get("similar_occurrences"),
            "occurrences": best_word.get("occurrences", []),
        }

    # Fallback to char
    best_char = select_longest_ngram_above_threshold(
        char_per_k_jaccard, char_ngrams, threshold
    )
    if best_char and best_char.get("ngram"):
        return {
            "type": "char",
            "text": best_char.get("ngram"),
            "size": best_char.get("ngram_size") or best_char.get("k") or 0,
            "main_positions": best_char.get("main_occurrences"),
            "similar_positions": best_char.get("similar_occurrences"),
            "occurrences": best_char.get("occurrences", []),
        }

    return {
        "type": None,
        "text": None,
        "size": 0,
        "main_positions": None,
        "similar_positions": None,
        "occurrences": [],
    }
