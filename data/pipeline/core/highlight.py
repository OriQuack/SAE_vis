"""
Per-component highlight scoring functions for the SAE preprocessing pipeline.

Each function computes a separate component score array (one float per token).
Components are stored individually — no combining at the pipeline level.
Backend normalizes/combines them before serving to the frontend.
"""

from typing import Dict, List


def compute_word_ngram_scores(
    num_tokens: int,
    prompt_id: int,
    common_ngrams: Dict[str, Dict],
    num_examples: int
) -> List[float]:
    """Per-token score from common word n-gram participation.

    For each token j:
      score[j] = max(count / num_examples) across all common word n-grams covering j.

    Uses max (not sum) because overlapping n-grams at the same position are
    redundant evidence, not independent evidence. This keeps scores in [0, 1].

    Args:
        num_tokens: Total number of tokens in the example
        prompt_id: Prompt ID to look up positions for
        common_ngrams: Dict of common n-grams filtered to type=="word".
            Each value has "count", "type", "ngram_size",
            "positions": {prompt_id: [(token_pos, None), ...]}
        num_examples: Total number of examples (for normalization)

    Returns:
        List of floats, length = num_tokens, values in [0, 1]
    """
    scores = [0.0] * num_tokens

    for ngram_data in common_ngrams.values():
        positions = ngram_data.get("positions", {}).get(prompt_id, [])
        if not positions:
            continue

        contribution = ngram_data["count"] / num_examples
        ngram_size = ngram_data.get("ngram_size", 1)

        for token_pos, _ in positions:
            for j in range(token_pos, min(token_pos + ngram_size, num_tokens)):
                if contribution > scores[j]:
                    scores[j] = contribution

    return scores


def compute_char_ngram_scores(
    num_tokens: int,
    prompt_id: int,
    common_ngrams: Dict[str, Dict],
    num_examples: int
) -> List[float]:
    """Per-token score from common char n-gram participation.

    For each token j:
      score[j] = max(count / num_examples) across all common char n-grams in j.

    Uses max (not sum) because overlapping char n-grams within a token are
    redundant evidence. A long token like "available" may host 30+ char n-grams
    of sizes 2-8, but the strongest one captures the signal. Keeps scores in [0, 1].

    Args:
        num_tokens: Total number of tokens in the example
        prompt_id: Prompt ID to look up positions for
        common_ngrams: Dict of common n-grams filtered to type=="char".
            Each value has "count", "type",
            "positions": {prompt_id: [(token_pos, char_offset), ...]}
        num_examples: Total number of examples (for normalization)

    Returns:
        List of floats, length = num_tokens, values in [0, 1]
    """
    scores = [0.0] * num_tokens

    for ngram_data in common_ngrams.values():
        positions = ngram_data.get("positions", {}).get(prompt_id, [])
        if not positions:
            continue

        contribution = ngram_data["count"] / num_examples

        seen_positions = set()
        for token_pos, _ in positions:
            if token_pos not in seen_positions and 0 <= token_pos < num_tokens:
                if contribution > scores[token_pos]:
                    scores[token_pos] = contribution
                seen_positions.add(token_pos)

    return scores


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
