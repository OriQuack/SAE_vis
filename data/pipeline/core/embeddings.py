"""
Embedding utilities for the SAE preprocessing pipeline.

Provides functions for loading pre-computed embeddings, computing
pairwise similarity metrics, and applying EmbeddingGemma projection layers.
"""

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import polars as pl

logger = logging.getLogger(__name__)


def get_projection_modules(model):
    """Get EmbeddingGemma projection modules from SentenceTransformer model.

    EmbeddingGemma module structure:
    [0] Transformer, [1] Pooling, [2] Dense(768→3072), [3] Dense(3072→768), [4] Normalize

    Args:
        model: SentenceTransformer model instance

    Returns:
        Tuple of (dense1, dense2, normalize) modules
    """
    return model[2], model[3], model[4]


def apply_projection_layers(
    embedding: np.ndarray,
    model,
    dense1,
    dense2,
    normalize
) -> np.ndarray:
    """Apply EmbeddingGemma's projection layers to pooled embedding.

    After pooling token embeddings, this applies the Dense and Normalize
    modules to transform the embedding into semantic similarity space.

    Args:
        embedding: Shape (embedding_dim,) - pooled embedding
        model: SentenceTransformer model (for device detection)
        dense1: First Dense module (768 → 3072)
        dense2: Second Dense module (3072 → 768)
        normalize: Normalize module (L2)

    Returns:
        L2-normalized embedding in semantic similarity space
    """
    import torch

    device = next(model.parameters()).device
    embedding_tensor = torch.tensor(embedding, dtype=torch.float32).unsqueeze(0).to(device)

    features = {"sentence_embedding": embedding_tensor}
    features = dense1(features)
    features = dense2(features)
    features = normalize(features)

    return features["sentence_embedding"].squeeze(0).cpu().detach().numpy()


def load_embeddings_for_feature(
    embeddings_df: pl.DataFrame,
    feature_id: int
) -> Tuple[List[int], Optional[np.ndarray]]:
    """Load pre-computed embeddings for a feature.

    Args:
        embeddings_df: DataFrame with embeddings (columns: feature_id, prompt_ids, embeddings)
        feature_id: Feature ID to look up

    Returns:
        Tuple of (prompt_ids list, embeddings array) or ([], None) if not found
    """
    feature_embeddings = embeddings_df.filter(pl.col("feature_id") == feature_id)

    if len(feature_embeddings) == 0:
        logger.warning(f"No pre-computed embeddings found for feature {feature_id}")
        return [], None

    # Extract prompt IDs and embeddings
    stored_prompt_ids = feature_embeddings["prompt_ids"][0]
    stored_embeddings = feature_embeddings["embeddings"][0]

    # Convert to proper types
    if hasattr(stored_prompt_ids, 'to_list'):
        prompt_ids = stored_prompt_ids.to_list()
    else:
        prompt_ids = list(stored_prompt_ids)

    # Convert embeddings to numpy array
    embeddings = np.array(stored_embeddings)

    return prompt_ids, embeddings


def create_embedding_map(
    embeddings_df: pl.DataFrame,
    feature_id: int
) -> Dict[int, np.ndarray]:
    """Create a mapping from prompt_id to embedding for a feature.

    Args:
        embeddings_df: DataFrame with embeddings
        feature_id: Feature ID to look up

    Returns:
        Dictionary mapping prompt_id to embedding vector
    """
    prompt_ids, embeddings = load_embeddings_for_feature(embeddings_df, feature_id)

    if embeddings is None:
        return {}

    return {pid: emb for pid, emb in zip(prompt_ids, embeddings)}


def compute_pairwise_cosine_similarity(
    embeddings_a: np.ndarray,
    embeddings_b: np.ndarray
) -> Tuple[float, float]:
    """Compute mean and std pairwise cosine similarity between two sets of embeddings.

    Args:
        embeddings_a: First set of embeddings (N x D)
        embeddings_b: Second set of embeddings (M x D)

    Returns:
        Tuple of (mean similarity, std similarity)
    """
    from sklearn.metrics.pairwise import cosine_similarity

    sim_matrix = cosine_similarity(embeddings_a, embeddings_b)

    # Flatten all pairwise similarities
    all_sims = sim_matrix.flatten()

    return float(np.mean(all_sims)), float(np.std(all_sims))


def compute_intra_feature_semantic_similarity(
    embeddings_df: pl.DataFrame,
    feature_id: int,
    prompt_ids: List[int]
) -> Tuple[Optional[float], Optional[float]]:
    """Compute average pairwise cosine similarity within a feature's examples.

    Args:
        embeddings_df: DataFrame with pre-computed embeddings
        feature_id: Feature ID to analyze
        prompt_ids: List of prompt IDs to use for comparison

    Returns:
        Tuple of (mean, std) pairwise similarity or (None, None) if <2 examples
    """
    if len(prompt_ids) < 2:
        return None, None

    # Get embedding map for this feature
    embedding_map = create_embedding_map(embeddings_df, feature_id)

    if not embedding_map:
        return None, None

    # Collect embeddings for the requested prompt IDs
    embeddings = []
    for prompt_id in prompt_ids:
        if prompt_id in embedding_map:
            embeddings.append(embedding_map[prompt_id])
        else:
            logger.warning(f"Prompt {prompt_id} not found in embeddings for feature {feature_id}")

    if len(embeddings) < 2:
        return None, None

    embeddings = np.array(embeddings)

    # Compute pairwise cosine similarities
    from sklearn.metrics.pairwise import cosine_similarity
    sim_matrix = cosine_similarity(embeddings)

    # Extract upper triangle (excluding diagonal)
    n = len(embeddings)
    pairwise_sims = []
    for i in range(n):
        for j in range(i + 1, n):
            pairwise_sims.append(sim_matrix[i, j])

    if not pairwise_sims:
        return None, None

    return float(np.mean(pairwise_sims)), float(np.std(pairwise_sims))


def compute_cross_feature_semantic_similarity(
    embeddings_df: pl.DataFrame,
    main_feature_id: int,
    main_prompt_ids: List[int],
    other_feature_id: int,
    other_prompt_ids: List[int]
) -> Optional[float]:
    """Compute pairwise semantic similarity between two features' examples.

    Args:
        embeddings_df: DataFrame with pre-computed embeddings
        main_feature_id: Main feature ID
        main_prompt_ids: Prompt IDs for main feature
        other_feature_id: Other feature ID
        other_prompt_ids: Prompt IDs for other feature

    Returns:
        Average pairwise similarity or None if insufficient data
    """
    if len(main_prompt_ids) < 1 or len(other_prompt_ids) < 1:
        return None

    # Get embedding maps
    main_embedding_map = create_embedding_map(embeddings_df, main_feature_id)
    other_embedding_map = create_embedding_map(embeddings_df, other_feature_id)

    if not main_embedding_map or not other_embedding_map:
        return None

    # Collect embeddings
    main_embs = []
    for prompt_id in main_prompt_ids:
        if prompt_id in main_embedding_map:
            main_embs.append(main_embedding_map[prompt_id])

    other_embs = []
    for prompt_id in other_prompt_ids:
        if prompt_id in other_embedding_map:
            other_embs.append(other_embedding_map[prompt_id])

    if len(main_embs) < 1 or len(other_embs) < 1:
        return None

    # Convert to arrays and compute similarity
    main_embs = np.array(main_embs)
    other_embs = np.array(other_embs)

    from sklearn.metrics.pairwise import cosine_similarity
    sim_matrix = cosine_similarity(main_embs, other_embs)

    return float(np.mean(sim_matrix))


def get_embeddings_for_prompts(
    embeddings_df: pl.DataFrame,
    feature_id: int,
    prompt_ids: List[int]
) -> Optional[np.ndarray]:
    """Get embeddings for specific prompt IDs.

    Args:
        embeddings_df: DataFrame with pre-computed embeddings
        feature_id: Feature ID
        prompt_ids: List of prompt IDs to retrieve

    Returns:
        Array of embeddings (N x D) or None if not found
    """
    embedding_map = create_embedding_map(embeddings_df, feature_id)

    if not embedding_map:
        return None

    embeddings = []
    for prompt_id in prompt_ids:
        if prompt_id in embedding_map:
            embeddings.append(embedding_map[prompt_id])
        else:
            logger.warning(f"Prompt {prompt_id} not found in embeddings for feature {feature_id}")
            return None

    if not embeddings:
        return None

    return np.array(embeddings)
