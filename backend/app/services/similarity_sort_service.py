"""
Similarity-based sorting service for table features.

Uses weighted Euclidean distance across 9 metrics to score features
based on similarity to selected (✓) features and dissimilarity to rejected (✗) features.
"""

import polars as pl
import numpy as np
import logging
from typing import List, Dict, Tuple, Optional, TYPE_CHECKING
from pathlib import Path

from ..models.similarity_sort import (
    SimilaritySortRequest, SimilaritySortResponse, FeatureScore,
    PairSimilaritySortRequest, PairSimilaritySortResponse, PairScore,
    SimilarityHistogramRequest, SimilarityHistogramResponse,
    PairSimilarityHistogramRequest,
    HistogramData, HistogramStatistics
)

if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)


class SimilaritySortService:
    """Service for calculating feature similarity scores."""

    # 9 metrics used for similarity calculation
    METRICS = [
        'decoder_similarity_count',  # Count of similar features (from decoder_similarity)
        'intra_ngram_jaccard',       # Max of char and word ngram jaccard
        'intra_semantic_sim',        # Semantic similarity from activation examples
        'inter_ngram_jaccard',       # Inter-feature ngram jaccard
        'inter_semantic_sim',        # Inter-feature semantic similarity
        'embed_score',               # Embedding alignment score
        'fuzz_score',                # Fuzzing robustness score (avg across scorers)
        'detection_score',           # Detection utility score (avg across scorers)
        'llm_explainer_semantic_sim' # LLM explainer semantic similarity (mean pairwise)
    ]

    def __init__(self, data_service: "DataService"):
        """
        Initialize SimilaritySortService.

        Args:
            data_service: Instance of DataService for data access
        """
        self.data_service = data_service
        self._weights_cache: Optional[Tuple[np.ndarray, List[float]]] = None

    async def get_similarity_sorted_features(
        self,
        request: SimilaritySortRequest
    ) -> SimilaritySortResponse:
        """
        Calculate similarity scores and return sorted features.

        Args:
            request: Request containing selected, rejected, and all feature IDs

        Returns:
            Response with sorted features and scores
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Validate inputs
        if len(request.feature_ids) == 0:
            return SimilaritySortResponse(
                sorted_features=[],
                total_features=0,
                weights_used=[]
            )

        # Extract metrics for all features
        logger.info(f"Extracting metrics for {len(request.feature_ids)} features")
        metrics_df = await self._extract_metrics(request.feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return SimilaritySortResponse(
                sorted_features=[],
                total_features=0,
                weights_used=[]
            )

        # Calculate or retrieve cached weights
        weights, weights_list = self._get_weights(metrics_df)

        # Calculate similarity scores
        logger.info(f"Calculating similarity scores")
        feature_scores = self._calculate_similarity_scores(
            metrics_df,
            weights,
            request.selected_ids,
            request.rejected_ids
        )

        # Sort by score (descending - higher is better)
        feature_scores.sort(key=lambda x: x.score, reverse=True)

        logger.info(f"Successfully scored and sorted {len(feature_scores)} features")

        return SimilaritySortResponse(
            sorted_features=feature_scores,
            total_features=len(feature_scores),
            weights_used=weights_list
        )

    async def _extract_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract all 9 metrics for the specified features.

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 9 metrics
        """
        try:
            logger.info(f"[_extract_metrics] Starting extraction for {len(feature_ids)} features")

            # Get the main dataframe
            lf = self.data_service._df_lazy

            if lf is None:
                logger.error("Main dataframe not initialized")
                return None

            logger.info("[_extract_metrics] Main dataframe loaded")

            # Filter to requested features
            lf = lf.filter(pl.col("feature_id").is_in(feature_ids))
            logger.info("[_extract_metrics] Filtered to requested features")

            # Extract metrics from List(Struct) columns BEFORE grouping
            # This pattern follows data_service.py approach (lines 146-157)
            logger.info("[_extract_metrics] Pre-extracting metrics from nested columns")
            lf = lf.with_columns([
                # Decoder similarity: count of similar features
                pl.col("decoder_similarity").list.len().alias("decoder_similarity_count"),

                # LLM explainer semantic similarity (mean of pairwise similarities)
                pl.col("semantic_similarity")
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.mean()
                  .alias("llm_explainer_semantic_sim_raw")
            ])

            # Now aggregate on the pre-extracted scalar columns
            # Average scores across scorers for each feature-explainer combination
            logger.info("[_extract_metrics] Starting aggregation by feature_id and llm_explainer")

            try:
                base_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                    # Use first() on pre-extracted columns (they're the same for all rows in a group)
                    pl.col("decoder_similarity_count").first(),
                    pl.col("llm_explainer_semantic_sim_raw").first().alias("llm_explainer_semantic_sim_per_explainer"),

                    # Score metrics (average across scorers per explainer)
                    pl.col("score_embedding").mean().alias("embed_score"),
                    pl.col("score_fuzz").mean().alias("fuzz_score"),
                    pl.col("score_detection").mean().alias("detection_score")
                ]).collect()
                logger.info(f"[_extract_metrics] First aggregation complete: {len(base_df)} rows")
            except Exception as agg_error:
                logger.error(f"[_extract_metrics] Aggregation failed: {agg_error}", exc_info=True)
                raise

            # Compute quality score per explainer (average of embed, fuzz, detection)
            base_df = base_df.with_columns([
                ((pl.col("embed_score") + pl.col("fuzz_score") + pl.col("detection_score")) / 3.0)
                .alias("quality_score_per_explainer")
            ])

            # Aggregate across explainers: take MAX quality score and corresponding scores
            logger.info("[_extract_metrics] Starting second aggregation by feature_id")
            base_df = base_df.group_by("feature_id").agg([
                pl.col("decoder_similarity_count").first(),
                pl.col("quality_score_per_explainer").max().alias("quality_score"),
                # Take max of individual scores (best explainer's values)
                pl.col("embed_score").max(),
                pl.col("fuzz_score").max(),
                pl.col("detection_score").max(),
                pl.col("llm_explainer_semantic_sim_per_explainer").mean().alias("llm_explainer_semantic_sim")
            ])
            logger.info(f"[_extract_metrics] Second aggregation complete: {len(base_df)} rows")

            # Cast feature_id to UInt32 to match activation and inter-feature dataframes
            base_df = base_df.with_columns(pl.col("feature_id").cast(pl.UInt32))

            # Extract activation-level metrics (intra-feature)
            logger.info("[_extract_metrics] Extracting activation metrics")
            activation_df = await self._extract_activation_metrics(feature_ids)
            logger.info(f"[_extract_metrics] Activation metrics: {len(activation_df) if activation_df is not None else 0} rows")

            # Extract inter-feature metrics
            logger.info("[_extract_metrics] Extracting inter-feature metrics")
            interfeature_df = await self._extract_interfeature_metrics(feature_ids)
            logger.info(f"[_extract_metrics] Inter-feature metrics: {len(interfeature_df) if interfeature_df is not None else 0} rows")

            # Join all metrics together
            logger.info("[_extract_metrics] Joining all metrics")
            result_df = base_df

            if activation_df is not None:
                result_df = result_df.join(activation_df, on="feature_id", how="left")
                logger.info("[_extract_metrics] Joined activation metrics")

            if interfeature_df is not None:
                result_df = result_df.join(interfeature_df, on="feature_id", how="left")
                logger.info("[_extract_metrics] Joined inter-feature metrics")

            # Fill nulls with 0 for missing metrics
            for metric in self.METRICS:
                if metric not in result_df.columns:
                    result_df = result_df.with_columns(pl.lit(0.0).alias(metric))
                else:
                    result_df = result_df.with_columns(
                        pl.col(metric).fill_null(0.0)
                    )

            logger.info(f"Extracted metrics for {len(result_df)} features")
            return result_df

        except Exception as e:
            logger.error(f"Failed to extract metrics: {e}", exc_info=True)
            import traceback
            traceback.print_exc()
            return None

    async def _extract_activation_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract intra-feature activation metrics.

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id, intra_ngram_jaccard, intra_semantic_sim
        """
        try:
            # Try optimized activation_display file first
            if self.data_service._activation_display_lazy is not None:
                df = self.data_service._activation_display_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).collect()

                # Extract metrics
                df = df.select([
                    "feature_id",
                    # Max of char and word ngram jaccard
                    pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
                      .fill_null(0.0)
                      .alias("intra_ngram_jaccard"),
                    # Semantic similarity
                    pl.col("semantic_similarity")
                      .fill_null(0.0)
                      .alias("intra_semantic_sim")
                ]).unique(subset=["feature_id"])

                logger.info(f"Extracted activation metrics from optimized file for {len(df)} features")
                return df

            # Fallback to legacy files
            elif self.data_service._activation_similarity_lazy is not None:
                df = self.data_service._activation_similarity_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).collect()

                df = df.select([
                    "feature_id",
                    pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
                      .fill_null(0.0)
                      .alias("intra_ngram_jaccard"),
                    pl.col("semantic_similarity")
                      .fill_null(0.0)
                      .alias("intra_semantic_sim")
                ]).unique(subset=["feature_id"])

                logger.info(f"Extracted activation metrics from legacy file for {len(df)} features")
                return df

            else:
                logger.warning("No activation data available")
                return None

        except Exception as e:
            logger.warning(f"Failed to extract activation metrics: {e}")
            return None

    async def _extract_interfeature_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract inter-feature similarity metrics.

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id, inter_ngram_jaccard, inter_semantic_sim
        """
        try:
            if self.data_service._interfeature_similarity_lazy is None:
                logger.warning("No inter-feature similarity data available")
                return None

            df = self.data_service._interfeature_similarity_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).collect()

            # Extract max jaccard and semantic similarity across all similar features
            # Process both semantic_pairs and lexical_pairs
            rows = []

            for row in df.iter_rows(named=True):
                feature_id = row["feature_id"]

                max_char_jaccard = 0.0
                max_word_jaccard = 0.0
                max_semantic_sim = 0.0

                # Process semantic pairs
                semantic_pairs = row.get("semantic_pairs")
                if semantic_pairs:
                    for pair in semantic_pairs:
                        if pair.get("char_jaccard") is not None:
                            max_char_jaccard = max(max_char_jaccard, float(pair["char_jaccard"]))
                        if pair.get("word_jaccard") is not None:
                            max_word_jaccard = max(max_word_jaccard, float(pair["word_jaccard"]))
                        if pair.get("semantic_similarity") is not None:
                            max_semantic_sim = max(max_semantic_sim, float(pair["semantic_similarity"]))

                # Process lexical pairs
                lexical_pairs = row.get("lexical_pairs")
                if lexical_pairs:
                    for pair in lexical_pairs:
                        if pair.get("char_jaccard") is not None:
                            max_char_jaccard = max(max_char_jaccard, float(pair["char_jaccard"]))
                        if pair.get("word_jaccard") is not None:
                            max_word_jaccard = max(max_word_jaccard, float(pair["word_jaccard"]))
                        if pair.get("semantic_similarity") is not None:
                            max_semantic_sim = max(max_semantic_sim, float(pair["semantic_similarity"]))

                rows.append({
                    "feature_id": feature_id,
                    "inter_ngram_jaccard": max(max_char_jaccard, max_word_jaccard),
                    "inter_semantic_sim": max_semantic_sim
                })

            if not rows:
                logger.warning("No inter-feature metrics extracted")
                return None

            result_df = pl.DataFrame(rows)
            # Cast feature_id to UInt32 to match other dataframes
            result_df = result_df.with_columns(pl.col("feature_id").cast(pl.UInt32))
            logger.info(f"Extracted inter-feature metrics for {len(result_df)} features")
            return result_df

        except Exception as e:
            logger.warning(f"Failed to extract inter-feature metrics: {e}")
            return None

    def _get_weights(self, metrics_df: pl.DataFrame) -> Tuple[np.ndarray, List[float]]:
        """
        Calculate or retrieve cached normalized weights for metrics.

        Weight = 1 / (std * 2), then normalized to sum = 1

        Args:
            metrics_df: DataFrame with metrics

        Returns:
            Tuple of (numpy array of weights, list of weights for response)
        """
        # Check cache (weights should be same for same dataset)
        if self._weights_cache is not None:
            logger.info("Using cached weights")
            return self._weights_cache

        # Calculate standard deviation for each metric
        stds = []
        for metric in self.METRICS:
            if metric in metrics_df.columns:
                std = metrics_df[metric].std()
                if std is None or std == 0:
                    std = 1.0  # Avoid division by zero
                stds.append(std)
            else:
                stds.append(1.0)  # Default if metric missing

        # Calculate weights: inverse of (std * 2)
        weights = np.array([1.0 / (std * 2.0) for std in stds])

        # Normalize to sum = 1
        weights_sum = weights.sum()
        if weights_sum > 0:
            weights = weights / weights_sum
        else:
            weights = np.ones(len(self.METRICS)) / len(self.METRICS)

        weights_list = weights.tolist()

        # Cache for future use
        self._weights_cache = (weights, weights_list)

        logger.info(f"Calculated weights: {dict(zip(self.METRICS, weights_list))}")
        return weights, weights_list

    def _calculate_similarity_scores(
        self,
        metrics_df: pl.DataFrame,
        weights: np.ndarray,
        selected_ids: List[int],
        rejected_ids: List[int]
    ) -> List[FeatureScore]:
        """
        Calculate similarity scores for all features.

        Score = avg_distance_to_selected - avg_distance_to_rejected

        Args:
            metrics_df: DataFrame with metrics for all features
            weights: Normalized weights for each metric
            selected_ids: Feature IDs marked as selected (✓)
            rejected_ids: Feature IDs marked as rejected (✗)

        Returns:
            List of FeatureScore objects
        """
        # Convert to numpy for efficient distance calculation
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Calculate scores for each feature
        feature_scores = []

        for i, feature_id in enumerate(feature_ids):
            # Skip if this feature is selected or rejected (frontend handles three-tier sorting)
            if feature_id in selected_ids or feature_id in rejected_ids:
                continue

            # Calculate weighted distance to selected features
            dist_to_selected = 0.0
            if selected_ids:
                distances = []
                for selected_id in selected_ids:
                    selected_idx = np.where(feature_ids == selected_id)[0]
                    if len(selected_idx) > 0:
                        dist = self._weighted_euclidean_distance(
                            metrics_matrix[i],
                            metrics_matrix[selected_idx[0]],
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_selected = np.mean(distances)

            # Calculate weighted distance to rejected features
            dist_to_rejected = 0.0
            if rejected_ids:
                distances = []
                for rejected_id in rejected_ids:
                    rejected_idx = np.where(feature_ids == rejected_id)[0]
                    if len(rejected_idx) > 0:
                        dist = self._weighted_euclidean_distance(
                            metrics_matrix[i],
                            metrics_matrix[rejected_idx[0]],
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_rejected = np.mean(distances)

            # Final score: similarity to selected - similarity to rejected
            # Note: smaller distance = more similar, but we want high score = more similar
            # So we negate the distances
            score = -dist_to_selected + dist_to_rejected

            feature_scores.append(FeatureScore(feature_id=int(feature_id), score=float(score)))

        return feature_scores

    def _weighted_euclidean_distance(
        self,
        vec_a: np.ndarray,
        vec_b: np.ndarray,
        weights: np.ndarray
    ) -> float:
        """
        Calculate weighted Euclidean distance between two feature vectors.

        Distance = sqrt(sum(weight_i * (a_i - b_i)^2))

        Args:
            vec_a: First feature vector
            vec_b: Second feature vector
            weights: Weight vector (normalized to sum=1)

        Returns:
            Weighted Euclidean distance
        """
        diff = vec_a - vec_b
        weighted_sq_diff = weights * (diff ** 2)
        distance = np.sqrt(np.sum(weighted_sq_diff))
        return float(distance)

    async def get_pair_similarity_sorted(
        self,
        request: PairSimilaritySortRequest
    ) -> PairSimilaritySortResponse:
        """
        Calculate similarity scores for feature pairs and return sorted pairs.

        Pair vectors are 19-dimensional: 9 metrics (main) + 9 metrics (similar) + 1 pair metric
        Weights are 10-dimensional: one per metric type (applied to both features) + one for pair metric

        Args:
            request: Request containing selected, rejected, and all pair keys

        Returns:
            Response with sorted pairs and scores
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Validate inputs
        if len(request.pair_keys) == 0:
            return PairSimilaritySortResponse(
                sorted_pairs=[],
                total_pairs=0,
                weights_used=[]
            )

        # Extract pair keys and parse to (main_id, similar_id)
        pair_ids = []
        for pair_key in request.pair_keys:
            parts = pair_key.split('-')
            if len(parts) == 2:
                try:
                    main_id = int(parts[0])
                    similar_id = int(parts[1])
                    pair_ids.append((main_id, similar_id))
                except ValueError:
                    logger.warning(f"Invalid pair key format: {pair_key}")
                    continue

        if not pair_ids:
            return PairSimilaritySortResponse(
                sorted_pairs=[],
                total_pairs=0,
                weights_used=[]
            )

        # Extract all unique feature IDs from pairs
        all_feature_ids = set()
        for main_id, similar_id in pair_ids:
            all_feature_ids.add(main_id)
            all_feature_ids.add(similar_id)

        logger.info(f"Extracting metrics for {len(all_feature_ids)} unique features in {len(pair_ids)} pairs")
        metrics_df = await self._extract_metrics(list(all_feature_ids))

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return PairSimilaritySortResponse(
                sorted_pairs=[],
                total_pairs=0,
                weights_used=[]
            )

        # Calculate or retrieve cached weights (base 9 metrics)
        weights_base, weights_list_base = self._get_weights(metrics_df)

        # Extract pair metrics (cosine_similarity from decoder_similarity)
        pair_metrics_dict = await self._extract_pair_metrics(pair_ids)

        # Calculate or use cached weights for pair metric
        pair_metric_weights, all_weights_list = self._get_pair_weights(
            metrics_df,
            pair_metrics_dict,
            weights_list_base
        )

        # Calculate similarity scores for pairs
        logger.info(f"Calculating similarity scores for {len(pair_ids)} pairs")
        pair_scores = self._calculate_pair_similarity_scores(
            metrics_df,
            pair_metrics_dict,
            pair_metric_weights,
            request.selected_pair_keys,
            request.rejected_pair_keys,
            pair_ids
        )

        # Sort by score (descending - higher is better)
        pair_scores.sort(key=lambda x: x.score, reverse=True)

        logger.info(f"Successfully scored and sorted {len(pair_scores)} pairs")

        return PairSimilaritySortResponse(
            sorted_pairs=pair_scores,
            total_pairs=len(pair_ids),
            weights_used=all_weights_list
        )

    async def _extract_pair_metrics(
        self,
        pair_ids: List[Tuple[int, int]]
    ) -> Dict[str, float]:
        """
        Extract pair-specific metrics (cosine similarity from decoder_similarity).

        Args:
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            Dictionary mapping pair_key to cosine_similarity
        """
        # Access the main dataframe through data_service
        lf = self.data_service._df_lazy
        if lf is None:
            logger.warning("Main dataframe not available for pair metrics")
            return {}

        # Extract unique main feature IDs from pairs
        main_feature_ids = list(set(main_id for main_id, _ in pair_ids))

        # Load the decoder_similarity data for these features
        try:
            df = lf.filter(pl.col("feature_id").is_in(main_feature_ids)).select([
                "feature_id",
                "decoder_similarity"
            ]).collect()

            if df is None or len(df) == 0:
                logger.warning("No decoder_similarity data found for pair metrics")
                return {}
        except Exception as e:
            logger.error(f"Failed to load decoder_similarity data: {e}")
            return {}

        pair_metrics = {}

        for main_id, similar_id in pair_ids:
            pair_key = f"{main_id}-{similar_id}"

            # Find decoder similarity entry for this pair
            try:
                # Filter for the main feature
                main_data = df.filter(pl.col("feature_id") == main_id)
                if len(main_data) == 0:
                    logger.debug(f"Feature {main_id} not found for pair {pair_key}")
                    pair_metrics[pair_key] = 0.0
                    continue

                # Get decoder_similarity list
                decoder_sims = main_data["decoder_similarity"][0]
                if not isinstance(decoder_sims, list):
                    pair_metrics[pair_key] = 0.0
                    continue

                # Find the similar feature in the list
                similarity = 0.0
                for sim_item in decoder_sims:
                    if isinstance(sim_item, dict) and sim_item.get("feature_id") == similar_id:
                        similarity = float(sim_item.get("cosine_similarity", 0.0))
                        break

                pair_metrics[pair_key] = similarity

            except Exception as e:
                logger.warning(f"Error extracting pair metric for {pair_key}: {e}")
                pair_metrics[pair_key] = 0.0

        return pair_metrics

    def _get_pair_weights(
        self,
        metrics_df: pl.DataFrame,
        pair_metrics: Dict[str, float],
        weights_list_base: List[float]
    ) -> Tuple[np.ndarray, List[float]]:
        """
        Calculate weights for 10-dimensional pair vectors.

        First 9 weights are per-metric type (same for both main and similar features)
        10th weight is for pair_decoder_similarity metric

        Args:
            metrics_df: DataFrame with base metrics
            pair_metrics: Dictionary of pair cosine similarities
            weights_list_base: Base weights for 9 feature metrics

        Returns:
            Tuple of (weight vector as ndarray, full weights list as List[float])
        """
        # Calculate std of pair metric
        pair_similarity_values = np.array(list(pair_metrics.values()))

        if len(pair_similarity_values) == 0 or np.std(pair_similarity_values) == 0:
            pair_weight = 0.1  # Default if no variance
        else:
            pair_weight = 1.0 / (np.std(pair_similarity_values) * 2.0)

        # Combine: 9 base weights + 1 pair weight
        # Apply each base weight twice (once for main, once for similar)
        combined_weights = []
        for base_w in weights_list_base:
            combined_weights.append(base_w)  # For main feature metric
            combined_weights.append(base_w)  # For similar feature metric
        combined_weights.append(pair_weight)  # For pair metric

        # Normalize
        combined_weights = np.array(combined_weights)
        combined_weights = combined_weights / np.sum(combined_weights)

        # Return both array and list formats
        return combined_weights, list(combined_weights)

    def _calculate_pair_similarity_scores(
        self,
        metrics_df: pl.DataFrame,
        pair_metrics: Dict[str, float],
        weights: np.ndarray,
        selected_pair_keys: List[str],
        rejected_pair_keys: List[str],
        pair_ids: List[Tuple[int, int]]
    ) -> List[PairScore]:
        """
        Calculate similarity scores for all pairs.

        Score = -avg_distance_to_selected + avg_distance_to_rejected

        19-dim pair vector = [9 main metrics] + [9 similar metrics] + [1 pair metric]

        Args:
            metrics_df: DataFrame with metrics for all features
            pair_metrics: Dictionary mapping pair_key to cosine_similarity
            weights: 10-element weight vector
            selected_pair_keys: Pair keys marked as selected (✓)
            rejected_pair_keys: Pair keys marked as rejected (✗)
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            List of PairScore objects
        """
        # Convert to numpy for efficient distance calculation
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Build pair vectors (19-dimensional)
        pair_vectors = {}
        pair_key_list = []

        for main_id, similar_id in pair_ids:
            pair_key = f"{main_id}-{similar_id}"
            pair_key_list.append(pair_key)

            # Get main and similar feature metrics
            main_idx = np.where(feature_ids == main_id)[0]
            similar_idx = np.where(feature_ids == similar_id)[0]

            if len(main_idx) == 0 or len(similar_idx) == 0:
                logger.warning(f"Missing metrics for pair {pair_key}")
                pair_vectors[pair_key] = None
                continue

            # Build 19-dim vector
            main_metrics = metrics_matrix[main_idx[0]]  # 9 dims
            similar_metrics = metrics_matrix[similar_idx[0]]  # 9 dims
            pair_metric = pair_metrics.get(pair_key, 0.0)  # 1 dim

            pair_vector = np.concatenate([main_metrics, similar_metrics, [pair_metric]])
            pair_vectors[pair_key] = pair_vector

        # Calculate scores for each pair
        pair_scores = []

        for pair_key in pair_key_list:
            pair_vector = pair_vectors.get(pair_key)

            if pair_vector is None:
                continue

            # Skip if this pair is selected or rejected (frontend handles three-tier sorting)
            if pair_key in selected_pair_keys or pair_key in rejected_pair_keys:
                continue

            # Calculate weighted distance to selected pairs
            dist_to_selected = 0.0
            if selected_pair_keys:
                distances = []
                for selected_pair_key in selected_pair_keys:
                    selected_vector = pair_vectors.get(selected_pair_key)
                    if selected_vector is not None:
                        dist = self._weighted_euclidean_distance(
                            pair_vector,
                            selected_vector,
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_selected = np.mean(distances)

            # Calculate weighted distance to rejected pairs
            dist_to_rejected = 0.0
            if rejected_pair_keys:
                distances = []
                for rejected_pair_key in rejected_pair_keys:
                    rejected_vector = pair_vectors.get(rejected_pair_key)
                    if rejected_vector is not None:
                        dist = self._weighted_euclidean_distance(
                            pair_vector,
                            rejected_vector,
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_rejected = np.mean(distances)

            # Final score: similarity to selected - similarity to rejected
            score = -dist_to_selected + dist_to_rejected

            pair_scores.append(PairScore(pair_key=pair_key, score=float(score)))

        return pair_scores

    async def get_similarity_score_histogram(
        self,
        request: SimilarityHistogramRequest
    ) -> SimilarityHistogramResponse:
        """
        Calculate similarity scores and return histogram distribution for automatic tagging.

        Args:
            request: Request containing selected, rejected, and all feature IDs

        Returns:
            Response with scores and histogram data
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Extract metrics for all features
        logger.info(f"Extracting metrics for {len(request.feature_ids)} features for histogram")
        metrics_df = await self._extract_metrics(request.feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty histogram")
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Calculate or retrieve cached weights
        weights, weights_list = self._get_weights(metrics_df)

        # Calculate similarity scores for ALL features (including selected/rejected)
        logger.info(f"Calculating similarity scores for histogram")
        feature_scores = self._calculate_similarity_scores_for_histogram(
            metrics_df,
            weights,
            request.selected_ids,
            request.rejected_ids
        )

        # Create scores dictionary
        scores_dict = {str(item.feature_id): item.score for item in feature_scores}

        # Extract score values for histogram
        score_values = np.array([item.score for item in feature_scores])

        if len(score_values) == 0:
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Compute histogram (40 bins for good resolution)
        counts, bin_edges = np.histogram(score_values, bins=40)
        bins = (bin_edges[:-1] + bin_edges[1:]) / 2  # Bin centers

        # Compute statistics
        statistics = HistogramStatistics(
            min=float(np.min(score_values)),
            max=float(np.max(score_values)),
            mean=float(np.mean(score_values)),
            median=float(np.median(score_values))
        )

        logger.info(f"Successfully generated histogram for {len(feature_scores)} features")

        return SimilarityHistogramResponse(
            scores=scores_dict,
            histogram=HistogramData(
                bins=bins.tolist(),
                counts=counts.tolist(),
                bin_edges=bin_edges.tolist()
            ),
            statistics=statistics,
            total_items=len(feature_scores)
        )

    def _calculate_similarity_scores_for_histogram(
        self,
        metrics_df: pl.DataFrame,
        weights: np.ndarray,
        selected_ids: List[int],
        rejected_ids: List[int]
    ) -> List[FeatureScore]:
        """
        Calculate similarity scores for ALL features (including selected/rejected).

        This is different from _calculate_similarity_scores() which skips selected/rejected.
        For histogram visualization, we need scores for everything.

        Args:
            metrics_df: DataFrame with metrics for all features
            weights: Normalized weights for each metric
            selected_ids: Feature IDs marked as selected (✓)
            rejected_ids: Feature IDs marked as rejected (✗)

        Returns:
            List of FeatureScore objects for ALL features
        """
        # Convert to numpy for efficient distance calculation
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Calculate scores for each feature (including selected/rejected)
        feature_scores = []

        for i, feature_id in enumerate(feature_ids):
            # Calculate weighted distance to selected features
            dist_to_selected = 0.0
            if selected_ids:
                distances = []
                for selected_id in selected_ids:
                    selected_idx = np.where(feature_ids == selected_id)[0]
                    if len(selected_idx) > 0:
                        dist = self._weighted_euclidean_distance(
                            metrics_matrix[i],
                            metrics_matrix[selected_idx[0]],
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_selected = np.mean(distances)

            # Calculate weighted distance to rejected features
            dist_to_rejected = 0.0
            if rejected_ids:
                distances = []
                for rejected_id in rejected_ids:
                    rejected_idx = np.where(feature_ids == rejected_id)[0]
                    if len(rejected_idx) > 0:
                        dist = self._weighted_euclidean_distance(
                            metrics_matrix[i],
                            metrics_matrix[rejected_idx[0]],
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_rejected = np.mean(distances)

            # Final score: -dist_to_selected + dist_to_rejected
            # Positive score = closer to selected, negative = closer to rejected
            score = -dist_to_selected + dist_to_rejected

            feature_scores.append(FeatureScore(feature_id=int(feature_id), score=float(score)))

        return feature_scores

    async def get_pair_similarity_score_histogram(
        self,
        request: PairSimilarityHistogramRequest
    ) -> SimilarityHistogramResponse:
        """
        Calculate pair similarity scores and return histogram distribution for automatic tagging.

        Args:
            request: Request containing selected, rejected, and all pair keys

        Returns:
            Response with scores and histogram data
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Parse pair keys to (main_id, similar_id)
        pair_ids = []
        for pair_key in request.pair_keys:
            parts = pair_key.split('-')
            if len(parts) == 2:
                try:
                    main_id = int(parts[0])
                    similar_id = int(parts[1])
                    pair_ids.append((main_id, similar_id))
                except ValueError:
                    logger.warning(f"Invalid pair key format: {pair_key}")
                    continue

        if not pair_ids:
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Extract all unique feature IDs from pairs
        all_feature_ids = list(set(
            fid for main_id, similar_id in pair_ids for fid in (main_id, similar_id)
        ))

        logger.info(f"Extracting metrics for {len(all_feature_ids)} unique features in {len(pair_ids)} pairs for histogram")
        metrics_df = await self._extract_metrics(all_feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty histogram")
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Calculate or retrieve cached weights (base 9 metrics)
        weights_base, weights_list_base = self._get_weights(metrics_df)

        # Extract pair metrics (cosine_similarity from decoder_similarity)
        pair_metrics_dict = await self._extract_pair_metrics(pair_ids)

        # Calculate or use cached weights for pair metric
        pair_metric_weights, all_weights_list = self._get_pair_weights(
            metrics_df,
            pair_metrics_dict,
            weights_list_base
        )

        # Calculate similarity scores for ALL pairs (including selected/rejected)
        logger.info(f"Calculating similarity scores for {len(pair_ids)} pairs for histogram")
        pair_scores = self._calculate_pair_similarity_scores_for_histogram(
            metrics_df,
            pair_metrics_dict,
            pair_metric_weights,
            request.selected_pair_keys,
            request.rejected_pair_keys,
            pair_ids
        )

        # Create scores dictionary
        scores_dict = {item.pair_key: item.score for item in pair_scores}

        # Extract score values for histogram
        score_values = np.array([item.score for item in pair_scores])

        if len(score_values) == 0:
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Compute histogram (40 bins for good resolution)
        counts, bin_edges = np.histogram(score_values, bins=40)
        bins = (bin_edges[:-1] + bin_edges[1:]) / 2  # Bin centers

        # Compute statistics
        statistics = HistogramStatistics(
            min=float(np.min(score_values)),
            max=float(np.max(score_values)),
            mean=float(np.mean(score_values)),
            median=float(np.median(score_values))
        )

        logger.info(f"Successfully generated histogram for {len(pair_scores)} pairs")

        return SimilarityHistogramResponse(
            scores=scores_dict,
            histogram=HistogramData(
                bins=bins.tolist(),
                counts=counts.tolist(),
                bin_edges=bin_edges.tolist()
            ),
            statistics=statistics,
            total_items=len(pair_scores)
        )

    def _calculate_pair_similarity_scores_for_histogram(
        self,
        metrics_df: pl.DataFrame,
        pair_metrics: Dict[str, float],
        weights: np.ndarray,
        selected_pair_keys: List[str],
        rejected_pair_keys: List[str],
        pair_ids: List[Tuple[int, int]]
    ) -> List[PairScore]:
        """
        Calculate similarity scores for ALL pairs (including selected/rejected).

        This is different from _calculate_pair_similarity_scores() which skips selected/rejected.
        For histogram visualization, we need scores for everything.

        Args:
            metrics_df: DataFrame with metrics for all features
            pair_metrics: Dictionary mapping pair_key to cosine_similarity
            weights: 10-element weight vector
            selected_pair_keys: Pair keys marked as selected (✓)
            rejected_pair_keys: Pair keys marked as rejected (✗)
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            List of PairScore objects for ALL pairs
        """
        # Convert to numpy for efficient distance calculation
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Build pair vectors (19-dimensional)
        pair_vectors = {}
        pair_key_list = []

        for main_id, similar_id in pair_ids:
            pair_key = f"{main_id}-{similar_id}"
            pair_key_list.append(pair_key)

            # Get main and similar feature metrics
            main_idx = np.where(feature_ids == main_id)[0]
            similar_idx = np.where(feature_ids == similar_id)[0]

            if len(main_idx) == 0 or len(similar_idx) == 0:
                logger.warning(f"Missing metrics for pair {pair_key}")
                pair_vectors[pair_key] = None
                continue

            # Build 19-dim vector
            main_metrics = metrics_matrix[main_idx[0]]  # 9 dims
            similar_metrics = metrics_matrix[similar_idx[0]]  # 9 dims
            pair_metric = pair_metrics.get(pair_key, 0.0)  # 1 dim

            pair_vector = np.concatenate([main_metrics, similar_metrics, [pair_metric]])
            pair_vectors[pair_key] = pair_vector

        # Calculate scores for each pair (including selected/rejected)
        pair_scores = []

        for pair_key in pair_key_list:
            pair_vector = pair_vectors.get(pair_key)

            if pair_vector is None:
                continue

            # Calculate weighted distance to selected pairs
            dist_to_selected = 0.0
            if selected_pair_keys:
                distances = []
                for selected_pair_key in selected_pair_keys:
                    selected_vector = pair_vectors.get(selected_pair_key)
                    if selected_vector is not None:
                        dist = self._weighted_euclidean_distance(
                            pair_vector,
                            selected_vector,
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_selected = np.mean(distances)

            # Calculate weighted distance to rejected pairs
            dist_to_rejected = 0.0
            if rejected_pair_keys:
                distances = []
                for rejected_pair_key in rejected_pair_keys:
                    rejected_vector = pair_vectors.get(rejected_pair_key)
                    if rejected_vector is not None:
                        dist = self._weighted_euclidean_distance(
                            pair_vector,
                            rejected_vector,
                            weights
                        )
                        distances.append(dist)
                if distances:
                    dist_to_rejected = np.mean(distances)

            # Final score: similarity to selected - similarity to rejected
            score = -dist_to_selected + dist_to_rejected

            pair_scores.append(PairScore(pair_key=pair_key, score=float(score)))

        return pair_scores
