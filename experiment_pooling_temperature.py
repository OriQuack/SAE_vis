#!/usr/bin/env python3
"""
Pooling Temperature Hyperparameter Experiment

Systematic comparison of activation-weighted pooling temperatures for computing
activation example embeddings. Measures intra-feature vs inter-feature cosine
distances to determine optimal temperature for feature discrimination.

Temperatures tested:
  - None (mean pooling, no weighting)
  - 1, 5, 10, 20, 40, 100, 200 (softmax temperatures)

Statistical Methods:
  - Mann-Whitney U test (non-parametric distribution comparison)
  - Cliff's delta (non-parametric effect size)
  - Bootstrap 95% CI for mean difference
  - Separation ratio (inter_mean / intra_mean)

Usage:
    python experiment_pooling_temperature.py
    python experiment_pooling_temperature.py --n-features 500 --n-bootstrap 5000
    python experiment_pooling_temperature.py --output results/pooling_experiment

Author: Research prototype for EuroVIS conference
"""

import argparse
import json
import sys
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import time

import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from scipy import stats
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore', category=FutureWarning)

# =============================================================================
# CONFIGURATION
# =============================================================================
DATA_DIR = Path(__file__).parent / "data" / "intermediate"
ACTIVATION_EXAMPLES_PATH = DATA_DIR / "activation_examples.parquet"

# Temperatures to test (None = mean pooling)
TEMPERATURES: List[Optional[float]] = [None, 1.0, 10.0, 20.0, 40.0, 60.0, 80.0, 100.0, 200.0]

# Experiment parameters
DEFAULT_N_FEATURES = 2000          # Number of features to sample
DEFAULT_N_BOOTSTRAP = 10000       # Bootstrap iterations
DEFAULT_SEED = 42                 # Random seed for reproducibility
TOKEN_WINDOW_SIZE = 32            # Token window around max activation

# Statistical thresholds
ALPHA = 0.05                      # Significance level
CI_LEVEL = 0.95                   # Confidence interval level


@dataclass
class TemperatureResult:
    """Results for a single temperature setting."""
    temperature: Optional[float]
    intra_distances: np.ndarray = field(repr=False)
    inter_distances: np.ndarray = field(repr=False)

    # Descriptive statistics
    intra_mean: float = 0.0
    intra_std: float = 0.0
    intra_median: float = 0.0
    intra_iqr: Tuple[float, float] = (0.0, 0.0)

    inter_mean: float = 0.0
    inter_std: float = 0.0
    inter_median: float = 0.0
    inter_iqr: Tuple[float, float] = (0.0, 0.0)

    # Statistical tests
    mann_whitney_u: float = 0.0
    mann_whitney_p: float = 1.0
    cliffs_delta: float = 0.0
    cliffs_interpretation: str = ""

    # Bootstrap CI
    mean_diff: float = 0.0
    bootstrap_ci_lower: float = 0.0
    bootstrap_ci_upper: float = 0.0

    # Summary metric
    separation_ratio: float = 0.0

    def __post_init__(self):
        """Compute all statistics after initialization."""
        self._compute_descriptive_stats()
        self._compute_mann_whitney()
        self._compute_cliffs_delta()

    def _compute_descriptive_stats(self):
        """Compute descriptive statistics for both distributions."""
        self.intra_mean = float(np.mean(self.intra_distances))
        self.intra_std = float(np.std(self.intra_distances))
        self.intra_median = float(np.median(self.intra_distances))
        self.intra_iqr = (
            float(np.percentile(self.intra_distances, 25)),
            float(np.percentile(self.intra_distances, 75))
        )

        self.inter_mean = float(np.mean(self.inter_distances))
        self.inter_std = float(np.std(self.inter_distances))
        self.inter_median = float(np.median(self.inter_distances))
        self.inter_iqr = (
            float(np.percentile(self.inter_distances, 25)),
            float(np.percentile(self.inter_distances, 75))
        )

        # Separation ratio (higher = better discrimination)
        if self.intra_mean > 0:
            self.separation_ratio = self.inter_mean / self.intra_mean

        self.mean_diff = self.inter_mean - self.intra_mean

    def _compute_mann_whitney(self):
        """Compute Mann-Whitney U test."""
        # Use asymptotic method for large samples
        result = stats.mannwhitneyu(
            self.intra_distances,
            self.inter_distances,
            alternative='less',  # H1: intra < inter (expected)
            method='asymptotic'
        )
        self.mann_whitney_u = float(result.statistic)
        self.mann_whitney_p = float(result.pvalue)

    def _compute_cliffs_delta(self):
        """
        Compute Cliff's delta effect size.

        δ = (# concordant pairs - # discordant pairs) / (n1 * n2)

        Interpretation (Romano et al., 2006):
          |δ| < 0.147: negligible
          |δ| < 0.33: small
          |δ| < 0.474: medium
          |δ| >= 0.474: large
        """
        n1, n2 = len(self.intra_distances), len(self.inter_distances)

        # Efficient computation using broadcasting (memory-efficient chunking)
        chunk_size = 5000
        concordant = 0
        discordant = 0

        for i in range(0, n1, chunk_size):
            chunk_intra = self.intra_distances[i:i+chunk_size, np.newaxis]
            for j in range(0, n2, chunk_size):
                chunk_inter = self.inter_distances[np.newaxis, j:j+chunk_size]
                concordant += np.sum(chunk_intra < chunk_inter)
                discordant += np.sum(chunk_intra > chunk_inter)

        total_pairs = n1 * n2
        self.cliffs_delta = float((concordant - discordant) / total_pairs)

        # Interpretation
        abs_delta = abs(self.cliffs_delta)
        if abs_delta < 0.147:
            self.cliffs_interpretation = "negligible"
        elif abs_delta < 0.33:
            self.cliffs_interpretation = "small"
        elif abs_delta < 0.474:
            self.cliffs_interpretation = "medium"
        else:
            self.cliffs_interpretation = "large"

    def compute_bootstrap_ci(self, n_bootstrap: int = 10000, ci_level: float = 0.95):
        """
        Compute bootstrap confidence interval for mean difference.

        Uses BCa (bias-corrected and accelerated) bootstrap for better coverage.
        """
        rng = np.random.default_rng(DEFAULT_SEED)

        n_intra = len(self.intra_distances)
        n_inter = len(self.inter_distances)

        # Bootstrap resampling
        boot_diffs = np.zeros(n_bootstrap)
        for i in range(n_bootstrap):
            boot_intra = self.intra_distances[rng.choice(n_intra, n_intra, replace=True)]
            boot_inter = self.inter_distances[rng.choice(n_inter, n_inter, replace=True)]
            boot_diffs[i] = np.mean(boot_inter) - np.mean(boot_intra)

        # Percentile CI (simpler than BCa but still robust)
        alpha = 1 - ci_level
        self.bootstrap_ci_lower = float(np.percentile(boot_diffs, 100 * alpha / 2))
        self.bootstrap_ci_upper = float(np.percentile(boot_diffs, 100 * (1 - alpha / 2)))

    @property
    def temp_label(self) -> str:
        """Human-readable temperature label."""
        if self.temperature is None:
            return "mean"
        return f"{self.temperature:.0f}"


def load_sentence_transformer():
    """Load sentence-transformers model for embedding computation.

    Returns:
        Tuple of (model, dense1, dense2, normalize) where the last three
        are the EmbeddingGemma projection modules.
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("Error: sentence-transformers not installed.")
        print("Install with: pip install sentence-transformers")
        sys.exit(1)

    # Use google/embeddinggemma-300m (768D) - same as existing activation_embeddings.parquet
    print("Loading embedding model: google/embeddinggemma-300m")
    model = SentenceTransformer("google/embeddinggemma-300m")

    # Move to GPU if available
    import torch
    if torch.cuda.is_available():
        model = model.to("cuda")
        print("  Using GPU")
    else:
        print("  Using CPU")

    # Extract EmbeddingGemma projection modules
    # Module structure: [0] Transformer, [1] Pooling, [2] Dense(768→3072), [3] Dense(3072→768), [4] Normalize
    dense1, dense2, normalize = model[2], model[3], model[4]
    print("  Extracted projection modules for proper semantic embeddings")

    return model, dense1, dense2, normalize


def reconstruct_text(tokens: List[str]) -> str:
    """
    Reconstruct natural text from SentencePiece tokens.

    Strips '▁' prefix (word boundary marker) and joins subwords.
    """
    result = []
    for token in tokens:
        if token.startswith('▁'):
            if result:
                result.append(' ')
            result.append(token[1:])
        else:
            result.append(token)
    return ''.join(result)


def weighted_pooling(
    token_embeddings: np.ndarray,
    activation_weights: np.ndarray,
    temperature: Optional[float],
    model,
    dense1,
    dense2,
    normalize
) -> np.ndarray:
    """
    Apply activation-weighted pooling with EmbeddingGemma projection layers.

    Args:
        token_embeddings: Shape (num_tokens, embedding_dim)
        activation_weights: Shape (num_tokens,) - raw activation values
        temperature: Softmax temperature (None = mean pooling)
        model: SentenceTransformer model (for device detection)
        dense1: First Dense module (768 → 3072)
        dense2: Second Dense module (3072 → 768)
        normalize: Normalize module (L2)

    Returns:
        L2-normalized embedding vector in semantic similarity space
    """
    import torch

    if temperature is None or np.sum(activation_weights) == 0:
        # Mean pooling
        pooled = np.mean(token_embeddings, axis=0)
    else:
        # Softmax-weighted pooling
        scaled = activation_weights / temperature
        scaled = scaled - np.max(scaled)  # Numerical stability
        weights = np.exp(scaled)
        weights = weights / np.sum(weights)
        pooled = np.sum(token_embeddings * weights[:, np.newaxis], axis=0)

    # Apply EmbeddingGemma projection layers (Dense + Normalize)
    # This transforms embeddings into semantic similarity space
    device = next(model.parameters()).device
    embedding_tensor = torch.tensor(pooled, dtype=torch.float32).unsqueeze(0).to(device)

    features = {"sentence_embedding": embedding_tensor}
    features = dense1(features)
    features = dense2(features)
    features = normalize(features)

    return features["sentence_embedding"].squeeze(0).cpu().detach().numpy().astype(np.float32)


def map_activations_to_tokens(
    activation_pairs: List[Dict],
    window_start: int,
    window_end: int,
    num_tokens: int
) -> np.ndarray:
    """
    Map Gemma activation pairs to embedding token positions.

    Simplified mapping: assumes 1:1 token correspondence within window.
    """
    activations = np.zeros(num_tokens)

    for pair in activation_pairs:
        pos = pair['token_position']
        if window_start <= pos < window_end:
            idx = pos - window_start
            if idx < num_tokens:
                activations[idx] = pair['activation_value']

    return activations


def compute_embeddings_for_temperature(
    model,
    dense1,
    dense2,
    normalize,
    feature_data: Dict[int, List[Dict]],
    temperature: Optional[float],
    window_size: int = TOKEN_WINDOW_SIZE
) -> Dict[int, np.ndarray]:
    """
    Compute embeddings for all features at a given temperature.

    Args:
        model: SentenceTransformer model
        dense1: First Dense projection module
        dense2: Second Dense projection module
        normalize: Normalize module
        feature_data: Dict mapping feature_id -> list of example dicts
        temperature: Pooling temperature (None = mean pooling)
        window_size: Token window size

    Returns:
        Dict mapping feature_id -> (n_examples, embedding_dim) array
    """
    temp_label = "mean" if temperature is None else f"T={temperature}"
    embeddings_by_feature = {}

    for feature_id, examples in tqdm(
        feature_data.items(),
        desc=f"Computing embeddings ({temp_label})",
        leave=False
    ):
        feature_embeddings = []

        for ex in examples:
            tokens = ex['tokens']
            max_pos = ex['max_pos']
            activation_pairs = ex['activation_pairs']

            # Extract window
            half_window = window_size // 2
            window_start = max(0, max_pos - half_window)
            window_end = min(len(tokens), max_pos + half_window)
            window_tokens = tokens[window_start:window_end]
            window_text = reconstruct_text(window_tokens)

            if not window_text.strip():
                continue

            # Get token embeddings
            token_embs = model.encode(
                window_text,
                output_value="token_embeddings",
                convert_to_tensor=False,
                show_progress_bar=False
            )

            # Convert to numpy if tensor
            if hasattr(token_embs, 'cpu'):
                token_embs = token_embs.cpu().numpy()
            elif not isinstance(token_embs, np.ndarray):
                token_embs = np.array(token_embs)

            if len(token_embs) == 0:
                continue

            # Map activations
            activation_weights = map_activations_to_tokens(
                activation_pairs, window_start, window_end, len(token_embs)
            )

            # Apply pooling with projection layers
            embedding = weighted_pooling(
                token_embs, activation_weights, temperature,
                model, dense1, dense2, normalize
            )
            feature_embeddings.append(embedding)

        if feature_embeddings:
            embeddings_by_feature[feature_id] = np.stack(feature_embeddings)

    return embeddings_by_feature


def compute_intra_distances(embeddings_by_feature: Dict[int, np.ndarray]) -> np.ndarray:
    """
    Compute cosine distances between all pairs within each feature.

    Returns:
        1D array of all intra-feature cosine distances
    """
    all_distances = []

    for feature_id, embeddings in embeddings_by_feature.items():
        n = len(embeddings)
        if n < 2:
            continue

        # Cosine similarity matrix
        sim_matrix = cosine_similarity(embeddings)

        # Extract upper triangle (excluding diagonal)
        triu_indices = np.triu_indices(n, k=1)
        similarities = sim_matrix[triu_indices]

        # Convert to distances
        distances = 1 - similarities
        all_distances.extend(distances)

    return np.array(all_distances)


def compute_inter_distances(
    embeddings_by_feature: Dict[int, np.ndarray],
    n_samples: int,
    seed: int = DEFAULT_SEED
) -> np.ndarray:
    """
    Compute cosine distances between random pairs from different features.

    Args:
        embeddings_by_feature: Dict mapping feature_id -> embeddings array
        n_samples: Number of inter-feature pairs to sample
        seed: Random seed

    Returns:
        1D array of inter-feature cosine distances
    """
    rng = np.random.default_rng(seed)

    feature_ids = list(embeddings_by_feature.keys())
    n_features = len(feature_ids)

    if n_features < 2:
        return np.array([])

    distances = []

    for _ in range(n_samples):
        # Sample two different features
        f1, f2 = rng.choice(n_features, 2, replace=False)
        fid1, fid2 = feature_ids[f1], feature_ids[f2]

        # Sample one embedding from each
        emb1 = embeddings_by_feature[fid1]
        emb2 = embeddings_by_feature[fid2]

        idx1 = rng.choice(len(emb1))
        idx2 = rng.choice(len(emb2))

        # Cosine distance
        sim = cosine_similarity(emb1[idx1:idx1+1], emb2[idx2:idx2+1])[0, 0]
        distances.append(1 - sim)

    return np.array(distances)


def load_and_prepare_data(
    n_features: int,
    seed: int = DEFAULT_SEED
) -> Dict[int, List[Dict]]:
    """
    Load activation examples and prepare data for embedding computation.

    Returns:
        Dict mapping feature_id -> list of example dicts
    """
    print(f"Loading activation examples from {ACTIVATION_EXAMPLES_PATH}")
    df = pl.read_parquet(ACTIVATION_EXAMPLES_PATH)
    print(f"  Total examples: {len(df):,}")

    # Get unique features and sample
    unique_features = df["feature_id"].unique().sort().to_list()
    print(f"  Total features: {len(unique_features):,}")

    rng = np.random.default_rng(seed)
    sampled_features = rng.choice(
        unique_features,
        min(n_features, len(unique_features)),
        replace=False
    )
    print(f"  Sampled features: {len(sampled_features):,}")

    # Filter to sampled features
    df = df.filter(pl.col("feature_id").is_in(sampled_features.tolist()))

    # Organize by feature
    feature_data = {}

    for feature_id in tqdm(sampled_features, desc="Preparing data"):
        feature_df = df.filter(pl.col("feature_id") == feature_id)

        examples = []
        for row in feature_df.iter_rows(named=True):
            # Find max activation position
            activation_pairs = row['activation_pairs']
            if not activation_pairs:
                continue

            max_pair = max(activation_pairs, key=lambda x: x['activation_value'])
            max_pos = max_pair['token_position']

            examples.append({
                'tokens': row['prompt_tokens'],
                'max_pos': max_pos,
                'activation_pairs': activation_pairs
            })

        if examples:
            # Limit to 16 examples per feature (matching existing pipeline)
            if len(examples) > 16:
                examples = rng.choice(examples, 16, replace=False).tolist()
            feature_data[int(feature_id)] = examples

    print(f"  Features with data: {len(feature_data):,}")
    return feature_data


def run_experiment(
    n_features: int = DEFAULT_N_FEATURES,
    n_bootstrap: int = DEFAULT_N_BOOTSTRAP,
    seed: int = DEFAULT_SEED
) -> List[TemperatureResult]:
    """
    Run the full pooling temperature experiment.

    Returns:
        List of TemperatureResult objects, one per temperature
    """
    print("=" * 70)
    print("POOLING TEMPERATURE HYPERPARAMETER EXPERIMENT")
    print("=" * 70)
    print(f"Features to sample: {n_features}")
    print(f"Bootstrap iterations: {n_bootstrap}")
    print(f"Temperatures: {[t if t else 'mean' for t in TEMPERATURES]}")
    print()

    # Load model and projection modules
    model, dense1, dense2, normalize = load_sentence_transformer()
    print()

    # Load and prepare data
    feature_data = load_and_prepare_data(n_features, seed)
    print()

    # Count total intra pairs for matching inter samples
    total_intra_pairs = sum(
        len(examples) * (len(examples) - 1) // 2
        for examples in feature_data.values()
        if len(examples) >= 2
    )
    print(f"Total intra-feature pairs: {total_intra_pairs:,}")
    print()

    results = []

    for temperature in TEMPERATURES:
        temp_label = "mean" if temperature is None else f"T={temperature}"
        print(f"Processing temperature: {temp_label}")

        start_time = time.time()

        # Compute embeddings
        embeddings_by_feature = compute_embeddings_for_temperature(
            model, dense1, dense2, normalize, feature_data, temperature
        )

        # Compute distances
        intra_dists = compute_intra_distances(embeddings_by_feature)
        inter_dists = compute_inter_distances(
            embeddings_by_feature,
            n_samples=len(intra_dists),  # Match sample size
            seed=seed
        )

        # Create result object (computes stats automatically)
        result = TemperatureResult(
            temperature=temperature,
            intra_distances=intra_dists,
            inter_distances=inter_dists
        )

        # Compute bootstrap CI
        result.compute_bootstrap_ci(n_bootstrap=n_bootstrap, ci_level=CI_LEVEL)

        elapsed = time.time() - start_time
        print(f"  Completed in {elapsed:.1f}s")
        print(f"  Intra pairs: {len(intra_dists):,}, Inter pairs: {len(inter_dists):,}")
        print(f"  Separation ratio: {result.separation_ratio:.4f}")
        print()

        results.append(result)

    return results


def print_results_table(results: List[TemperatureResult]):
    """Print formatted results table."""
    print("=" * 100)
    print("RESULTS SUMMARY")
    print("=" * 100)
    print()

    # Header
    header = (
        f"{'Temp':>6} | "
        f"{'Intra Mean':>10} | "
        f"{'Inter Mean':>10} | "
        f"{'Sep. Ratio':>10} | "
        f"{'Cliff δ':>8} | "
        f"{'Effect':>10} | "
        f"{'p-value':>12} | "
        f"{'95% CI':>20}"
    )
    print(header)
    print("-" * 100)

    # Find best result (highest separation ratio)
    best_idx = np.argmax([r.separation_ratio for r in results])

    for i, r in enumerate(results):
        marker = " *" if i == best_idx else ""
        p_str = f"<0.001" if r.mann_whitney_p < 0.001 else f"{r.mann_whitney_p:.4f}"
        ci_str = f"[{r.bootstrap_ci_lower:.4f}, {r.bootstrap_ci_upper:.4f}]"

        row = (
            f"{r.temp_label:>6} | "
            f"{r.intra_mean:>10.4f} | "
            f"{r.inter_mean:>10.4f} | "
            f"{r.separation_ratio:>10.4f} | "
            f"{r.cliffs_delta:>8.4f} | "
            f"{r.cliffs_interpretation:>10} | "
            f"{p_str:>12} | "
            f"{ci_str:>20}{marker}"
        )
        print(row)

    print("-" * 100)
    print("* Best separation ratio")
    print()

    # Detailed stats for best
    best = results[best_idx]
    print(f"BEST TEMPERATURE: {best.temp_label}")
    print(f"  Intra-feature: {best.intra_mean:.4f} ± {best.intra_std:.4f} (median: {best.intra_median:.4f})")
    print(f"  Inter-feature: {best.inter_mean:.4f} ± {best.inter_std:.4f} (median: {best.inter_median:.4f})")
    print(f"  Mean difference: {best.mean_diff:.4f}")
    print(f"  Separation ratio: {best.separation_ratio:.4f}")
    print(f"  Cliff's delta: {best.cliffs_delta:.4f} ({best.cliffs_interpretation})")
    print(f"  Mann-Whitney U: {best.mann_whitney_u:.0f}, p < 0.001" if best.mann_whitney_p < 0.001 else f"  Mann-Whitney U: {best.mann_whitney_u:.0f}, p = {best.mann_whitney_p:.4f}")
    print(f"  Bootstrap 95% CI: [{best.bootstrap_ci_lower:.4f}, {best.bootstrap_ci_upper:.4f}]")


def plot_results(results: List[TemperatureResult], output_path: str):
    """Generate visualization plots."""

    _fig, axes = plt.subplots(2, 2, figsize=(14, 12))

    # 1. Separation ratio by temperature
    ax1 = axes[0, 0]
    temps = [r.temp_label for r in results]
    ratios = [r.separation_ratio for r in results]
    best_idx = np.argmax(ratios)

    colors = ['#e74c3c' if i == best_idx else '#3498db' for i in range(len(results))]
    bars = ax1.bar(temps, ratios, color=colors, edgecolor='black', linewidth=0.5)
    ax1.axhline(y=1.0, color='gray', linestyle='--', alpha=0.5, label='No separation')
    ax1.set_xlabel('Pooling Temperature', fontsize=11)
    ax1.set_ylabel('Separation Ratio (inter/intra)', fontsize=11)
    ax1.set_title('Feature Discrimination by Temperature', fontsize=12, fontweight='bold')
    ax1.legend()

    # Add value labels
    for bar, ratio in zip(bars, ratios):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.005,
                f'{ratio:.3f}', ha='center', va='bottom', fontsize=9)

    # 2. Effect size (Cliff's delta) by temperature
    ax2 = axes[0, 1]
    deltas = [r.cliffs_delta for r in results]

    colors = ['#e74c3c' if i == best_idx else '#3498db' for i in range(len(results))]
    bars = ax2.bar(temps, deltas, color=colors, edgecolor='black', linewidth=0.5)

    # Add threshold lines
    ax2.axhline(y=0.474, color='green', linestyle='--', alpha=0.7, label='Large effect')
    ax2.axhline(y=0.33, color='orange', linestyle='--', alpha=0.7, label='Medium effect')
    ax2.axhline(y=0.147, color='red', linestyle='--', alpha=0.7, label='Small effect')

    ax2.set_xlabel('Pooling Temperature', fontsize=11)
    ax2.set_ylabel("Cliff's Delta (effect size)", fontsize=11)
    ax2.set_title('Effect Size by Temperature', fontsize=12, fontweight='bold')
    ax2.legend(loc='lower right', fontsize=9)

    # 3. Distribution comparison for best temperature
    ax3 = axes[1, 0]
    best = results[best_idx]

    ax3.hist(best.intra_distances, bins=50, alpha=0.6, label=f'Intra-feature (n={len(best.intra_distances):,})',
             color='#3498db', density=True, edgecolor='white', linewidth=0.3)
    ax3.hist(best.inter_distances, bins=50, alpha=0.6, label=f'Inter-feature (n={len(best.inter_distances):,})',
             color='#e74c3c', density=True, edgecolor='white', linewidth=0.3)

    ax3.axvline(best.intra_mean, color='#2980b9', linestyle='-', linewidth=2, label=f'Intra mean: {best.intra_mean:.3f}')
    ax3.axvline(best.inter_mean, color='#c0392b', linestyle='-', linewidth=2, label=f'Inter mean: {best.inter_mean:.3f}')

    ax3.set_xlabel('Cosine Distance', fontsize=11)
    ax3.set_ylabel('Density', fontsize=11)
    ax3.set_title(f'Distance Distributions (Best: T={best.temp_label})', fontsize=12, fontweight='bold')
    ax3.legend(fontsize=9)

    # 4. Mean distances with CI
    ax4 = axes[1, 1]

    intra_means = [r.intra_mean for r in results]
    inter_means = [r.inter_mean for r in results]
    intra_stds = [r.intra_std for r in results]
    inter_stds = [r.inter_std for r in results]

    x = np.arange(len(temps))
    width = 0.35

    ax4.bar(x - width/2, intra_means, width, yerr=intra_stds, label='Intra-feature',
            color='#3498db', capsize=3, alpha=0.8, edgecolor='black', linewidth=0.5)
    ax4.bar(x + width/2, inter_means, width, yerr=inter_stds, label='Inter-feature',
            color='#e74c3c', capsize=3, alpha=0.8, edgecolor='black', linewidth=0.5)

    ax4.set_xlabel('Pooling Temperature', fontsize=11)
    ax4.set_ylabel('Mean Cosine Distance', fontsize=11)
    ax4.set_title('Intra vs Inter Distances by Temperature', fontsize=12, fontweight='bold')
    ax4.set_xticks(x)
    ax4.set_xticklabels(temps)
    ax4.legend()

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Saved plot to: {output_path}")


def save_results_json(results: List[TemperatureResult], output_path: str):
    """Save results to JSON for further analysis."""
    data = {
        "experiment": "pooling_temperature",
        "temperatures": [r.temperature for r in results],
        "results": [
            {
                "temperature": r.temperature,
                "temp_label": r.temp_label,
                "intra_mean": r.intra_mean,
                "intra_std": r.intra_std,
                "intra_median": r.intra_median,
                "inter_mean": r.inter_mean,
                "inter_std": r.inter_std,
                "inter_median": r.inter_median,
                "separation_ratio": r.separation_ratio,
                "mean_diff": r.mean_diff,
                "cliffs_delta": r.cliffs_delta,
                "cliffs_interpretation": r.cliffs_interpretation,
                "mann_whitney_u": r.mann_whitney_u,
                "mann_whitney_p": r.mann_whitney_p,
                "bootstrap_ci_lower": r.bootstrap_ci_lower,
                "bootstrap_ci_upper": r.bootstrap_ci_upper,
                "n_intra_pairs": len(r.intra_distances),
                "n_inter_pairs": len(r.inter_distances)
            }
            for r in results
        ]
    }

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Saved results to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Pooling temperature hyperparameter experiment",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python experiment_pooling_temperature.py
    python experiment_pooling_temperature.py --n-features 1000
    python experiment_pooling_temperature.py --output results/pooling_exp
        """
    )

    parser.add_argument(
        "--n-features", type=int, default=DEFAULT_N_FEATURES,
        help=f"Number of features to sample (default: {DEFAULT_N_FEATURES})"
    )
    parser.add_argument(
        "--n-bootstrap", type=int, default=DEFAULT_N_BOOTSTRAP,
        help=f"Bootstrap iterations (default: {DEFAULT_N_BOOTSTRAP})"
    )
    parser.add_argument(
        "--seed", type=int, default=DEFAULT_SEED,
        help=f"Random seed (default: {DEFAULT_SEED})"
    )
    parser.add_argument(
        "--output", "-o", type=str, default="pooling_temperature_experiment",
        help="Output file prefix (default: pooling_temperature_experiment)"
    )

    args = parser.parse_args()

    # Run experiment
    results = run_experiment(
        n_features=args.n_features,
        n_bootstrap=args.n_bootstrap,
        seed=args.seed
    )

    # Print results
    print_results_table(results)

    # Generate outputs
    plot_results(results, f"{args.output}.png")
    save_results_json(results, f"{args.output}.json")

    print()
    print("=" * 70)
    print("EXPERIMENT COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
