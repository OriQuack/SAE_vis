"""
Barycentric projection service for feature visualization.

Returns pre-computed 2D positions from explanation_barycentric.parquet.
Also provides SVM decision function UMAP for custom training.
"""

import polars as pl
import numpy as np
import logging
from typing import List, Dict, Optional, TYPE_CHECKING
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from ..models.umap import (
    UmapProjectionRequest,
    UmapProjectionResponse,
    UmapPoint
)
from ..models.similarity_sort import (
    CauseClassificationRequest,
    CauseClassificationResponse,
    CauseClassificationResult
)
from .data_constants import COL_FEATURE_ID

# Categories for decision function space (3 categories)
CAUSE_CATEGORIES = [
    'noisy-activation',
    'missed-N-gram',
    'missed-context'
]

# Metrics used for SVM decision function UMAP (kept for decision function endpoint)
METRICS_FOR_SVM = [
    'intra_feature_sim',
    'score_embedding',
    'score_fuzz',
    'score_detection',
    'explanation_semantic_sim',
]

if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)


class UMAPService:
    """Service for barycentric projections and SVM-based UMAP."""

    def __init__(self, data_service: "DataService"):
        """Initialize UMAPService.

        Args:
            data_service: Instance of DataService for data access
        """
        self.data_service = data_service

    async def get_umap_projection(
        self,
        request: UmapProjectionRequest
    ) -> UmapProjectionResponse:
        """Return pre-computed barycentric positions for features.

        Args:
            request: Request containing feature IDs

        Returns:
            Response with 2D coordinates for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        if self.data_service._barycentric_lazy is None:
            raise RuntimeError("Barycentric data not loaded")

        feature_ids = request.feature_ids

        # Load pre-computed positions
        df = self.data_service._barycentric_lazy.filter(
            pl.col("feature_id").is_in(feature_ids)
        ).select([
            "feature_id", "position_x", "position_y", "nearest_anchor"
        ]).unique(subset=["feature_id"]).collect()

        logger.info(f"Loaded pre-computed positions for {len(df)} features")

        # Build response
        points = [
            UmapPoint(
                feature_id=int(row["feature_id"]),
                x=float(row["position_x"]),
                y=float(row["position_y"]),
                nearest_anchor=row["nearest_anchor"]
            )
            for row in df.iter_rows(named=True)
        ]

        return UmapProjectionResponse(
            points=points,
            total_features=len(points),
            params_used={"source": "barycentric_precomputed"}
        )

    async def get_cause_classification(
        self,
        request: CauseClassificationRequest
    ) -> CauseClassificationResponse:
        """Classify features into cause categories using OvR SVMs.

        Trains One-vs-Rest SVMs for each category using mean metric vectors
        per feature (averaged across 3 explainers).

        Args:
            request: Request containing feature_ids and cause_selections

        Returns:
            Response with predicted category and decision scores for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        feature_ids = request.feature_ids
        cause_selections = request.cause_selections

        # Validate that all categories have at least 1 manual tag
        category_counts = {cat: 0 for cat in CAUSE_CATEGORIES}
        for fid, cat in cause_selections.items():
            if cat in category_counts:
                category_counts[cat] += 1

        missing_categories = [cat for cat, count in category_counts.items() if count == 0]
        if missing_categories:
            raise ValueError(
                f"Missing manual tags for categories: {missing_categories}. "
                "Tag at least one feature per category."
            )

        logger.info(f"Classifying {len(feature_ids)} features into cause categories")
        logger.info(f"Training data counts: {category_counts}")

        # Extract mean metrics per feature from barycentric data
        metrics_df = await self._extract_metrics_from_barycentric(feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return CauseClassificationResponse(
                results=[],
                total_features=0,
                category_counts={}
            )

        # Build feature matrix
        feature_ids_ordered = metrics_df[COL_FEATURE_ID].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in METRICS_FOR_SVM
        ])

        # Map feature_ids to indices for cause_selections lookup
        feature_id_to_idx = {int(fid): idx for idx, fid in enumerate(feature_ids_ordered)}

        # Train One-vs-Rest SVMs and compute decision function vectors
        decision_vectors = self._compute_decision_function_vectors(
            metrics_matrix,
            feature_ids_ordered,
            cause_selections,
            feature_id_to_idx
        )

        # Build classification results
        results = []
        predicted_counts = {cat: 0 for cat in CAUSE_CATEGORIES}

        for i, fid in enumerate(feature_ids_ordered):
            # Decision scores per category
            scores = {
                cat: float(decision_vectors[i, j])
                for j, cat in enumerate(CAUSE_CATEGORIES)
            }

            # Predicted category = argmax of decision scores
            predicted = max(scores, key=scores.get)
            predicted_counts[predicted] += 1

            # Decision margin = min absolute distance to any boundary
            margin = float(np.min(np.abs(decision_vectors[i])))

            results.append(CauseClassificationResult(
                feature_id=int(fid),
                predicted_category=predicted,
                decision_margin=margin,
                decision_scores=scores
            ))

        logger.info(f"Classification complete. Predicted counts: {predicted_counts}")

        return CauseClassificationResponse(
            results=results,
            total_features=len(results),
            category_counts=predicted_counts
        )

    def _compute_decision_function_vectors(
        self,
        metrics_matrix: np.ndarray,
        feature_ids: np.ndarray,
        cause_selections: Dict[int, str],
        feature_id_to_idx: Dict[int, int]
    ) -> np.ndarray:
        """Train One-vs-Rest SVMs and compute decision function vectors.

        Args:
            metrics_matrix: (N, 5) feature metric matrix
            feature_ids: Array of feature IDs
            cause_selections: Dict mapping feature_id to category
            feature_id_to_idx: Dict mapping feature_id to matrix index

        Returns:
            (N, 3) matrix of decision function values
        """
        n_features = len(feature_ids)
        n_categories = len(CAUSE_CATEGORIES)
        decision_vectors = np.zeros((n_features, n_categories))

        # Standardize metrics for SVM training
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Train OvR SVM for each category
        for cat_idx, category in enumerate(CAUSE_CATEGORIES):
            # Build labels: 1 for this category, 0 for all others
            positive_indices = []
            negative_indices = []

            for fid, cat in cause_selections.items():
                if fid in feature_id_to_idx:
                    idx = feature_id_to_idx[fid]
                    if cat == category:
                        positive_indices.append(idx)
                    else:
                        negative_indices.append(idx)

            if len(positive_indices) == 0 or len(negative_indices) == 0:
                logger.warning(f"Skipping SVM for {category}: missing positive or negative samples")
                continue

            # Build training data
            train_indices = positive_indices + negative_indices
            X_train = metrics_scaled[train_indices]
            y_train = np.array([1] * len(positive_indices) + [0] * len(negative_indices))

            # Train SVM
            svm = SVC(
                kernel='rbf',
                C=1.0,
                gamma='scale',
                class_weight='balanced'
            )
            svm.fit(X_train, y_train)

            # Compute decision function for ALL features
            decision_values = svm.decision_function(metrics_scaled)
            decision_vectors[:, cat_idx] = decision_values

            logger.info(f"Trained SVM for {category}: {len(positive_indices)} positive, {len(negative_indices)} negative")

        return decision_vectors

    async def _extract_metrics_from_barycentric(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract MEAN metrics per feature from barycentric parquet for SVM training.

        Computes mean across 3 explainers for each feature.

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id and mean metrics
        """
        try:
            if self.data_service._barycentric_lazy is None:
                logger.error("Barycentric data not loaded")
                return None

            # Compute mean across 3 explainers for each feature
            df = self.data_service._barycentric_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).group_by("feature_id").agg([
                pl.col("intra_feature_sim").mean().alias("intra_feature_sim"),
                pl.col("score_embedding").mean().alias("score_embedding"),
                pl.col("score_fuzz").mean().alias("score_fuzz"),
                pl.col("score_detection").mean().alias("score_detection"),
                pl.col("explanation_semantic_sim").mean().alias("explanation_semantic_sim")
            ]).collect()

            # Fill null values
            for metric in METRICS_FOR_SVM:
                df = df.with_columns(pl.col(metric).fill_null(0.0))

            logger.info(f"Extracted mean of {len(METRICS_FOR_SVM)} metrics for {len(df)} features from barycentric data")
            return df

        except Exception as e:
            logger.error(f"Failed to extract metrics from barycentric: {e}", exc_info=True)
            return None

    def clear_cache(self):
        """Clear any cached data (no-op since we use pre-computed data)."""
        logger.info("Cache clear requested (no-op for pre-computed data)")
