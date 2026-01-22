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


def compute_pairwise_jaccard(
    ngram_sets_a: List[Set[str]],
    ngram_sets_b: List[Set[str]]
) -> Optional[float]:
    """Compute average pairwise Jaccard similarity between two lists of sets.

    Args:
        ngram_sets_a: List of n-gram sets from first source
        ngram_sets_b: List of n-gram sets from second source

    Returns:
        Average Jaccard similarity or None if empty inputs
    """
    if not ngram_sets_a or not ngram_sets_b:
        return None

    pairwise_jaccards = []
    for set_a in ngram_sets_a:
        for set_b in ngram_sets_b:
            jaccard = compute_jaccard_similarity(set_a, set_b)
            pairwise_jaccards.append(jaccard)

    return sum(pairwise_jaccards) / len(pairwise_jaccards) if pairwise_jaccards else None


def compute_specific_ngram_presence(
    examples: List[Tuple],
    ngram_text: str,
    window_size: int,
    is_word: bool = False,
    ngram_sizes: Optional[List[int]] = None
) -> List[bool]:
    """Check which examples contain a specific n-gram.

    Args:
        examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
        ngram_text: The specific n-gram to search for
        window_size: Token window size around max activation position
        is_word: If True, treat as word n-gram; if False, treat as char n-gram
        ngram_sizes: List of n-gram sizes for extraction (derived from ngram_text if not provided)

    Returns:
        List of booleans indicating presence in each example
    """
    from .tokens import extract_token_window

    if ngram_sizes is None:
        if is_word:
            ngram_sizes = [len(ngram_text.split())]
        else:
            ngram_sizes = [len(ngram_text)]

    presence = []
    for _, _, tokens, max_pos in examples:
        window_tokens = extract_token_window(tokens, max_pos, window_size)

        has_ngram = False
        if is_word:
            word_ngrams = extract_word_ngrams(window_tokens, ngram_sizes)
            has_ngram = ngram_text in word_ngrams
        else:
            char_ngrams = extract_token_char_ngrams(window_tokens, ngram_sizes)
            has_ngram = ngram_text in char_ngrams

        presence.append(has_ngram)

    return presence


def compute_specific_ngram_jaccard(
    examples: List[Tuple],
    ngram_text: str,
    window_size: int,
    is_word: bool = False
) -> Optional[float]:
    """Compute pairwise Jaccard similarity for ONE specific n-gram.

    For each pair of examples, checks if both contain the n-gram.
    Returns the average Jaccard across all pairs (binary presence).

    Args:
        examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
        ngram_text: The specific n-gram to compute Jaccard for
        is_word: If True, treat as word n-gram; if False, treat as char n-gram
        window_size: Token window size around max activation

    Returns:
        Average pairwise Jaccard similarity or None if <2 examples
    """
    if len(examples) < 2 or not ngram_text:
        return None

    # Check which examples contain this n-gram
    presence = compute_specific_ngram_presence(examples, ngram_text, window_size, is_word)

    # Compute pairwise Jaccard (treating as binary: has or doesn't have)
    n = len(presence)
    pairwise_jaccards = []

    for i in range(n):
        for j in range(i + 1, n):
            has_i = presence[i]
            has_j = presence[j]

            if has_i and has_j:
                # Both have it: perfect match
                jaccard = 1.0
            elif not has_i and not has_j:
                # Both don't have it: no similarity
                jaccard = 0.0
            else:
                # One has, one doesn't: no similarity
                jaccard = 0.0

            pairwise_jaccards.append(jaccard)

    if not pairwise_jaccards:
        return None

    return sum(pairwise_jaccards) / len(pairwise_jaccards)


def compute_cross_feature_specific_ngram_jaccard(
    main_examples: List[Tuple],
    selected_examples: List[Tuple],
    ngram_text: str,
    window_size: int,
    is_word: bool = False
) -> Optional[float]:
    """Compute pairwise Jaccard similarity for ONE specific n-gram across two feature's examples.

    For each pair (main_example, selected_example), checks if both contain the n-gram.
    Returns the average Jaccard across all pairs.

    Args:
        main_examples: Examples from main feature
        selected_examples: Examples from selected (similar) feature
        ngram_text: The specific n-gram to compute Jaccard for
        window_size: Token window size around max activation
        is_word: If True, treat as word n-gram; if False, treat as char n-gram

    Returns:
        Average pairwise Jaccard similarity or None if insufficient examples
    """
    if len(main_examples) < 1 or len(selected_examples) < 1 or not ngram_text:
        return None

    # Check which examples contain the n-gram
    main_presence = compute_specific_ngram_presence(
        main_examples, ngram_text, window_size, is_word
    )
    selected_presence = compute_specific_ngram_presence(
        selected_examples, ngram_text, window_size, is_word
    )

    # Compute pairwise Jaccard (binary: has or doesn't have)
    pairwise_jaccards = []
    for has_main in main_presence:
        for has_selected in selected_presence:
            if has_main and has_selected:
                jaccard = 1.0
            elif not has_main and not has_selected:
                jaccard = 0.0
            else:
                jaccard = 0.0
            pairwise_jaccards.append(jaccard)

    if not pairwise_jaccards:
        return None

    return sum(pairwise_jaccards) / len(pairwise_jaccards)


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
