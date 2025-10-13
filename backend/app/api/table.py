"""
Table data endpoint for LLM scoring visualization.

Provides feature-level score data (824 rows, one per feature) for table visualization.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict
import polars as pl

from app.models.requests import TableDataRequest
from app.models.responses import FeatureTableDataResponse, FeatureTableRow, ExplainerScoreData, ScorerScoreSet
from app.services.visualization_service import DataService

router = APIRouter()

# Model name mapping for short display names
MODEL_NAME_MAP = {
    'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'llama',
    'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8': 'qwen',
    'openai/gpt-oss-20b': 'openai'
}


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

        # Build feature rows
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

                    explainers_dict[explainer_key] = ExplainerScoreData(
                        embedding=embedding_score,
                        fuzz=ScorerScoreSet(s1=fuzz_avg, s2=None, s3=None),
                        detection=ScorerScoreSet(s1=detection_avg, s2=None, s3=None)
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
                        )
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
