"""
Sankey diagram builder utilities for data service.

This module handles the construction of Sankey diagram data structures
including nodes, links, and metadata for visualization.
"""

import polars as pl
from typing import Dict, List, Any
from ..models.common import Filters
from ..models.responses import SankeyResponse
from .data_constants import *


class SankeyBuilder:
    """Handles construction of Sankey diagram data structures."""

    def build_sankey_response(
        self,
        categorized_df: pl.DataFrame,
        filters: Filters,
        thresholds: Dict[str, float]
    ) -> SankeyResponse:
        """
        Build complete Sankey response from categorized data.

        Args:
            categorized_df: DataFrame with all classification columns
            filters: Applied filters
            thresholds: Applied thresholds

        Returns:
            Complete Sankey response with nodes, links, and metadata
        """
        total_features = len(categorized_df)

        # Build all stages
        nodes = []
        links = []

        # Stage 0: Root node
        nodes.extend(self.build_root_nodes(total_features))

        # Stage 1: Feature splitting
        splitting_nodes, splitting_links = self.build_splitting_stage(categorized_df)
        nodes.extend(splitting_nodes)
        links.extend(splitting_links)

        # Stage 2: Semantic distance
        semantic_nodes, semantic_links = self.build_semantic_stage(categorized_df)
        nodes.extend(semantic_nodes)
        links.extend(semantic_links)

        # Stage 3: Score agreement
        agreement_nodes, agreement_links = self.build_agreement_stage(categorized_df)
        nodes.extend(agreement_nodes)
        links.extend(agreement_links)

        # Build metadata
        metadata = self.build_metadata(total_features, filters, thresholds)

        return SankeyResponse(
            nodes=nodes,
            links=links,
            metadata=metadata
        )

    def build_root_nodes(self, total_features: int) -> List[Dict[str, Any]]:
        """Build root stage nodes."""
        return [{
            "id": NODE_ROOT,
            "name": STAGE_NAMES[STAGE_ROOT],
            "stage": STAGE_ROOT,
            "feature_count": total_features,
            "category": CATEGORY_ROOT
        }]

    def build_splitting_stage(
        self,
        categorized_df: pl.DataFrame
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Build feature splitting stage nodes and links."""
        nodes = []
        links = []

        # Group by splitting category
        splitting_counts = (
            categorized_df
            .group_by(COL_SPLITTING_CATEGORY)
            .count()
            .sort(COL_SPLITTING_CATEGORY)
        )

        for row in splitting_counts.iter_rows(named=True):
            category = row[COL_SPLITTING_CATEGORY]
            count = row["count"]

            node_id = f"{NODE_SPLIT_PREFIX}{category}"
            display_name = f"Feature Splitting: {category.title()}"

            # Add node
            nodes.append({
                "id": node_id,
                "name": display_name,
                "stage": STAGE_SPLITTING,
                "feature_count": count,
                "category": CATEGORY_FEATURE_SPLITTING
            })

            # Add link from root
            links.append({
                "source": NODE_ROOT,
                "target": node_id,
                "value": count
            })

        return nodes, links

    def build_semantic_stage(
        self,
        categorized_df: pl.DataFrame
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Build semantic distance stage nodes and links."""
        nodes = []
        links = []

        # Group by splitting and semantic categories
        semantic_counts = (
            categorized_df
            .group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY])
            .count()
            .sort([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY])
        )

        for row in semantic_counts.iter_rows(named=True):
            split_cat = row[COL_SPLITTING_CATEGORY]
            semdist_cat = row[COL_SEMDIST_CATEGORY]
            count = row["count"]

            source_id = f"{NODE_SPLIT_PREFIX}{split_cat}"
            target_id = f"{NODE_SPLIT_PREFIX}{split_cat}{NODE_SEMDIST_SUFFIX}{semdist_cat}"
            display_name = f"{semdist_cat.title()} Semantic Distance"

            # Add node
            nodes.append({
                "id": target_id,
                "name": display_name,
                "stage": STAGE_SEMANTIC,
                "feature_count": count,
                "category": CATEGORY_SEMANTIC_DISTANCE,
                "parent_path": [source_id]
            })

            # Add link
            links.append({
                "source": source_id,
                "target": target_id,
                "value": count
            })

        return nodes, links

    def build_agreement_stage(
        self,
        categorized_df: pl.DataFrame
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Build score agreement stage nodes and links."""
        nodes = []
        links = []

        # Group by all categories
        agreement_counts = (
            categorized_df
            .group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT])
            .count()
            .sort([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT])
        )

        for row in agreement_counts.iter_rows(named=True):
            split_cat = row[COL_SPLITTING_CATEGORY]
            semdist_cat = row[COL_SEMDIST_CATEGORY]
            agreement_cat = row[COL_SCORE_AGREEMENT]
            count = row["count"]

            source_id = f"{NODE_SPLIT_PREFIX}{split_cat}{NODE_SEMDIST_SUFFIX}{semdist_cat}"
            target_id = f"{source_id}_{agreement_cat}"
            display_name = AGREEMENT_NAMES[agreement_cat]

            # Add node
            nodes.append({
                "id": target_id,
                "name": display_name,
                "stage": STAGE_AGREEMENT,
                "feature_count": count,
                "category": CATEGORY_SCORE_AGREEMENT,
                "parent_path": [f"{NODE_SPLIT_PREFIX}{split_cat}", f"semdist_{semdist_cat}"]
            })

            # Add link
            links.append({
                "source": source_id,
                "target": target_id,
                "value": count
            })

        return nodes, links

    def build_metadata(
        self,
        total_features: int,
        filters: Filters,
        thresholds: Dict[str, float]
    ) -> Dict[str, Any]:
        """Build metadata for the Sankey response."""
        applied_filters = {}

        # Only include non-empty filters
        if filters.sae_id:
            applied_filters[COL_SAE_ID] = filters.sae_id
        if filters.explanation_method:
            applied_filters[COL_EXPLANATION_METHOD] = filters.explanation_method
        if filters.llm_explainer:
            applied_filters[COL_LLM_EXPLAINER] = filters.llm_explainer
        if filters.llm_scorer:
            applied_filters[COL_LLM_SCORER] = filters.llm_scorer

        return {
            "total_features": total_features,
            "applied_filters": applied_filters,
            "applied_thresholds": thresholds
        }

    def validate_categorized_data(self, df: pl.DataFrame) -> bool:
        """
        Validate that the DataFrame has required categorization columns.

        Args:
            df: DataFrame to validate

        Returns:
            True if all required columns are present
        """
        required_columns = [
            COL_SPLITTING_CATEGORY,
            COL_SEMDIST_CATEGORY,
            COL_SCORE_AGREEMENT
        ]

        return all(col in df.columns for col in required_columns)

    def get_stage_summary(self, df: pl.DataFrame) -> Dict[str, Any]:
        """
        Get summary statistics for each stage.

        Args:
            df: Categorized DataFrame

        Returns:
            Dictionary with stage summaries
        """
        if not self.validate_categorized_data(df):
            raise ValueError("DataFrame missing required categorization columns")

        total_features = len(df)

        # Splitting stage summary
        splitting_summary = (
            df.group_by(COL_SPLITTING_CATEGORY)
            .count()
            .to_dicts()
        )

        # Semantic stage summary
        semantic_summary = (
            df.group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY])
            .count()
            .to_dicts()
        )

        # Agreement stage summary
        agreement_summary = (
            df.group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT])
            .count()
            .to_dicts()
        )

        return {
            "total_features": total_features,
            "splitting_distribution": splitting_summary,
            "semantic_distribution": semantic_summary,
            "agreement_distribution": agreement_summary
        }