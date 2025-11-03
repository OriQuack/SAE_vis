"""
Table data service for feature-level score visualization (v2.0).

Clean 4-step flow:
1. Fetch scores from features.parquet
2. Fetch explanations from features.parquet (explanation_text column)
3. Extract pairwise similarity from nested semantic_similarity structure
4. Build response (pure assembly, no calculations)
"""

import polars as pl
import numpy as np
import logging
from typing import Dict, List, Optional, TYPE_CHECKING
from pathlib import Path

from ..models.common import Filters
from ..models.responses import (
    FeatureTableDataResponse, FeatureTableRow,
    ExplainerScoreData, ScorerScoreSet,
    HighlightedExplanation
)
from .consistency_service import ExplainerDataBuilder
from .alignment_service import AlignmentService

# Import for type hints only (avoids circular imports)
if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)

# Model name mapping for display
MODEL_NAME_MAP = {
    'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'llama',
    'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8': 'qwen',
    'openai/gpt-oss-20b': 'openai'
}


class TableDataService:
    """Service for generating table visualization data."""

    # Default explainers and scorers (matches pre-computed consistency data)
    DEFAULT_EXPLAINERS = [
        'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
        'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
        'openai/gpt-oss-20b'
    ]
    DEFAULT_SCORERS = DEFAULT_EXPLAINERS  # Same models used as scorers

    def __init__(self, data_service: "DataService", alignment_service: Optional[AlignmentService] = None):
        """
        Initialize TableDataService.

        Args:
            data_service: Instance of DataService for raw data access
            alignment_service: Optional AlignmentService for explanation highlighting
        """
        self.data_service = data_service
        self.alignment_service = alignment_service

    async def get_table_data(self, filters: Filters) -> FeatureTableDataResponse:
        """
        Generate feature-level table data (v2.0 - consistency removed).

        Clean 4-step flow:
        1. Fetch scores from features.parquet
        2. Fetch explanations from features.parquet
        3. Extract pairwise similarity from nested semantic_similarity structure
        4. Build response (pure assembly, no calculations)

        Args:
            filters: Filter criteria for data selection

        Returns:
            FeatureTableDataResponse with features and metadata
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Validate filters are default (all 3 explainers/scorers selected)
        if not self._is_default_configuration(filters, self.DEFAULT_EXPLAINERS):
            raise ValueError(
                "Only default filters are supported. "
                "All three explainers and scorers must be selected, "
                "with no sae_id or explanation_method filters applied."
            )

        # STEP 1: Fetch scores from features.parquet
        scores_df = self._fetch_scores(filters)

        # Extract metadata
        feature_ids = sorted(scores_df["feature_id"].unique().to_list())
        explainer_ids = scores_df["llm_explainer"].unique().to_list()
        scorer_ids = sorted(scores_df["llm_scorer"].unique().to_list())

        # Create scorer mapping
        scorer_map = {scorer: f"s{i+1}" for i, scorer in enumerate(scorer_ids)}

        # STEP 2: Fetch explanations from features.parquet
        explanations_df = self._fetch_explanations(filters)

        # STEP 3: Fetch pairwise semantic similarity data from nested structure
        pairwise_df = self._fetch_pairwise_similarity(feature_ids, explainer_ids)

        # STEP 4: Build response (pure assembly, no calculations)
        features = self._build_feature_rows_simple(
            scores_df, explanations_df, pairwise_df,
            feature_ids, explainer_ids, scorer_map
        )

        # Compute global stats for frontend normalization
        global_stats = self._compute_global_stats(scores_df, explainer_ids, feature_ids)

        return FeatureTableDataResponse(
            features=features,
            total_features=len(features),
            explainer_ids=[MODEL_NAME_MAP.get(exp, exp) for exp in explainer_ids],
            scorer_ids=scorer_ids,
            global_stats=global_stats
        )

    def _fetch_scores(self, filters: Filters) -> pl.DataFrame:
        """
        STEP 1: Fetch scores from features.parquet with filters applied.

        NOTE: Assumes default filters (all 3 explainers/scorers). Validation done in get_table_data().

        Args:
            filters: Filter criteria (validated to be default)

        Returns:
            DataFrame with scores (feature_id, llm_explainer, llm_scorer, scores, z_scores)
        """
        lf = self.data_service._df_lazy

        # Default-only mode: filter to DEFAULT_EXPLAINERS and DEFAULT_SCORERS
        lf = lf.filter(
            pl.col("llm_explainer").is_in(self.DEFAULT_EXPLAINERS) &
            pl.col("llm_scorer").is_in(self.DEFAULT_SCORERS)
        )

        # Select base columns (raw scores)
        base_columns = [
            "feature_id", "llm_explainer", "llm_scorer",
            "score_embedding", "score_fuzz", "score_detection"
        ]

        # Add additional columns if available
        available_columns = lf.columns
        if "feature_splitting" in available_columns:
            base_columns.append("feature_splitting")
        if "decoder_similarity" in available_columns:
            base_columns.append("decoder_similarity")

        df = lf.select(base_columns).collect()

        # Compute z-scores for each metric
        # Z-score = (value - mean) / std
        for score_col in ["score_embedding", "score_fuzz", "score_detection"]:
            z_col = score_col.replace("score_", "z_score_")
            mean = df[score_col].mean()
            std = df[score_col].std()

            if std is not None and std > 0:
                df = df.with_columns([
                    ((pl.col(score_col) - mean) / std).alias(z_col)
                ])
            else:
                # If std is 0 or null, set z-score to 0
                df = df.with_columns([
                    pl.lit(0.0).alias(z_col)
                ])

        # Compute overall_score as average of z-scores
        df = df.with_columns([
            ((pl.col("z_score_embedding") + pl.col("z_score_fuzz") + pl.col("z_score_detection")) / 3.0)
            .alias("overall_score")
        ])

        logger.info(f"Fetched scores: {len(df)} rows, {df['feature_id'].n_unique()} unique features")
        return df


    def _is_default_configuration(self, filters: Filters, explainer_ids: List[str]) -> bool:
        """
        Check if current filters match default configuration.

        Args:
            filters: Filter criteria
            explainer_ids: List of explainer IDs from scores

        Returns:
            True if all filters are default/empty, False otherwise
        """
        # Check explainers
        if filters.llm_explainer and len(filters.llm_explainer) > 0:
            # If explainer filter is set, check if it matches defaults
            if set(filters.llm_explainer) != set(self.DEFAULT_EXPLAINERS):
                return False
        else:
            # If no explainer filter, check if actual explainers match defaults
            if set(explainer_ids) != set(self.DEFAULT_EXPLAINERS):
                return False

        # Check scorers
        if filters.llm_scorer and len(filters.llm_scorer) > 0:
            if set(filters.llm_scorer) != set(self.DEFAULT_SCORERS):
                return False

        # Check other filters (sae_id, explanation_method should be empty for default)
        if filters.sae_id and len(filters.sae_id) > 0:
            return False
        if filters.explanation_method and len(filters.explanation_method) > 0:
            return False

        return True

    def _fetch_explanations(self, filters: Filters) -> Optional[pl.DataFrame]:
        """
        STEP 3: Fetch explanations from features.parquet (explanation_text column).

        NOTE: Assumes default filters, no filtering applied.

        Args:
            filters: Filter criteria (validated to be default)

        Returns:
            DataFrame with explanations (feature_id, llm_explainer, explanation_text)
        """
        try:
            # Get the main lazy frame from DataService
            df_lazy = self.data_service._df_lazy

            if df_lazy is None:
                logger.warning("DataService lazy frame is not initialized")
                return None

            # Select relevant columns and filter to DEFAULT_EXPLAINERS
            explanations_df = (
                df_lazy
                .filter(pl.col("llm_explainer").is_in(self.DEFAULT_EXPLAINERS))
                .select(["feature_id", "llm_explainer", "explanation_text"])
                .unique()  # Remove duplicates since explanations are same across scorers
                .collect()
            )

            # COMMENTED OUT: Dynamic explainer filtering (unused in default-only mode)
            # # Filter to match selected explainers if provided
            # if filters.llm_explainer and len(filters.llm_explainer) > 0:
            #     explanations_df = explanations_df.filter(
            #         pl.col("llm_explainer").is_in(filters.llm_explainer)
            #     )

            logger.info(f"Fetched explanations: {len(explanations_df)} rows")
            return explanations_df
        except Exception as e:
            logger.warning(f"Explanations data not available: {e}")
            return None

    def _fetch_pairwise_similarity(
        self,
        feature_ids: List[int],
        explainer_ids: List[str]
    ) -> Optional[pl.DataFrame]:
        """
        Extract pairwise semantic similarity from nested semantic_similarity structure (v2.0).

        semantic_similarity is List(Struct([explainer: Categorical, cosine_similarity: Float32]))
        We need to transform this to pairwise format: (feature_id, explainer_1, explainer_2, cosine_similarity)

        Args:
            feature_ids: List of feature IDs to filter
            explainer_ids: List of explainer IDs to filter

        Returns:
            DataFrame with pairwise similarities (feature_id, explainer_1, explainer_2, cosine_similarity)
            or None if data not available
        """
        try:
            pl.enable_string_cache()

            # Load features.parquet with semantic_similarity nested structure
            lf = self.data_service._df_lazy

            # Filter to requested features and explainers
            lf = lf.filter(
                pl.col("feature_id").is_in(feature_ids) &
                pl.col("llm_explainer").is_in(explainer_ids)
            )

            # Select only needed columns
            df = lf.select(["feature_id", "llm_explainer", "semantic_similarity"]).collect()

            # Transform nested structure to pairwise format
            pairwise_rows = []
            for row in df.iter_rows(named=True):
                feature_id = row["feature_id"]
                explainer_1 = row["llm_explainer"]
                semantic_sim_list = row["semantic_similarity"]

                if semantic_sim_list:
                    for sim_struct in semantic_sim_list:
                        explainer_2 = sim_struct["explainer"]
                        cosine_sim = sim_struct["cosine_similarity"]

                        # Add pairwise row
                        pairwise_rows.append({
                            "feature_id": feature_id,
                            "explainer_1": explainer_1,
                            "explainer_2": explainer_2,
                            "cosine_similarity": cosine_sim
                        })

            if not pairwise_rows:
                logger.warning("No pairwise similarity data extracted from nested structure")
                return None

            # Create DataFrame from extracted pairwise data
            pairwise_df = pl.DataFrame(pairwise_rows)

            logger.info(f"Extracted pairwise similarity from nested structure: {len(pairwise_df)} rows")
            return pairwise_df

        except Exception as e:
            logger.warning(f"Could not extract pairwise similarity from nested structure: {e}")
            return None

    def _compute_global_stats(
        self,
        scores_df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int]
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute global statistics for frontend z-score normalization.

        Flow: simple scores -> z-scores -> min-max normalization -> color

        Args:
            scores_df: Scores DataFrame
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs

        Returns:
            Dict with global stats: {'metric_name': {'mean': float, 'std': float, 'min': float, 'max': float, 'z_min': float, 'z_max': float}}
        """
        embedding_values = []
        fuzz_values = []
        detection_values = []

        for feature_id in feature_ids:
            feature_df = scores_df.filter(pl.col("feature_id") == feature_id)

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Embedding (one per explainer) - take first non-null value
                emb = explainer_df["score_embedding"].to_list()
                for emb_val in emb:
                    if emb_val is not None:
                        embedding_values.append(emb_val)
                        break

                # Fuzz and detection (averaged across scorers)
                fuzz = explainer_df["score_fuzz"].to_list()
                fuzz_avg = np.mean([s for s in fuzz if s is not None]) if any(s is not None for s in fuzz) else None
                if fuzz_avg is not None:
                    fuzz_values.append(fuzz_avg)

                det = explainer_df["score_detection"].to_list()
                det_avg = np.mean([s for s in det if s is not None]) if any(s is not None for s in det) else None
                if det_avg is not None:
                    detection_values.append(det_avg)

        # Compute global statistics with z-score min/max
        global_stats = {}

        if len(embedding_values) >= 2:
            mean = float(np.mean(embedding_values))
            std = float(np.std(embedding_values, ddof=1))

            # Calculate z-scores for all values
            z_scores = [(v - mean) / std if std > 0 else 0 for v in embedding_values]

            global_stats['embedding'] = {
                'mean': mean,
                'std': std,
                'min': float(np.min(embedding_values)),
                'max': float(np.max(embedding_values)),
                'z_min': float(np.min(z_scores)),
                'z_max': float(np.max(z_scores))
            }

        if len(fuzz_values) >= 2:
            mean = float(np.mean(fuzz_values))
            std = float(np.std(fuzz_values, ddof=1))

            # Calculate z-scores for all values
            z_scores = [(v - mean) / std if std > 0 else 0 for v in fuzz_values]

            global_stats['fuzz'] = {
                'mean': mean,
                'std': std,
                'min': float(np.min(fuzz_values)),
                'max': float(np.max(fuzz_values)),
                'z_min': float(np.min(z_scores)),
                'z_max': float(np.max(z_scores))
            }

        if len(detection_values) >= 2:
            mean = float(np.mean(detection_values))
            std = float(np.std(detection_values, ddof=1))

            # Calculate z-scores for all values
            z_scores = [(v - mean) / std if std > 0 else 0 for v in detection_values]

            global_stats['detection'] = {
                'mean': mean,
                'std': std,
                'min': float(np.min(detection_values)),
                'max': float(np.max(detection_values)),
                'z_min': float(np.min(z_scores)),
                'z_max': float(np.max(z_scores))
            }

        # Calculate overall z-score min/max (for overall score color encoding)
        # Overall z-score = average of (z_embedding, z_fuzz, z_detection)
        if 'embedding' in global_stats and 'fuzz' in global_stats and 'detection' in global_stats:
            overall_z_scores = []

            # Re-iterate through features to calculate averaged z-scores
            emb_mean = global_stats['embedding']['mean']
            emb_std = global_stats['embedding']['std']
            fuzz_mean = global_stats['fuzz']['mean']
            fuzz_std = global_stats['fuzz']['std']
            det_mean = global_stats['detection']['mean']
            det_std = global_stats['detection']['std']

            # Use the same iteration as before to maintain consistency
            for i, emb_val in enumerate(embedding_values):
                if i < len(fuzz_values) and i < len(detection_values):
                    # Calculate z-scores
                    z_emb = (emb_val - emb_mean) / emb_std if emb_std > 0 else 0
                    z_fuzz = (fuzz_values[i] - fuzz_mean) / fuzz_std if fuzz_std > 0 else 0
                    z_det = (detection_values[i] - det_mean) / det_std if det_std > 0 else 0

                    # Average the z-scores
                    avg_z = (z_emb + z_fuzz + z_det) / 3
                    overall_z_scores.append(avg_z)

            if overall_z_scores:
                # For overall, we only use z_min and z_max, but Pydantic schema requires all fields
                # Set mean, std, min, max to dummy values (0.0) since they're not used
                global_stats['overall'] = {
                    'mean': 0.0,
                    'std': 1.0,
                    'min': 0.0,
                    'max': 1.0,
                    'z_min': float(np.min(overall_z_scores)),
                    'z_max': float(np.max(overall_z_scores))
                }

        return global_stats

    def _build_feature_rows_simple(
        self,
        scores_df: pl.DataFrame,
        explanations_df: Optional[pl.DataFrame],
        pairwise_df: Optional[pl.DataFrame],
        feature_ids: List[int],
        explainer_ids: List[str],
        scorer_map: Dict[str, str]
    ) -> List[FeatureTableRow]:
        """
        STEP 4: Build feature rows (pure assembly, no calculations) - v2.0 without consistency.

        Args:
            scores_df: Scores DataFrame from features.parquet
            explanations_df: Explanations DataFrame (optional)
            pairwise_df: Pairwise similarity DataFrame (optional)
            feature_ids: List of feature IDs
            explainer_ids: List of explainer IDs
            scorer_map: Mapping from scorer ID to s1/s2/s3

        Returns:
            List of FeatureTableRow objects
        """
        features = []

        for feature_id in feature_ids:
            # Filter data for this feature
            feature_scores = scores_df.filter(pl.col("feature_id") == feature_id)
            feature_pairwise = pairwise_df.filter(pl.col("feature_id") == feature_id) if pairwise_df is not None else None

            # Extract decoder_similarity (new format) or feature_splitting (legacy format)
            # Note: decoder_similarity is a list of structs, same for all explainers
            decoder_similarity = None

            if len(feature_scores) > 0:
                if "decoder_similarity" in feature_scores.columns:
                    # New format: extract list of similar features
                    # Just get the first row since decoder_similarity is same for all rows of this feature
                    decoder_sim_value = feature_scores["decoder_similarity"][0]
                    if decoder_sim_value is not None:
                        # Convert from Polars struct to dict format for Pydantic
                        decoder_similarity = [
                            {"feature_id": int(item["feature_id"]), "cosine_similarity": float(item["cosine_similarity"])}
                            for item in decoder_sim_value
                        ]
                elif "feature_splitting" in feature_scores.columns:
                    # Legacy format: feature_splitting was a float (deprecated)
                    # We don't set decoder_similarity for legacy data
                    pass

            explainers_dict = {}
            for explainer in explainer_ids:
                # Filter for this explainer
                explainer_scores = feature_scores.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_scores) == 0:
                    continue

                # Extract scores using helper
                fuzz_dict, detection_dict, embedding_score = ExplainerDataBuilder.extract_scores_from_explainer_df(
                    explainer_scores, scorer_map
                )

                # Look up explanation text
                explanation_text = ExplainerDataBuilder.lookup_explanation_text(
                    feature_id, explainer, explanations_df
                )

                # Get highlighted explanation if alignment service available
                highlighted_explanation = None
                if self.alignment_service and self.alignment_service.is_ready:
                    try:
                        segments = self.alignment_service.get_highlighted_explanation(
                            feature_id, explainer, explainer_ids
                        )
                        if segments:
                            highlighted_explanation = HighlightedExplanation(segments=segments)
                    except Exception as e:
                        logger.debug(f"Could not get highlighted explanation for feature {feature_id}, explainer {explainer}: {e}")

                # Build explainer data
                explainer_key = MODEL_NAME_MAP.get(explainer, explainer)

                # Build semantic similarity dict for this explainer
                semantic_similarity = self._build_semantic_similarity(
                    explainer, explainer_ids, feature_pairwise
                )

                explainers_dict[explainer_key] = ExplainerScoreData(
                    embedding=embedding_score,
                    fuzz=ScorerScoreSet(
                        s1=fuzz_dict.get("s1"),
                        s2=fuzz_dict.get("s2"),
                        s3=fuzz_dict.get("s3")
                    ),
                    detection=ScorerScoreSet(
                        s1=detection_dict.get("s1"),
                        s2=detection_dict.get("s2"),
                        s3=detection_dict.get("s3")
                    ),
                    explanation_text=explanation_text,
                    highlighted_explanation=highlighted_explanation,
                    semantic_similarity=semantic_similarity
                )

            if explainers_dict:
                features.append(FeatureTableRow(
                    feature_id=feature_id,
                    decoder_similarity=decoder_similarity,
                    explainers=explainers_dict
                ))

        logger.info(f"Built {len(features)} feature rows")
        return features


    def _build_semantic_similarity(
        self,
        current_explainer: str,
        all_explainer_ids: List[str],
        pairwise_df: Optional[pl.DataFrame]
    ) -> Optional[Dict[str, float]]:
        """
        Build semantic similarity dict for current explainer.

        Args:
            current_explainer: Current explainer ID (full model name)
            all_explainer_ids: List of all explainer IDs
            pairwise_df: Pairwise similarity DataFrame for this feature

        Returns:
            Dict mapping other explainer names (mapped) to cosine similarity values, or None if no data
        """
        if pairwise_df is None or len(pairwise_df) == 0:
            return None

        similarity_dict = {}

        # Iterate through all explainers to find pairwise similarities
        for other_explainer in all_explainer_ids:
            if other_explainer == current_explainer:
                continue

            # Look for row where current_explainer and other_explainer are paired
            # Check both orderings: (explainer_1=current, explainer_2=other) or vice versa
            pair_row = pairwise_df.filter(
                ((pl.col("explainer_1") == current_explainer) & (pl.col("explainer_2") == other_explainer)) |
                ((pl.col("explainer_1") == other_explainer) & (pl.col("explainer_2") == current_explainer))
            )

            if len(pair_row) > 0:
                cosine_sim = pair_row["cosine_similarity"].to_list()[0]
                if cosine_sim is not None:
                    # Map other_explainer to display name
                    other_explainer_key = MODEL_NAME_MAP.get(other_explainer, other_explainer)
                    similarity_dict[other_explainer_key] = float(cosine_sim)

        return similarity_dict if similarity_dict else None

    # COMMENTED OUT: _load_pairwise_data() - unused in default-only mode (only for dynamic consistency calculation)
    # def _load_pairwise_data(self) -> Optional[pl.DataFrame]:
    #     """
    #     Load pairwise semantic similarity data if available.
    #
    #     Returns:
    #         DataFrame with pairwise similarities, or None if not available
    #     """
    #     try:
    #         pairwise_df = pl.read_parquet(self.pairwise_similarity_file)
    #         logger.info(f"Loaded pairwise similarity data: {len(pairwise_df)} rows")
    #         return pairwise_df
    #     except Exception as e:
    #         logger.warning(f"Pairwise similarity data not available: {e}")
    #         return None
