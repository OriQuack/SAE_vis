"""
Shared SVM utility functions for similarity scoring services.

Extracted from similarity_sort_service.py and pair_similarity_service.py
to eliminate byte-for-byte duplicated train/score methods.
"""

import numpy as np
import logging
from typing import Dict, Tuple, Optional

from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler

from ..models.common import HistogramData
from ..models.similarity_sort import (
    SimilarityHistogramResponse,
    HistogramStatistics,
    CommitteeVoteInfo
)

logger = logging.getLogger(__name__)


def train_svm_model(
    selected_vectors: np.ndarray,
    rejected_vectors: np.ndarray,
    selected_weights: Optional[np.ndarray] = None,
    rejected_weights: Optional[np.ndarray] = None
) -> Tuple[SVC, StandardScaler]:
    """
    Train binary SVM classifier with RBF kernel and optional sample weights.

    Args:
        selected_vectors: (N_pos, d) positive examples
        rejected_vectors: (N_neg, d) negative examples
        selected_weights: (N_pos,) sample weights for positive examples (default: all 1.0)
        rejected_weights: (N_neg,) sample weights for negative examples (default: all 1.0)

    Returns:
        Tuple of (trained_model, fitted_scaler)
    """
    # Combine data
    X = np.vstack([selected_vectors, rejected_vectors])
    y = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))

    # Build sample weights array
    if selected_weights is None:
        selected_weights = np.ones(len(selected_vectors))
    if rejected_weights is None:
        rejected_weights = np.ones(len(rejected_vectors))
    sample_weights = np.concatenate([selected_weights, rejected_weights])

    # Standardize features (critical for SVM)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train SVM with RBF kernel
    model = SVC(
        kernel='rbf',
        C=1.0,
        gamma='scale',
        class_weight='balanced',  # Handle class imbalance
        probability=False  # Faster without probability calibration
    )
    model.fit(X_scaled, y, sample_weight=sample_weights)

    logger.info(f"SVM trained: {len(selected_vectors)} positive, {len(rejected_vectors)} negative, "
               f"{model.n_support_.sum()} support vectors, weighted training")

    return model, scaler


def score_with_svm(
    model: SVC,
    scaler: StandardScaler,
    feature_vectors: np.ndarray
) -> np.ndarray:
    """
    Score features using SVM decision function.

    Args:
        model: Trained SVM model
        scaler: Fitted StandardScaler
        feature_vectors: (N, d) feature vectors to score

    Returns:
        (N,) array of scores (signed distance from decision boundary)
        Positive scores = more similar to selected features
        Negative scores = more similar to rejected features
    """
    X_scaled = scaler.transform(feature_vectors)
    scores = model.decision_function(X_scaled)
    return scores


def build_similarity_histogram_response(
    scores_dict: Dict[str, float],
    score_values: np.ndarray,
    total_items: int,
    committee_votes: Optional[Dict[str, CommitteeVoteInfo]] = None,
) -> SimilarityHistogramResponse:
    """
    Build SimilarityHistogramResponse from raw score values.

    Shared by feature histogram, pair histogram, and stage3 quality scores.

    Args:
        scores_dict: Mapping of item ID/key to score
        score_values: 1D array of scores for histogram
        total_items: Total number of items scored
        committee_votes: Optional committee vote info dict

    Returns:
        Complete SimilarityHistogramResponse
    """
    if len(score_values) == 0:
        return SimilarityHistogramResponse(
            scores={},
            histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
            statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
            total_items=0
        )

    # Compute histogram (60 bins for good resolution)
    counts, bin_edges = np.histogram(score_values, bins=60)
    bins = (bin_edges[:-1] + bin_edges[1:]) / 2  # Bin centers

    # Compute statistics
    statistics = HistogramStatistics(
        min=float(np.min(score_values)),
        max=float(np.max(score_values)),
        mean=float(np.mean(score_values)),
        median=float(np.median(score_values))
    )

    return SimilarityHistogramResponse(
        scores=scores_dict,
        histogram=HistogramData(
            bins=bins.tolist(),
            counts=counts.tolist(),
            bin_edges=bin_edges.tolist()
        ),
        statistics=statistics,
        total_items=total_items,
        committee_votes=committee_votes
    )
