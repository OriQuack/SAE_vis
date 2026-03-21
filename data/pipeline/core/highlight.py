"""
Per-component highlight scoring functions for the SAE preprocessing pipeline.

Context components (C1 span, C2 discriminative) produce per-token dense arrays.
Syntax components (S1 n-gram, S2 dep/ast) use set-based format — no dense arrays.
"""

from typing import Dict, List


def compute_span_token_scores(
    num_tokens: int,
    span_scores: List[float],
    spans: List[Dict],
) -> List[float]:
    """Map span-level scores to per-token scores.

    Each token gets the max score of all spans containing it.

    Args:
        num_tokens: Total number of tokens
        span_scores: Per-span cross-example matching scores
        spans: List of span dicts with "start" and "end" token indices

    Returns:
        List of floats, length = num_tokens
    """
    scores = [0.0] * num_tokens

    for span, score in zip(spans, span_scores):
        start = span["start"]
        end = span["end"]
        for j in range(max(0, start), min(end, num_tokens)):
            if score > scores[j]:
                scores[j] = score

    return scores


def compute_discriminative_scores(
    tokens: List[str],
    discriminative_tokens: Dict[str, float],
) -> List[float]:
    """Per-token score from discriminative token analysis.

    Args:
        tokens: Token strings for this example
        discriminative_tokens: {normalized_token: example_count / num_examples}

    Returns:
        List of floats, length = len(tokens)
    """
    scores = [0.0] * len(tokens)

    for j, token in enumerate(tokens):
        # Normalize: strip SentencePiece marker, lowercase
        normalized = token.lstrip('▁').strip().lower()
        if normalized in discriminative_tokens:
            scores[j] = discriminative_tokens[normalized]

    return scores
