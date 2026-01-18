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
    UmapPoint,
    ExplainerPosition
)
from ..models.similarity_sort import (
    CauseClassificationRequest,
    CauseClassificationResponse,
    CauseClassificationResult,
    CauseSelectionItem
)
from .data_constants import COL_FEATURE_ID

# Categories for decision function space (3 categories)
CAUSE_CATEGORIES = [
    'noisy-activation',
    'missed-N-gram',
    'missed-context'
]

# ============================================================================
# SAMPLE WEIGHTS FOR SVM TRAINING
# ============================================================================
# 'click' (direct user clicks) get full weight
# 'threshold' (batch Apply Tags) get reduced weight due to potential errors
CLICK_WEIGHT = 1.0
THRESHOLD_WEIGHT = 0.2

# Metrics used for SVM decision function UMAP (kept for decision function endpoint)
METRICS_FOR_SVM = [
    # Mean metrics (6)
    'intra_feature_sim',
    'score_embedding',
    'score_fuzz',
    'score_detection',
    'explanation_semantic_sim',
    'frac_nonzero',
    # Std metrics - scores only (3) - captures cross-explainer disagreement
    'score_embedding_std',
    'score_fuzz_std',
    'score_detection_std',
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

        # Load all explainer rows with scores
        df = self.data_service._barycentric_lazy.filter(
            pl.col("feature_id").is_in(feature_ids)
        ).select([
            "feature_id", "llm_explainer", "position_x", "position_y", "nearest_anchor", "cluster_id",
            "score_embedding", "score_fuzz", "score_detection"
        ]).collect()

        logger.info(f"Loaded {len(df)} rows for {df['feature_id'].n_unique()} features")

        # Compute average score for each row
        df = df.with_columns([
            ((pl.col("score_embedding") + pl.col("score_fuzz") + pl.col("score_detection")) / 3.0)
            .alias("avg_score")
        ])

        # Group by feature_id to find best explainer and collect all positions
        points = []
        for fid in df["feature_id"].unique().to_list():
            feature_rows = df.filter(pl.col("feature_id") == fid)

            # Find best explainer (highest avg_score)
            best_idx = feature_rows["avg_score"].arg_max()
            best_row = feature_rows.row(best_idx, named=True)

            # Use best explainer's position as main point
            best_x = float(best_row["position_x"])
            best_y = float(best_row["position_y"])
            best_anchor = best_row["nearest_anchor"]

            # Get cluster_id (same for all explainers of a feature)
            cluster_id = int(feature_rows["cluster_id"][0])

            # Collect all explainer positions with scores
            explainer_positions = []
            for row in feature_rows.iter_rows(named=True):
                is_best = row["llm_explainer"] == best_row["llm_explainer"]
                explainer_positions.append(ExplainerPosition(
                    explainer=row["llm_explainer"],
                    x=float(row["position_x"]),
                    y=float(row["position_y"]),
                    nearest_anchor=row["nearest_anchor"],
                    score_embedding=float(row["score_embedding"]) if row["score_embedding"] is not None else None,
                    score_fuzz=float(row["score_fuzz"]) if row["score_fuzz"] is not None else None,
                    score_detection=float(row["score_detection"]) if row["score_detection"] is not None else None,
                    avg_score=float(row["avg_score"]) if row["avg_score"] is not None else None,
                    is_best=is_best
                ))

            points.append(UmapPoint(
                feature_id=int(fid),
                x=best_x,
                y=best_y,
                cluster_id=cluster_id,
                nearest_anchor=best_anchor,
                explainer_positions=explainer_positions
            ))

        logger.info(f"Built {len(points)} feature points (best explainer positions)")

        return UmapProjectionResponse(
            points=points,
            total_features=len(points),
            params_used={"source": "barycentric_precomputed", "aggregation": "best_explainer"}
        )

    async def get_cause_classification(
        self,
        request: CauseClassificationRequest
    ) -> CauseClassificationResponse:
        """Classify features into cause categories using OvR SVMs.

        Trains One-vs-Rest SVMs for each category using only user's manual tags.
        Requires manual tags to be provided before classification can run.

        Args:
            request: Request containing feature_ids and cause_selections

        Returns:
            Response with predicted category and decision scores for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        feature_ids = request.feature_ids
        cause_selections = request.cause_selections

        # Count manual tags per category (for logging)
        category_counts = {cat: 0 for cat in CAUSE_CATEGORIES}
        for fid, item in cause_selections.items():
            if item.category in category_counts:
                category_counts[item.category] += 1

        logger.info(f"Classifying {len(feature_ids)} features into cause categories")
        logger.info(f"Manual tag counts: {category_counts}")

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
        # Uses only manual tags (no anchor points)
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
            predicted = max(scores, key=lambda k: scores[k])
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
        cause_selections: Dict[int, CauseSelectionItem],
        feature_id_to_idx: Dict[int, int]
    ) -> np.ndarray:
        """Train One-vs-Rest SVMs with sample weights and compute decision function vectors.

        Uses only user's manual tags for training (no anchor points).
        Applies sample weights based on source: 'click' = 1.0, 'threshold' = 0.2.

        Args:
            metrics_matrix: (N, 9) feature metric matrix (raw values)
            feature_ids: Array of feature IDs
            cause_selections: Dict mapping feature_id to CauseSelectionItem (category + source)
            feature_id_to_idx: Dict mapping feature_id to matrix index

        Returns:
            (N, 3) matrix of decision function values
        """
        n_features = len(feature_ids)
        n_categories = len(CAUSE_CATEGORIES)
        decision_vectors = np.zeros((n_features, n_categories))

        # Build ID to weight mapping
        id_to_weight = {}
        for fid, item in cause_selections.items():
            id_to_weight[fid] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Scale feature metrics
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Train OvR SVM for each category
        for cat_idx, category in enumerate(CAUSE_CATEGORIES):
            # Collect manual tags from user with weights
            manual_positive = []
            manual_negative = []
            positive_weights = []
            negative_weights = []
            for fid, item in cause_selections.items():
                if fid in feature_id_to_idx:
                    idx = feature_id_to_idx[fid]
                    weight = id_to_weight.get(fid, CLICK_WEIGHT)
                    if item.category == category:
                        manual_positive.append(idx)
                        positive_weights.append(weight)
                    else:
                        manual_negative.append(idx)
                        negative_weights.append(weight)

            # Check we have both classes from manual tags
            if len(manual_positive) == 0 or len(manual_negative) == 0:
                logger.warning(f"Skipping SVM for {category}: missing positive or negative manual samples")
                continue

            # Build training data and weights from manual tags only
            X_train = np.vstack([
                metrics_scaled[manual_positive],
                metrics_scaled[manual_negative]
            ])
            y_train = np.array([1] * len(manual_positive) + [0] * len(manual_negative))
            sample_weights = np.array(positive_weights + negative_weights)

            # Train SVM with sample weights
            svm = SVC(
                kernel='rbf',
                C=1.0,
                gamma='scale',
                class_weight='balanced'
            )
            svm.fit(X_train, y_train, sample_weight=sample_weights)

            # Compute decision function for ALL features
            decision_values = svm.decision_function(metrics_scaled)
            decision_vectors[:, cat_idx] = decision_values

            logger.info(f"Trained SVM for {category}: {len(manual_positive)} manual positive, {len(manual_negative)} manual negative")

        return decision_vectors

    async def _extract_metrics_from_barycentric(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract MEAN metrics per feature from barycentric parquet for SVM training.

        Computes mean across 3 explainers for each feature.
        Also loads frac_nonzero from features.parquet (per-feature, not per-explainer).

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id and mean metrics (including frac_nonzero)
        """
        try:
            if self.data_service._barycentric_lazy is None:
                logger.error("Barycentric data not loaded")
                return None

            # Compute mean and std across 3 explainers for each feature
            df = self.data_service._barycentric_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).group_by("feature_id").agg([
                # Mean metrics
                pl.col("intra_feature_sim").mean().alias("intra_feature_sim"),
                pl.col("score_embedding").mean().alias("score_embedding"),
                pl.col("score_fuzz").mean().alias("score_fuzz"),
                pl.col("score_detection").mean().alias("score_detection"),
                pl.col("explanation_semantic_sim").mean().alias("explanation_semantic_sim"),
                # Std metrics (scores only) - captures cross-explainer disagreement
                pl.col("score_embedding").std().alias("score_embedding_std"),
                pl.col("score_fuzz").std().alias("score_fuzz_std"),
                pl.col("score_detection").std().alias("score_detection_std"),
            ]).collect()

            # Load frac_nonzero from features.parquet (per-feature, not per-explainer)
            if self.data_service._df_lazy is not None:
                frac_df = self.data_service._df_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).select([
                    "feature_id",
                    pl.col("frac_nonzero").fill_null(0.0).alias("frac_nonzero")
                ]).unique(subset=["feature_id"]).collect()

                # Join frac_nonzero to the main metrics
                df = df.join(frac_df, on="feature_id", how="left")
                logger.info(f"Joined frac_nonzero from features.parquet")

            # Fill null values
            for metric in METRICS_FOR_SVM:
                if metric in df.columns:
                    df = df.with_columns(pl.col(metric).fill_null(0.0))
                else:
                    df = df.with_columns(pl.lit(0.0).alias(metric))

            logger.info(f"Extracted mean of {len(METRICS_FOR_SVM)} metrics for {len(df)} features from barycentric data")
            return df

        except Exception as e:
            logger.error(f"Failed to extract metrics from barycentric: {e}", exc_info=True)
            return None

    def clear_cache(self):
        """Clear any cached data (no-op since we use pre-computed data)."""
        logger.info("Cache clear requested (no-op for pre-computed data)")
