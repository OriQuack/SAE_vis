"""
Shuffle verification utilities for measuring syntax vs context contribution.

Provides word group reconstruction, word-aligned span computation,
inner word shuffle, and outer random token replacement.
"""

import random
from collections import namedtuple
from typing import List, Tuple

# start: first token position (inclusive)
# end: last token position (exclusive)
WordGroup = namedtuple("WordGroup", ["start", "end"])


def build_word_groups(tokens: List[str]) -> List[WordGroup]:
    """Group subword tokens into words based on SentencePiece ▁ prefix.

    Every token belongs to exactly one group. A new group starts when a token
    has the ▁ prefix (word boundary). Continuation tokens without ▁ join the
    current group.

    Args:
        tokens: List of token strings (SentencePiece format)

    Returns:
        List of WordGroup(start, end) covering all positions
    """
    if not tokens:
        return []

    groups = []
    group_start = 0

    for i in range(1, len(tokens)):
        if tokens[i].startswith("▁"):
            groups.append(WordGroup(start=group_start, end=i))
            group_start = i

    # Final group
    groups.append(WordGroup(start=group_start, end=len(tokens)))
    return groups


def find_activated_word_group(word_groups: List[WordGroup], token_position: int) -> int:
    """Find which word group contains the given token position.

    Args:
        word_groups: List of WordGroup
        token_position: Token position to find

    Returns:
        Index into word_groups list, or -1 if not found
    """
    for i, wg in enumerate(word_groups):
        if wg.start <= token_position < wg.end:
            return i
    return -1


def compute_word_aligned_span(
    word_groups: List[WordGroup],
    center_pos: int,
    window_size: int,
    total_tokens: int,
) -> Tuple[int, int]:
    """Compute a word-aligned span centered on a token position.

    1. Compute raw token-level window of window_size centered on center_pos
    2. Expand boundaries to include complete word groups at edges
    3. Clamp to [0, total_tokens)

    Args:
        word_groups: List of WordGroup covering all positions
        center_pos: Token position to center the window on
        window_size: Desired window size in tokens
        total_tokens: Total number of tokens in the sequence

    Returns:
        (span_start, span_end) as token positions (start inclusive, end exclusive)
    """
    half = window_size // 2
    raw_start = max(0, center_pos - half)
    raw_end = min(total_tokens, center_pos + half + 1)

    # Expand to word boundaries
    span_start = raw_start
    span_end = raw_end

    for wg in word_groups:
        # If raw_start falls inside this word group, expand to include it
        if wg.start < raw_start < wg.end:
            span_start = wg.start
        # If raw_end falls inside this word group, expand to include it
        if wg.start < raw_end < wg.end:
            span_end = wg.end

    return span_start, span_end


def create_inner_shuffle(
    token_ids: List[int],
    span_start: int,
    span_end: int,
    word_groups: List[WordGroup],
    activated_group_idx: int,
    rng: random.Random,
) -> List[int]:
    """Shuffle word groups within the span, keeping the activated word fixed.

    The activated word group stays at its original positions. Other word groups
    within the span are randomly permuted among the remaining positions.
    Tokens outside the span are unchanged. Total sequence length is preserved.

    Args:
        token_ids: Full token ID sequence
        span_start: Span start (inclusive)
        span_end: Span end (exclusive)
        word_groups: All word groups for the sequence
        activated_group_idx: Index of the activated word group (position-fixed)
        rng: Random number generator for reproducibility

    Returns:
        New token ID list with inner shuffle applied
    """
    result = list(token_ids)

    # Find word groups within the span
    span_groups = [
        (i, wg)
        for i, wg in enumerate(word_groups)
        if wg.start >= span_start and wg.end <= span_end
    ]

    if len(span_groups) <= 1:
        # Nothing to shuffle
        return result

    # Find the activated word group
    activated_wg = None
    for idx, wg in span_groups:
        if idx == activated_group_idx:
            activated_wg = wg
            break

    if activated_wg is None:
        return result

    # Identify positions in the span: activated positions stay fixed,
    # all other positions get filled with shuffled word group tokens
    activated_positions = set(range(activated_wg.start, activated_wg.end))
    other_positions = [
        p for p in range(span_start, span_end) if p not in activated_positions
    ]

    # Collect token blocks from non-activated groups, then shuffle
    other_blocks = []
    for idx, wg in span_groups:
        if idx != activated_group_idx:
            other_blocks.append(token_ids[wg.start : wg.end])
    rng.shuffle(other_blocks)

    # Flatten shuffled blocks into a single token list
    shuffled_tokens = [t for block in other_blocks for t in block]

    # Place shuffled tokens into the non-activated positions
    for pos, tok in zip(other_positions, shuffled_tokens):
        result[pos] = tok

    return result


def create_outer_random(
    token_ids: List[int],
    span_start: int,
    span_end: int,
    vocab_size: int,
    rng: random.Random,
) -> List[int]:
    """Replace tokens outside the span with random vocabulary tokens.

    Tokens inside [span_start, span_end) are preserved unchanged.
    Position 0 (BOS) is also preserved.

    Args:
        token_ids: Full token ID sequence (with BOS at position 0)
        span_start: Span start (inclusive, in model-space with BOS)
        span_end: Span end (exclusive, in model-space with BOS)
        vocab_size: Vocabulary size for random sampling
        rng: Random number generator for reproducibility

    Returns:
        New token ID list with outer random replacement applied
    """
    result = list(token_ids)
    for i in range(len(result)):
        if i == 0:
            # Preserve BOS
            continue
        if span_start <= i < span_end:
            # Inside span — keep
            continue
        result[i] = rng.randint(0, vocab_size - 1)
    return result
