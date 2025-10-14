"""
Table data endpoint for LLM scoring visualization.

Provides feature-level score data (824 rows, one per feature) for table visualization.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, List, Optional
import polars as pl
import numpy as np

from app.models.requests import TableDataRequest
from app.models.responses import FeatureTableDataResponse, FeatureTableRow, ExplainerScoreData, ScorerScoreSet, ConsistencyScore
from app.services.visualization_service import DataService

router = APIRouter()

# Model name mapping for short display names
MODEL_NAME_MAP = {
    'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'llama',
    'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8': 'qwen',
    'openai/gpt-oss-20b': 'openai'
}


def compute_coefficient_variation(scores: List[Optional[float]]) -> Optional[ConsistencyScore]:
    """
    Compute coefficient of variation (CV) for scorer consistency using inverse CV formula.
    Consistency = 1 / (1 + CV) where CV = std / mean
    Returns consistency score where 0 = inconsistent, 1 = highly consistent.
    """
    # Filter out None values
    valid_scores = [s for s in scores if s is not None]

    if len(valid_scores) < 2:
        return None

    scores_array = np.array(valid_scores)
    mean = np.mean(scores_array)
    std = np.std(scores_array, ddof=1)  # Sample std deviation

    # Handle edge cases
    if mean == 0 or np.isclose(mean, 0):
        # If mean is 0, CV is undefined
        if std == 0 or np.isclose(std, 0):
            # Both mean and std are 0 - perfect consistency
            return ConsistencyScore(value=1.0, method="inverse_cv")
        else:
            # Mean is 0 but std is not - inconsistent
            return ConsistencyScore(value=0.0, method="inverse_cv")

    cv = std / abs(mean)

    # Inverse CV formula: consistency = 1 / (1 + CV)
    consistency = 1.0 / (1.0 + cv)

    return ConsistencyScore(
        value=float(round(consistency, 3)),
        method="inverse_cv"
    )


def compute_normalized_std(scores: List[Optional[float]]) -> Optional[ConsistencyScore]:
    """
    Compute normalized standard deviation for metric consistency.
    Normalizes all scores to 0-1 range first, then computes std.
    Returns consistency score where 0 = inconsistent, 1 = highly consistent.
    """
    # Filter out None values
    valid_scores = [s for s in scores if s is not None]

    if len(valid_scores) < 2:
        return None

    scores_array = np.array(valid_scores)

    # Normalize scores to 0-1 range (they should already be 0-1 for our metrics)
    min_score = np.min(scores_array)
    max_score = np.max(scores_array)

    if max_score - min_score == 0 or np.isclose(max_score, min_score):
        # All scores are the same - perfect consistency
        return ConsistencyScore(value=1.0, method="normalized_std")

    normalized = (scores_array - min_score) / (max_score - min_score)

    # Compute standard deviation of normalized scores
    std = np.std(normalized, ddof=1)

    # Convert std to consistency (0 std = 1 consistency, max std = 0 consistency)
    # Max std for normalized 0-1 data is ~0.5 (when values are at extremes)
    normalized_std = min(std / 0.5, 1.0)
    consistency = 1.0 - normalized_std

    return ConsistencyScore(
        value=float(round(consistency, 3)),
        method="normalized_std"
    )


def compute_metric_consistency_global(
    embedding: Optional[float],
    fuzz: Optional[float],
    detection: Optional[float],
    global_stats: Dict[str, Dict[str, float]]
) -> Optional[ConsistencyScore]:
    """
    Compute metric consistency using global z-score normalization.
    Normalizes each metric by global mean/std across all features, then computes std of z-scores.
    Returns consistency score where 0 = inconsistent, 1 = highly consistent.
    """
    # Collect metric values that are not None
    metric_values = []
    metric_names = []

    if embedding is not None and 'embedding' in global_stats:
        metric_values.append(embedding)
        metric_names.append('embedding')
    if fuzz is not None and 'fuzz' in global_stats:
        metric_values.append(fuzz)
        metric_names.append('fuzz')
    if detection is not None and 'detection' in global_stats:
        metric_values.append(detection)
        metric_names.append('detection')

    # Need at least 2 metrics to compute consistency
    if len(metric_values) < 2:
        return None

    # Compute z-scores for each metric
    z_scores = []
    for value, name in zip(metric_values, metric_names):
        stats = global_stats[name]
        mean = stats['mean']
        std = stats['std']

        # Avoid division by zero
        if std == 0 or np.isclose(std, 0):
            # If std is 0, all values are the same - use 0 as z-score
            z_score = 0.0
        else:
            z_score = (value - mean) / std

        z_scores.append(z_score)

    # Compute standard deviation of z-scores
    z_scores_array = np.array(z_scores)
    std_z = np.std(z_scores_array, ddof=1)

    # Convert std to consistency
    # For z-scores, std typically ranges from 0 to ~2.0 (values within ~2 std of each other)
    # Higher std = lower consistency
    normalized_std = min(std_z / 2.0, 1.0)
    consistency = 1.0 - normalized_std

    return ConsistencyScore(
        value=float(round(consistency, 3)),
        method="global_zscore"
    )


def compute_explainer_semantic_consistency(
    feature_id: int,
    selected_explainers: List[str],
    pairwise_df: pl.DataFrame
) -> Optional[ConsistencyScore]:
    """
    Compute LLM explainer semantic consistency as average pairwise cosine similarity.
    Returns consistency score where 0 = inconsistent, 1 = highly consistent.
    """
    if len(selected_explainers) < 2:
        return None

    # Filter pairwise data for this feature
    feature_pairs = pairwise_df.filter(pl.col("feature_id") == feature_id)

    if len(feature_pairs) == 0:
        return None

    # Filter to only selected explainers
    relevant_pairs = feature_pairs.filter(
        pl.col("explainer_1").is_in(selected_explainers) &
        pl.col("explainer_2").is_in(selected_explainers)
    )

    if len(relevant_pairs) == 0:
        return None

    # Get cosine similarities
    similarities = relevant_pairs["cosine_similarity"].to_list()

    if not similarities or len(similarities) == 0:
        return None

    # Average pairwise cosine similarity
    avg_similarity = float(np.mean(similarities))

    return ConsistencyScore(
        value=float(round(avg_similarity, 3)),
        method="avg_pairwise_cosine"
    )


def compute_cross_explainer_metric_cv(
    metric_scores: List[Optional[float]]
) -> Optional[ConsistencyScore]:
    """
    Compute cross-explainer metric consistency using inverse coefficient of variation.
    Consistency = 1 / (1 + CV) where CV = std / mean
    Returns consistency score where 0 = inconsistent, 1 = highly consistent.
    """
    # Filter out None values
    valid_scores = [s for s in metric_scores if s is not None]

    if len(valid_scores) < 2:
        return None

    scores_array = np.array(valid_scores)
    mean = np.mean(scores_array)
    std = np.std(scores_array, ddof=1)  # Sample std deviation

    # Handle edge cases
    if mean == 0 or np.isclose(mean, 0):
        # If mean is 0, CV is undefined
        if std == 0 or np.isclose(std, 0):
            # Both mean and std are 0 - perfect consistency
            return ConsistencyScore(value=1.0, method="inverse_cv")
        else:
            # Mean is 0 but std is not - inconsistent
            return ConsistencyScore(value=0.0, method="inverse_cv")

    cv = std / abs(mean)

    # Inverse CV formula: consistency = 1 / (1 + CV)
    consistency = 1.0 / (1.0 + cv)

    return ConsistencyScore(
        value=float(round(consistency, 3)),
        method="inverse_cv"
    )


def get_data_service() -> DataService:
    """Dependency to get the data service instance."""
    from app.main import data_service
    if not data_service:
        raise HTTPException(status_code=503, detail="Data service not initialized")
    return data_service


@router.post("/table-data", response_model=FeatureTableDataResponse)
async def get_table_data(
    request: TableDataRequest,
    service: DataService = Depends(get_data_service)
) -> FeatureTableDataResponse:
    """
    Get feature-level score data for table visualization.

    Returns 824 rows (one per feature) with scores organized by explainer.
    Each explainer has: embedding (1 value) + fuzz (3 scorers) + detection (3 scorers).
    """
    try:
        # Get the lazy frame
        lf = service._df_lazy

        # Apply filters
        filter_conditions = []
        if request.filters.sae_id and len(request.filters.sae_id) > 0:
            filter_conditions.append(
                pl.col("sae_id").is_in(request.filters.sae_id)
            )
        if request.filters.explanation_method and len(request.filters.explanation_method) > 0:
            filter_conditions.append(
                pl.col("explanation_method").is_in(request.filters.explanation_method)
            )
        if request.filters.llm_explainer and len(request.filters.llm_explainer) > 0:
            filter_conditions.append(
                pl.col("llm_explainer").is_in(request.filters.llm_explainer)
            )
        if request.filters.llm_scorer and len(request.filters.llm_scorer) > 0:
            filter_conditions.append(
                pl.col("llm_scorer").is_in(request.filters.llm_scorer)
            )

        # Apply all filters
        if filter_conditions:
            for condition in filter_conditions:
                lf = lf.filter(condition)

        # Select needed columns
        df = lf.select([
            "feature_id",
            "llm_explainer",
            "llm_scorer",
            "score_embedding",
            "score_fuzz",
            "score_detection"
        ]).collect()

        # Get unique feature IDs and explainers
        feature_ids = sorted(df["feature_id"].unique().to_list())
        explainer_ids = df["llm_explainer"].unique().to_list()
        scorer_ids = sorted(df["llm_scorer"].unique().to_list())

        # Determine if we should average across scorers (multiple explainers selected)
        is_averaged = len(explainer_ids) > 1

        # Map scorer IDs to s1, s2, s3
        scorer_map = {scorer: f"s{i+1}" for i, scorer in enumerate(scorer_ids)}

        # Load pairwise semantic similarity data for explainer consistency
        pairwise_df = None
        if is_averaged:
            try:
                pairwise_df = pl.read_parquet("/home/dohyun/interface/data/master/semantic_similarity_pairwise.parquet")
            except Exception as e:
                # If pairwise data is not available, explainer consistency will be None
                pass

        # ============================================================================
        # PASS 1: Collect all metric values for global statistics
        # ============================================================================
        embedding_values = []
        fuzz_values = []
        detection_values = []

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Get embedding score
                embedding_scores = explainer_df["score_embedding"].to_list()
                embedding_score = embedding_scores[0] if embedding_scores else None
                if embedding_score is not None:
                    embedding_values.append(embedding_score)

                # Get fuzz and detection scores (averaged across scorers)
                fuzz_scores = explainer_df["score_fuzz"].to_list()
                detection_scores = explainer_df["score_detection"].to_list()

                fuzz_avg = np.mean([s for s in fuzz_scores if s is not None]) if any(s is not None for s in fuzz_scores) else None
                detection_avg = np.mean([s for s in detection_scores if s is not None]) if any(s is not None for s in detection_scores) else None

                if fuzz_avg is not None:
                    fuzz_values.append(fuzz_avg)
                if detection_avg is not None:
                    detection_values.append(detection_avg)

        # Compute global statistics for each metric
        global_stats = {}
        if len(embedding_values) >= 2:
            global_stats['embedding'] = {
                'mean': float(np.mean(embedding_values)),
                'std': float(np.std(embedding_values, ddof=1))
            }
        if len(fuzz_values) >= 2:
            global_stats['fuzz'] = {
                'mean': float(np.mean(fuzz_values)),
                'std': float(np.std(fuzz_values, ddof=1))
            }
        if len(detection_values) >= 2:
            global_stats['detection'] = {
                'mean': float(np.mean(detection_values)),
                'std': float(np.std(detection_values, ddof=1))
            }

        # ============================================================================
        # PASS 1.5: Compute cross-explainer metric consistency
        # ============================================================================
        cross_explainer_consistency_map = {}

        if is_averaged and len(explainer_ids) >= 2:
            for feature_id in feature_ids:
                feature_df = df.filter(pl.col("feature_id") == feature_id)

                # Collect scores for each metric across explainers
                embedding_scores = []
                fuzz_scores_across = []
                detection_scores_across = []

                for explainer in explainer_ids:
                    explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                    if len(explainer_df) == 0:
                        continue

                    # Embedding (one per explainer)
                    emb = explainer_df["score_embedding"].to_list()
                    if emb and emb[0] is not None:
                        embedding_scores.append(emb[0])

                    # Fuzz (averaged across scorers)
                    fuzz = explainer_df["score_fuzz"].to_list()
                    fuzz_avg = np.mean([s for s in fuzz if s is not None]) if any(s is not None for s in fuzz) else None
                    if fuzz_avg is not None:
                        fuzz_scores_across.append(fuzz_avg)

                    # Detection (averaged across scorers)
                    det = explainer_df["score_detection"].to_list()
                    det_avg = np.mean([s for s in det if s is not None]) if any(s is not None for s in det) else None
                    if det_avg is not None:
                        detection_scores_across.append(det_avg)

                # Compute inverse CV for each metric
                consistency_dict = {}

                emb_cv = compute_cross_explainer_metric_cv(embedding_scores)
                if emb_cv:
                    consistency_dict['embedding'] = emb_cv

                fuzz_cv = compute_cross_explainer_metric_cv(fuzz_scores_across)
                if fuzz_cv:
                    consistency_dict['fuzz'] = fuzz_cv

                det_cv = compute_cross_explainer_metric_cv(detection_scores_across)
                if det_cv:
                    consistency_dict['detection'] = det_cv

                if consistency_dict:
                    cross_explainer_consistency_map[feature_id] = consistency_dict

        # ============================================================================
        # PASS 2: Build feature rows with global statistics
        # ============================================================================
        features = []
        for feature_id in feature_ids:
            # Filter data for this feature
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            explainers_dict = {}
            for explainer in explainer_ids:
                # Filter for this explainer
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Get embedding score (one per explainer, not averaged)
                embedding_scores = explainer_df["score_embedding"].to_list()
                embedding_score = round(embedding_scores[0], 3) if embedding_scores else None

                # Use short name for explainer
                explainer_key = MODEL_NAME_MAP.get(explainer, explainer)

                if is_averaged:
                    # Average scores across all scorers for fuzz and detection
                    fuzz_scores = explainer_df["score_fuzz"].to_list()
                    detection_scores = explainer_df["score_detection"].to_list()

                    fuzz_avg = round(sum(s for s in fuzz_scores if s is not None) / len([s for s in fuzz_scores if s is not None]), 3) if any(s is not None for s in fuzz_scores) else None
                    detection_avg = round(sum(s for s in detection_scores if s is not None) / len([s for s in detection_scores if s is not None]), 3) if any(s is not None for s in detection_scores) else None

                    # Compute metric consistency using global z-score normalization
                    metric_consistency = compute_metric_consistency_global(
                        embedding_score, fuzz_avg, detection_avg, global_stats
                    )

                    # Compute explainer semantic consistency (average pairwise cosine similarity)
                    explainer_consistency = None
                    if pairwise_df is not None:
                        explainer_consistency = compute_explainer_semantic_consistency(
                            feature_id, explainer_ids, pairwise_df
                        )

                    # Get cross-explainer consistency for this feature (same for all explainers)
                    cross_explainer_consistency = cross_explainer_consistency_map.get(feature_id)

                    explainers_dict[explainer_key] = ExplainerScoreData(
                        embedding=embedding_score,
                        fuzz=ScorerScoreSet(s1=fuzz_avg, s2=None, s3=None),
                        detection=ScorerScoreSet(s1=detection_avg, s2=None, s3=None),
                        scorer_consistency=None,  # Not applicable when averaged
                        metric_consistency=metric_consistency,
                        explainer_consistency=explainer_consistency,
                        cross_explainer_metric_consistency=cross_explainer_consistency
                    )
                else:
                    # Get individual fuzz and detection scores per scorer
                    fuzz_dict = {}
                    detection_dict = {}

                    for _, row in enumerate(explainer_df.iter_rows(named=True)):
                        scorer = row["llm_scorer"]
                        scorer_key = scorer_map[scorer]

                        fuzz_dict[scorer_key] = round(row["score_fuzz"], 3) if row["score_fuzz"] is not None else None
                        detection_dict[scorer_key] = round(row["score_detection"], 3) if row["score_detection"] is not None else None

                    # Compute scorer consistency (CV) for each metric
                    fuzz_scores_list = [fuzz_dict.get("s1"), fuzz_dict.get("s2"), fuzz_dict.get("s3")]
                    detection_scores_list = [detection_dict.get("s1"), detection_dict.get("s2"), detection_dict.get("s3")]

                    scorer_consistency = {}
                    fuzz_cv = compute_coefficient_variation(fuzz_scores_list)
                    if fuzz_cv:
                        scorer_consistency["fuzz"] = fuzz_cv

                    detection_cv = compute_coefficient_variation(detection_scores_list)
                    if detection_cv:
                        scorer_consistency["detection"] = detection_cv

                    # Compute metric consistency using global z-score normalization
                    # Use average of scorers for each metric
                    fuzz_avg = np.mean([s for s in fuzz_scores_list if s is not None]) if any(s is not None for s in fuzz_scores_list) else None
                    detection_avg = np.mean([s for s in detection_scores_list if s is not None]) if any(s is not None for s in detection_scores_list) else None
                    metric_consistency = compute_metric_consistency_global(
                        embedding_score, fuzz_avg, detection_avg, global_stats
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
                        scorer_consistency=scorer_consistency if scorer_consistency else None,
                        metric_consistency=metric_consistency,
                        explainer_consistency=None,  # Not applicable in single explainer mode
                        cross_explainer_metric_consistency=None  # Not applicable in single explainer mode
                    )

            if explainers_dict:
                features.append(FeatureTableRow(
                    feature_id=feature_id,
                    explainers=explainers_dict
                ))

        return FeatureTableDataResponse(
            features=features,
            total_features=len(features),
            explainer_ids=[MODEL_NAME_MAP.get(exp, exp) for exp in explainer_ids],
            scorer_ids=scorer_ids,
            is_averaged=is_averaged
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch table data: {str(e)}"
        )
