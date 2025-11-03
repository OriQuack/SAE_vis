"""
Score extraction and builder utilities for table data service.

NOTE: This file previously contained ConsistencyService which has been removed in v2.0.
      ExplainerDataBuilder provides utility methods for building table responses.
      Consider renaming this file to table_utils.py or merging into table_data_service.py.
"""

import polars as pl
from typing import Optional, Dict, Tuple


class ExplainerDataBuilder:
    """
    Helper class for building explainer data responses.

    Provides utility methods for extracting scores from DataFrames and
    looking up related data (explanations, etc.).
    """

    @staticmethod
    def extract_scores_from_explainer_df(
        explainer_df: pl.DataFrame,
        scorer_map: Optional[Dict[str, str]] = None
    ) -> Tuple[Dict[str, Optional[float]], Dict[str, Optional[float]], Optional[float]]:
        """
        Extract score dictionaries and embedding score from explainer DataFrame.

        Args:
            explainer_df: DataFrame for one explainer
            scorer_map: Optional mapping from scorer ID to s1/s2/s3.
                        If None, creates automatic mapping (s1, s2, s3)

        Returns:
            Tuple of (fuzz_dict, detection_dict, embedding_score):
            - fuzz_dict: {'s1': val, 's2': val, 's3': val}
            - detection_dict: {'s1': val, 's2': val, 's3': val}
            - embedding_score: float or None
        """
        fuzz_dict = {'s1': None, 's2': None, 's3': None}
        detection_dict = {'s1': None, 's2': None, 's3': None}
        embedding_score = None

        if len(explainer_df) == 0:
            return fuzz_dict, detection_dict, embedding_score

        # Get embedding score (first non-null value)
        embedding_scores = explainer_df["score_embedding"].to_list()
        # Find first non-null embedding score
        embedding_score = None
        for score in embedding_scores:
            if score is not None:
                embedding_score = round(score, 3)
                break

        # Extract scores per scorer
        if scorer_map is None:
            # Auto-generate scorer mapping
            scorer_map = {}
            for i, row_dict in enumerate(explainer_df.iter_rows(named=True)):
                scorer = row_dict["llm_scorer"]
                scorer_key = f"s{i+1}"
                scorer_map[scorer] = scorer_key

                fuzz_val = row_dict.get("score_fuzz")
                detection_val = row_dict.get("score_detection")

                fuzz_dict[scorer_key] = round(fuzz_val, 3) if fuzz_val is not None else None
                detection_dict[scorer_key] = round(detection_val, 3) if detection_val is not None else None
        else:
            # Use provided scorer mapping
            for _, row in enumerate(explainer_df.iter_rows(named=True)):
                scorer = row["llm_scorer"]
                scorer_key = scorer_map.get(scorer)

                if scorer_key:
                    fuzz_val = row.get("score_fuzz")
                    detection_val = row.get("score_detection")

                    fuzz_dict[scorer_key] = round(fuzz_val, 3) if fuzz_val is not None else None
                    detection_dict[scorer_key] = round(detection_val, 3) if detection_val is not None else None

        return fuzz_dict, detection_dict, embedding_score

    @staticmethod
    def lookup_explanation_text(
        feature_id: int,
        explainer: str,
        explanations_df: Optional[pl.DataFrame]
    ) -> Optional[str]:
        """
        Look up explanation text for a feature-explainer pair.

        Args:
            feature_id: Feature ID
            explainer: Explainer ID (full name)
            explanations_df: DataFrame with explanations (or None if not available)

        Returns:
            Explanation text string, or None if not found
        """
        if explanations_df is None:
            return None

        try:
            explanation_rows = explanations_df.filter(
                (pl.col("feature_id") == feature_id) &
                (pl.col("llm_explainer") == explainer)
            )

            if len(explanation_rows) > 0:
                return explanation_rows["explanation_text"].to_list()[0]
        except Exception:
            # Silently fail if explanation lookup fails
            pass

        return None
