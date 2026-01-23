"""
N-gram extraction utilities for the SAE preprocessing pipeline.

Provides functions for extracting character-level and word-level n-grams
from tokenized text, along with Jaccard similarity computation.
"""

from collections import defaultdict
from typing import Dict, List, Set, Tuple, Optional

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
        return 1.0  # Both empty = perfect similarity
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
) -> Optional[float]:
    """Compute Jaccard similarity per k-size, return max.

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
        Maximum Jaccard similarity across all k-sizes, or None if empty inputs
    """
    from .tokens import extract_token_window
    import numpy as np

    if not examples_a or not examples_b:
        return None

    # Check if this is intra-feature (same list) comparison
    is_intra_feature = examples_a is examples_b

    # Store (jaccard_score, k_size) tuples to enable tie-breaking by length
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
            per_k_results.append((float(np.mean(pairwise)), k))

    if not per_k_results:
        return None

    # Return max Jaccard; prefer longer n-gram (larger k) on tie
    best = max(per_k_results, key=lambda x: (x[0], x[1]))
    return best[0]
