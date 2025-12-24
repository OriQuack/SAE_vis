"""
Barycentric projection service for feature visualization.

Returns pre-computed 2D positions from explanation_barycentric.parquet.
Also provides SVM decision function UMAP for custom training.
"""

import json
import polars as pl
import numpy as np
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple, TYPE_CHECKING
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from ..models.umap import (
    UmapProjectionRequest,
    UmapProjectionResponse,
    UmapPoint,
    ExplainerPosition
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

# Anchor names in metadata -> API category names mapping
ANCHOR_TO_CATEGORY = {
    'noisy_activation': 'noisy-activation',
    'missed_ngram': 'missed-N-gram',
    'missed_context': 'missed-context'
}

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
        self._anchor_metrics: Optional[Tuple[np.ndarray, List[str]]] = None

    def _load_anchor_metrics(self) -> Tuple[np.ndarray, List[str]]:
        """Load pre-computed anchor vectors from metadata.

        Returns raw metric values (not standardized) so they can be scaled
        together with real feature metrics.

        Returns:
            Tuple of (anchor_matrix, anchor_categories) where:
            - anchor_matrix: (3, 5) array of raw metric vectors
            - anchor_categories: List of category names in same order
        """
        if self._anchor_metrics is not None:
            return self._anchor_metrics

        # Find project root
        project_root = Path(__file__).parent.parent.parent.parent
        metadata_path = project_root / "data" / "master" / "explanation_barycentric_metadata.json"

        logger.info(f"Loading anchor metrics from {metadata_path}")

        with open(metadata_path) as f:
            metadata = json.load(f)

        # Extract RAW anchor vectors (same scale as real features)
        anchors = metadata["anchor_coordinates"]
        anchor_names = ["missed_ngram", "missed_context", "noisy_activation"]

        anchor_matrix = np.array([
            anchors[name]["raw"] for name in anchor_names
        ])
        anchor_categories = [ANCHOR_TO_CATEGORY[name] for name in anchor_names]

        logger.info(f"Loaded anchor metrics: {anchor_categories}")
        self._anchor_metrics = (anchor_matrix, anchor_categories)
        return self._anchor_metrics

    async def get_umap_projection(
        self,
        request: UmapProjectionRequest
    ) -> UmapProjectionResponse:
        """Return pre-computed barycentric positions for features.

        Returns mean position across explainers for each feature,
        plus individual explainer positions for detail view.

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

        # Load all explainer rows (not just unique)
        df = self.data_service._barycentric_lazy.filter(
            pl.col("feature_id").is_in(feature_ids)
        ).select([
            "feature_id", "llm_explainer", "position_x", "position_y", "nearest_anchor", "cluster_id"
        ]).collect()

        logger.info(f"Loaded {len(df)} rows for {df['feature_id'].n_unique()} features")

        # Group by feature_id to compute mean and collect explainer positions
        points = []
        for fid in df["feature_id"].unique().to_list():
            feature_rows = df.filter(pl.col("feature_id") == fid)

            # Compute mean position
            mean_x = float(feature_rows["position_x"].mean())
            mean_y = float(feature_rows["position_y"].mean())

            # Get most common nearest_anchor (mode)
            anchor_counts = feature_rows["nearest_anchor"].value_counts()
            most_common_anchor = anchor_counts.sort("counts", descending=True)["nearest_anchor"][0]

            # Get cluster_id (same for all explainers of a feature)
            cluster_id = int(feature_rows["cluster_id"][0])

            # Collect explainer positions for detail view
            explainer_positions = [
                ExplainerPosition(
                    explainer=row["llm_explainer"],
                    x=float(row["position_x"]),
                    y=float(row["position_y"]),
                    nearest_anchor=row["nearest_anchor"]
                )
                for row in feature_rows.iter_rows(named=True)
            ]

            points.append(UmapPoint(
                feature_id=int(fid),
                x=mean_x,
                y=mean_y,
                cluster_id=cluster_id,
                nearest_anchor=most_common_anchor,
                explainer_positions=explainer_positions
            ))

        logger.info(f"Built {len(points)} feature points with explainer details")

        return UmapProjectionResponse(
            points=points,
            total_features=len(points),
            params_used={"source": "barycentric_precomputed", "aggregation": "mean"}
        )

    async def get_cause_classification(
        self,
        request: CauseClassificationRequest
    ) -> CauseClassificationResponse:
        """Classify features into cause categories using OvR SVMs.

        Trains One-vs-Rest SVMs for each category using:
        - Pre-computed anchor points from metadata (baseline training)
        - User's manual tags (optional, improves predictions)

        Args:
            request: Request containing feature_ids and cause_selections

        Returns:
            Response with predicted category and decision scores for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        feature_ids = request.feature_ids
        cause_selections = request.cause_selections

        # Load anchor metrics (baseline training data)
        anchor_matrix, anchor_categories = self._load_anchor_metrics()

        # Count manual tags per category (for logging)
        category_counts = {cat: 0 for cat in CAUSE_CATEGORIES}
        for fid, cat in cause_selections.items():
            if cat in category_counts:
                category_counts[cat] += 1

        logger.info(f"Classifying {len(feature_ids)} features into cause categories")
        logger.info(f"Manual tag counts: {category_counts} (anchors always included)")

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
        # Uses anchors as baseline + any manual tags
        decision_vectors = self._compute_decision_function_vectors(
            metrics_matrix,
            feature_ids_ordered,
            cause_selections,
            feature_id_to_idx,
            anchor_matrix,
            anchor_categories
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
        feature_id_to_idx: Dict[int, int],
        anchor_matrix: np.ndarray,
        anchor_categories: List[str]
    ) -> np.ndarray:
        """Train One-vs-Rest SVMs and compute decision function vectors.

        Uses anchor points as baseline training data, optionally augmented
        with user's manual tags.

        Args:
            metrics_matrix: (N, 5) feature metric matrix (raw values)
            feature_ids: Array of feature IDs
            cause_selections: Dict mapping feature_id to category (manual tags)
            feature_id_to_idx: Dict mapping feature_id to matrix index
            anchor_matrix: (3, 5) anchor metric matrix (raw values)
            anchor_categories: List of category names for each anchor

        Returns:
            (N, 3) matrix of decision function values
        """
        n_features = len(feature_ids)
        n_categories = len(CAUSE_CATEGORIES)
        decision_vectors = np.zeros((n_features, n_categories))

        # Combine features + anchors for consistent scaling
        combined_matrix = np.vstack([metrics_matrix, anchor_matrix])
        scaler = StandardScaler()
        combined_scaled = scaler.fit_transform(combined_matrix)

        # Split back
        metrics_scaled = combined_scaled[:n_features]
        anchors_scaled = combined_scaled[n_features:]

        # Train OvR SVM for each category
        for cat_idx, category in enumerate(CAUSE_CATEGORIES):
            # Start with anchor points as baseline training data
            anchor_positive = []
            anchor_negative = []
            for i, anchor_cat in enumerate(anchor_categories):
                if anchor_cat == category:
                    anchor_positive.append(i)
                else:
                    anchor_negative.append(i)

            # Add manual tags from user
            manual_positive = []
            manual_negative = []
            for fid, cat in cause_selections.items():
                if fid in feature_id_to_idx:
                    idx = feature_id_to_idx[fid]
                    if cat == category:
                        manual_positive.append(idx)
                    else:
                        manual_negative.append(idx)

            # Build training data: anchors + manual tags
            X_train_parts = []
            y_train_parts = []

            # Add anchor positives
            if anchor_positive:
                X_train_parts.append(anchors_scaled[anchor_positive])
                y_train_parts.extend([1] * len(anchor_positive))

            # Add manual positives
            if manual_positive:
                X_train_parts.append(metrics_scaled[manual_positive])
                y_train_parts.extend([1] * len(manual_positive))

            # Add anchor negatives
            if anchor_negative:
                X_train_parts.append(anchors_scaled[anchor_negative])
                y_train_parts.extend([0] * len(anchor_negative))

            # Add manual negatives
            if manual_negative:
                X_train_parts.append(metrics_scaled[manual_negative])
                y_train_parts.extend([0] * len(manual_negative))

            # Check we have both classes
            n_positive = len(anchor_positive) + len(manual_positive)
            n_negative = len(anchor_negative) + len(manual_negative)

            if n_positive == 0 or n_negative == 0:
                logger.warning(f"Skipping SVM for {category}: missing positive or negative samples")
                continue

            X_train = np.vstack(X_train_parts)
            y_train = np.array(y_train_parts)

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

            logger.info(f"Trained SVM for {category}: {n_positive} positive ({len(anchor_positive)} anchor + {len(manual_positive)} manual), {n_negative} negative")

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
