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
        show_progress_bar=True,
        normalize_embeddings=True,
    )


def find_top_span_sets(
    embeddings_by_example: List[np.ndarray],
    spans_by_example: List[List[Dict]],
    prompt_ids: List[int],
    max_pos_by_example: List[int],
    span_size: int,
    sim_threshold: float = 0.25,
    top_k: int = 2,
) -> List[Dict]:
    """Find top span sets across examples using tree-search.

    A span set is a group of spans (one per example) that are mutually similar.
    The algorithm progressively matches spans across examples, pruning by
    similarity threshold. Examples where no span passes the threshold are
    excluded from the set (the set may have fewer members than total examples).

    Algorithm:
    1. Compare examples[0] vs examples[1]: keep span pairs > sim_threshold
    2. For each surviving set, find best matching span in examples[2],
       keep if avg pairwise sim with existing set members > threshold
    3. Continue through remaining examples, pruning when sim drops
    4. Rank span sets by avg pairwise sim, return top_k

    Args:
        embeddings_by_example: List of arrays, each (num_spans, embed_dim)
        spans_by_example: Parallel list of span dicts per example
        prompt_ids: Prompt ID for each example
        max_pos_by_example: Max activation position per example
        span_size: Size of spans in tokens
        sim_threshold: Minimum cosine similarity to include a span
        top_k: Number of span sets to return

    Returns:
        List of span set dicts, each containing:
        - span_size: int
        - avg_sim: float (average pairwise sim within the set)
        - num_examples: int
        - spans: [{prompt_id, center_offset, start, end}]
    """
    n_examples = len(embeddings_by_example)
    if n_examples < 2:
        return []

    # Skip examples with no spans
    valid = [(i, embeddings_by_example[i], spans_by_example[i])
             for i in range(n_examples) if len(embeddings_by_example[i]) > 0]
    if len(valid) < 2:
        return []

    # Step 1: Seed span sets from first two valid examples
    i0, embs_0, spans_0 = valid[0]
    i1, embs_1, spans_1 = valid[1]

    # Compute all pairwise cosine sims between spans of example 0 and 1
    # (embeddings are L2-normalized)
    sim_matrix = embs_0 @ embs_1.T  # (num_spans_0, num_spans_1)

    # Collect seed sets: pairs of spans exceeding threshold
    seed_sets: List[List[Tuple[int, int]]] = []  # each: [(example_idx, span_idx), ...]
    seed_embs: List[List[np.ndarray]] = []  # embeddings for each set member

    for a in range(len(spans_0)):
        for b in range(len(spans_1)):
            if sim_matrix[a, b] >= sim_threshold:
                seed_sets.append([(i0, a), (i1, b)])
                seed_embs.append([embs_0[a], embs_1[b]])

    if not seed_sets:
        return []

    # Step 2: Expand through remaining examples
    for vi in range(2, len(valid)):
        ex_idx, embs_new, _spans = valid[vi]
        if len(embs_new) == 0:
            continue

        for set_idx in range(len(seed_sets)):
            # Compute avg sim of each new span against all existing set members
            existing_embs = np.array(seed_embs[set_idx])  # (K, dim)
            sims_to_existing = embs_new @ existing_embs.T  # (num_new_spans, K)
            avg_sims = sims_to_existing.mean(axis=1)  # (num_new_spans,)

            best_span = int(np.argmax(avg_sims))
            best_sim = float(avg_sims[best_span])

            if best_sim >= sim_threshold:
                seed_sets[set_idx].append((ex_idx, best_span))
                seed_embs[set_idx].append(embs_new[best_span])

    # Step 3: Compute final avg pairwise sim and build output
    results = []
    for set_idx, members in enumerate(seed_sets):
        if len(members) < 2:
            continue

        # Compute avg pairwise sim
        embs = np.array(seed_embs[set_idx])  # (K, dim)
        sim_mat = embs @ embs.T
        n = len(embs)
        total = 0.0
        count = 0
        for i in range(n):
            for j in range(i + 1, n):
                total += sim_mat[i, j]
                count += 1
        avg_sim = float(total / count) if count > 0 else 0.0

        # Build span entries
        span_entries = []
        for ex_idx, sp_idx in members:
            span = spans_by_example[ex_idx][sp_idx]
            max_pos = max_pos_by_example[ex_idx]
            span_center = (span["start"] + span["end"]) // 2
            center_offset = span_center - max_pos
            span_entries.append({
                "prompt_id": prompt_ids[ex_idx],
                "center_offset": center_offset,
                "start": span["start"],
                "end": span["end"],
            })

        results.append({
            "span_size": span_size,
            "avg_sim": avg_sim,
            "num_examples": len(members),
            "spans": span_entries,
        })

    # Deduplicate: if two sets share the same span in example 0, keep higher avg_sim
    seen_seeds: Dict[Tuple, int] = {}
    deduped = []
    for r in sorted(results, key=lambda x: x["avg_sim"], reverse=True):
        # Use first span as dedup key
        seed_key = (r["spans"][0]["prompt_id"], r["spans"][0]["start"])
        if seed_key not in seen_seeds:
            seen_seeds[seed_key] = len(deduped)
            deduped.append(r)

    # Return top_k by avg_sim (already sorted)
    return deduped[:top_k]


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
