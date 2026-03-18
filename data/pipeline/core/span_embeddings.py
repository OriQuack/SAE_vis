"""
Span embedding utilities for the SAE preprocessing pipeline.

Provides sentence encoder loading, multi-resolution span extraction,
batch encoding, cross-example span matching, and discriminative token analysis.
"""

import logging
from typing import Dict, List, Set, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# Common English stopwords + punctuation tokens.
# Sufficient for a conference prototype.
STOPWORDS: Set[str] = {
    # Function words
    "the", "a", "an", "and", "or", "but", "if", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "can", "could", "not", "no", "it", "its", "this",
    "that", "these", "those", "i", "you", "he", "she", "we", "they", "me", "him",
    "her", "us", "them", "my", "your", "his", "our", "their", "what", "which",
    "who", "whom", "how", "when", "where", "why", "all", "each", "every", "both",
    "few", "more", "most", "other", "some", "such", "than", "too", "very", "so",
    "just", "about", "also", "then", "there", "here", "up", "out", "into",
    # Punctuation and whitespace
    ".", ",", "!", "?", ";", ":", "'", '"', "(", ")", "[", "]", "{", "}",
    "-", "—", "–", "/", "\\", "@", "#", "$", "%", "^", "&", "*", "+", "=",
    "<", ">", "|", "~", "`", "\n", "\t", " ", "",
}


def load_sentence_encoder(model_name: str = "all-MiniLM-L6-v2"):
    """Load a sentence transformer model.

    Args:
        model_name: Model name or path for SentenceTransformer.

    Returns:
        SentenceTransformer model instance.
    """
    from sentence_transformers import SentenceTransformer
    logger.info(f"Loading sentence encoder: {model_name}")
    model = SentenceTransformer(model_name)
    logger.info(f"Loaded sentence encoder (dim={model.get_sentence_embedding_dimension()})")
    return model


def detokenize_span(tokens: List[str], start: int, end: int) -> str:
    """Detokenize a span of tokens into natural text.

    Handles SentencePiece '▁' prefix as word boundary marker.

    Args:
        tokens: Full token list
        start: Start index (inclusive)
        end: End index (exclusive)

    Returns:
        Detokenized text string
    """
    parts = []
    for t in tokens[start:end]:
        if t.startswith('▁'):
            stripped = t.lstrip('▁')
            if stripped:
                if parts:
                    parts.append(' ')
                parts.append(stripped)
            else:
                parts.append(' ')
        else:
            parts.append(t)
    return ''.join(parts).strip()


def extract_spans(
    tokens: List[str],
    max_pos: int,
    span_size: int,
) -> List[Dict]:
    """Extract spans centered on max_pos with appropriate stride.

    Args:
        tokens: Full token list
        max_pos: Center position (max activation token)
        span_size: Number of tokens per span

    Returns:
        List of {start, end, text} dicts.
        span_size=1: single activated token
        span_size=8: stride=4
        span_size=16: stride=8
        span_size=32: full example (1 span)
    """
    num_tokens = len(tokens)

    if span_size == 1:
        pos = min(max_pos, num_tokens - 1)
        text = detokenize_span(tokens, pos, pos + 1)
        return [{"start": pos, "end": pos + 1, "text": text}]

    if span_size >= num_tokens:
        text = detokenize_span(tokens, 0, num_tokens)
        return [{"start": 0, "end": num_tokens, "text": text}]

    # Determine stride
    if span_size <= 8:
        stride = 4
    elif span_size <= 16:
        stride = 8
    else:
        stride = span_size  # span_size=32: no overlap

    # Generate spans centered around max_pos
    half = span_size // 2
    center_start = max(0, max_pos - half)
    center_start = min(center_start, num_tokens - span_size)

    spans = []
    seen_starts = set()

    # Start from center and expand outward
    start = center_start
    while start >= 0:
        if start not in seen_starts:
            end = min(start + span_size, num_tokens)
            text = detokenize_span(tokens, start, end)
            spans.append({"start": start, "end": end, "text": text})
            seen_starts.add(start)
        start -= stride

    start = center_start + stride
    while start + span_size <= num_tokens:
        if start not in seen_starts:
            end = start + span_size
            text = detokenize_span(tokens, start, end)
            spans.append({"start": start, "end": end, "text": text})
            seen_starts.add(start)
        start += stride

    # Sort by start position
    spans.sort(key=lambda s: s["start"])
    return spans


def batch_encode_spans(model, texts: List[str], batch_size: int = 256) -> np.ndarray:
    """Encode all span texts in batches.

    Args:
        model: SentenceTransformer model
        texts: List of text strings to encode
        batch_size: Batch size for encoding

    Returns:
        numpy array of shape (len(texts), embedding_dim)
    """
    if not texts:
        return np.array([])

    return model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        normalize_embeddings=True,
    )


def compute_cross_example_span_scores(
    embeddings_by_example: List[np.ndarray],
    spans_by_example: List[List[Dict]],
) -> List[List[float]]:
    """Compute cross-example span matching scores.

    For each example i's each span a:
      score(i,a) = mean_{j!=i}(max_b(cosine(embed(i,a), embed(j,b))))

    Args:
        embeddings_by_example: List of arrays, each (num_spans_i, embed_dim)
        spans_by_example: Parallel list of span dicts per example

    Returns:
        Nested list: [example_idx][span_idx] -> float score
    """
    n_examples = len(embeddings_by_example)
    if n_examples < 2:
        return [[0.0] * len(spans) for spans in spans_by_example]

    scores = []
    for i in range(n_examples):
        embs_i = embeddings_by_example[i]
        if len(embs_i) == 0:
            scores.append([])
            continue

        span_scores = []
        for a in range(len(embs_i)):
            # For each span a in example i, compute mean over j!=i of max_b(cosine)
            cross_scores = []
            for j in range(n_examples):
                if j == i:
                    continue
                embs_j = embeddings_by_example[j]
                if len(embs_j) == 0:
                    cross_scores.append(0.0)
                    continue
                # cosine similarity (embeddings are already L2-normalized)
                sims = embs_i[a] @ embs_j.T
                cross_scores.append(float(np.max(sims)))

            span_scores.append(float(np.mean(cross_scores)) if cross_scores else 0.0)

        scores.append(span_scores)

    return scores


def compute_pairwise_avg_sim(embeddings: np.ndarray) -> float:
    """Compute average pairwise cosine similarity.

    Args:
        embeddings: Array of shape (N, dim), L2-normalized

    Returns:
        Average pairwise similarity (excluding self-pairs)
    """
    n = len(embeddings)
    if n < 2:
        return 0.0

    # Cosine similarity matrix (embeddings are L2-normalized)
    sim_matrix = embeddings @ embeddings.T
    # Extract upper triangle (excluding diagonal)
    total = 0.0
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            total += sim_matrix[i, j]
            count += 1

    return float(total / count) if count > 0 else 0.0


def compute_discriminative_tokens(
    examples: List[Tuple],
    window_size: int = 32,
    min_example_count: int = 3,
) -> Dict[str, float]:
    """Find tokens appearing in >= min_example_count examples. No stopword filter.

    Raw frequency is stored; IDF weighting is applied separately via
    compute_token_idf_scores() so the backend can combine them flexibly.

    Args:
        examples: List of (prompt_id, max_act, tokens, max_pos) tuples
        window_size: Token window size around max activation
        min_example_count: Minimum number of distinct examples

    Returns:
        Dict mapping normalized token -> example_count / num_examples
    """
    from .tokens import extract_token_window

    num_examples = len(examples)
    if num_examples == 0:
        return {}

    # Count in how many distinct examples each token appears
    token_example_sets: Dict[str, set] = {}

    for prompt_id, _, tokens, max_pos in examples:
        window = extract_token_window(tokens, max_pos, window_size)
        seen_in_example: Set[str] = set()
        for token in window:
            normalized = token.lstrip('▁').strip().lower()
            if not normalized:
                continue
            if normalized not in seen_in_example:
                seen_in_example.add(normalized)
                if normalized not in token_example_sets:
                    token_example_sets[normalized] = set()
                token_example_sets[normalized].add(prompt_id)

    result = {}
    for token, example_set in token_example_sets.items():
        if len(example_set) >= min_example_count:
            result[token] = len(example_set) / num_examples

    return result


def build_global_token_idf(
    examples_df,
) -> Dict[str, float]:
    """Build global IDF lookup from all features' activation examples.

    Uses vectorized Polars operations for performance:
    explode tokens → normalize → deduplicate per feature → count features per token → IDF.

    Uses full token list (not windowed) for simplicity — IDF measures global
    token rarity across features, so the window matters less than for
    per-feature discriminative scoring.

    IDF(token) = log(total_features / (1 + num_features_containing_token))

    Args:
        examples_df: Polars DataFrame with columns: feature_id, prompt_tokens

    Returns:
        Dict mapping normalized_token -> IDF value
    """
    import math
    import polars as pl

    logger.info("Building global token IDF (vectorized Polars)...")

    # Explode tokens, normalize, deduplicate per feature, count
    token_counts = (
        examples_df
        .select(["feature_id", "prompt_tokens"])
        .explode("prompt_tokens")
        .with_columns(
            pl.col("prompt_tokens")
            .str.strip_chars("▁ ")
            .str.to_lowercase()
            .alias("norm")
        )
        .filter(pl.col("norm") != "")
        .unique(["feature_id", "norm"])
        .group_by("norm")
        .agg(pl.col("feature_id").n_unique().alias("feat_count"))
    )

    total_features = examples_df["feature_id"].n_unique()
    logger.info(f"Total features: {total_features:,}, unique tokens: {len(token_counts):,}")

    # Build IDF lookup
    idf_lookup = {}
    for row in token_counts.to_dicts():
        idf_lookup[row["norm"]] = math.log(total_features / (1 + row["feat_count"]))

    logger.info(f"Built IDF for {len(idf_lookup):,} tokens across {total_features:,} features")
    return idf_lookup


def compute_token_idf_scores(
    tokens: List[str],
    idf_lookup: Dict[str, float],
) -> List[float]:
    """Per-token IDF weight from global lookup.

    Args:
        tokens: Token strings for this example
        idf_lookup: {normalized_token: IDF value}

    Returns:
        List of floats, length = len(tokens)
    """
    scores = [0.0] * len(tokens)
    for j, token in enumerate(tokens):
        normalized = token.lstrip('▁').strip().lower()
        if normalized in idf_lookup:
            scores[j] = idf_lookup[normalized]
    return scores
