"""
Alignment service for managing explanation syntax highlighting.

Loads and caches alignment data (exact and semantic) at startup.
Merges highlights from both sources:
- Exact matches: green color styling
- Semantic matches: bold styling
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)


class HighlightSegment:
    """
    Represents a single text segment with optional highlighting.

    Attributes:
        text: The text content
        highlight: Whether this segment should be highlighted
        color: Color for exact matches (green gradient)
        style: 'bold' for semantic matches
        metadata: Additional information (similarity, match_type, shared_with, etc.)
    """
    def __init__(
        self,
        text: str,
        highlight: bool = False,
        color: Optional[str] = None,
        style: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        self.text = text
        self.highlight = highlight
        self.color = color
        self.style = style
        self.metadata = metadata or {}

    def to_dict(self) -> Dict:
        """Convert to dictionary for API response."""
        result = {
            "text": self.text,
            "highlight": self.highlight
        }
        if self.color:
            result["color"] = self.color
        if self.style:
            result["style"] = self.style
        if self.metadata:
            result["metadata"] = self.metadata
        return result


class AlignmentService:
    """
    Service for loading and managing explanation alignment data.

    Loads both exact and semantic alignment files at startup and caches
    the merged highlights for efficient access during table data generation.
    """

    def __init__(self, data_path: str = "/home/dohyun/interface/data"):
        """
        Initialize AlignmentService.

        Args:
            data_path: Base path to data directory
        """
        self.data_path = Path(data_path)
        self.alignment_exact_file = self.data_path / "explanation_alignment" / "alignment_exact.json"
        self.alignment_semantic_file = self.data_path / "explanation_alignment" / "alignment_semantic.json"

        # Cache: { (feature_id, llm_explainer): List[HighlightSegment] }
        self._merged_cache: Dict[Tuple[int, str], List[HighlightSegment]] = {}

        # Statistics
        self.exact_stats: Dict = {}
        self.semantic_stats: Dict = {}
        self.is_ready = False

    async def initialize(self) -> bool:
        """
        Load and merge alignment data from files.

        Returns:
            True if initialization successful, False otherwise
        """
        try:
            logger.info("Loading alignment data...")

            # Load exact alignment
            exact_data = self._load_alignment_file(self.alignment_exact_file, "exact")

            # Load semantic alignment
            semantic_data = self._load_alignment_file(self.alignment_semantic_file, "semantic")

            # Merge highlights
            self._merge_alignments(exact_data, semantic_data)

            self.is_ready = True
            logger.info(
                f"Alignment service ready: {len(self._merged_cache)} features cached, "
                f"Exact: {self.exact_stats.get('features_with_matches', 0)}/{self.exact_stats.get('total_features', 0)}, "
                f"Semantic: {self.semantic_stats.get('features_with_matches', 0)}/{self.semantic_stats.get('total_features', 0)}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to initialize alignment service: {e}")
            self.is_ready = False
            return False

    def _load_alignment_file(self, file_path: Path, mode: str) -> Dict:
        """
        Load alignment data from JSON file.

        Args:
            file_path: Path to alignment file
            mode: 'exact' or 'semantic'

        Returns:
            Loaded alignment data
        """
        if not file_path.exists():
            logger.warning(f"Alignment file not found: {file_path}")
            return {"statistics": {}, "results": []}

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Store statistics
            if mode == "exact":
                self.exact_stats = data.get("statistics", {})
            else:
                self.semantic_stats = data.get("statistics", {})

            logger.info(
                f"Loaded {mode} alignment: "
                f"{data.get('statistics', {}).get('features_with_matches', 0)}/{data.get('statistics', {}).get('total_features', 0)} features, "
                f"{data.get('statistics', {}).get('total_matches', 0)} total matches"
            )

            return data

        except Exception as e:
            logger.error(f"Error loading alignment file {file_path}: {e}")
            return {"statistics": {}, "results": []}

    def _merge_alignments(self, exact_data: Dict, semantic_data: Dict):
        """
        Merge exact and semantic alignment data into unified cache.

        Strategy:
        - Build segment map from both sources
        - Exact matches get green color
        - Semantic matches get bold style
        - Overlapping segments: prefer exact styling

        Args:
            exact_data: Exact alignment data
            semantic_data: Semantic alignment data
        """
        # Create mapping: (feature_id, explainer_idx) -> segments
        exact_map = self._build_segment_map(exact_data, "exact")
        semantic_map = self._build_segment_map(semantic_data, "semantic")

        # Get all unique (feature_id, explainer) combinations
        all_keys = set(exact_map.keys()) | set(semantic_map.keys())

        for key in all_keys:
            feature_id, explainer_idx = key

            # Get segments from both sources
            exact_segments = exact_map.get(key, [])
            semantic_segments = semantic_map.get(key, [])

            # Merge segments
            merged = self._merge_segment_lists(exact_segments, semantic_segments)

            # Get explainer ID from either source
            # We need to map explainer_idx to actual llm_explainer string
            # This will be populated when we have feature data
            # For now, just store by (feature_id, explainer_idx)
            self._merged_cache[key] = merged

        logger.info(f"Merged {len(all_keys)} feature-explainer combinations")

    def _build_segment_map(self, data: Dict, mode: str) -> Dict[Tuple[int, int], List[HighlightSegment]]:
        """
        Build segment map from alignment data.

        Args:
            data: Alignment data (exact or semantic)
            mode: 'exact' or 'semantic'

        Returns:
            Map of (feature_id, explainer_idx) -> List[HighlightSegment]
        """
        segment_map = {}

        for result in data.get("results", []):
            feature_id = result["feature_id"]
            highlighted_explanations = result.get("highlighted_explanations", [])

            for explainer_idx, segments in enumerate(highlighted_explanations):
                key = (feature_id, explainer_idx)
                segment_list = []

                for seg in segments:
                    text = seg["text"]
                    highlight = seg.get("highlight", False)

                    if highlight:
                        # Extract metadata
                        metadata = {
                            "match_type": mode,
                            "shared_with": seg.get("shared_with", [])
                        }

                        if mode == "exact":
                            metadata["ngram_length"] = seg.get("ngram_length")
                        else:
                            metadata["similarity"] = seg.get("similarity")

                        # Set color for exact (green), style for both (bold)
                        # Exact matches get green color AND bold
                        # Semantic matches get bold only
                        color = seg.get("color") if mode == "exact" else None
                        style = "bold"  # Both exact and semantic get bold

                        segment_list.append(HighlightSegment(
                            text=text,
                            highlight=True,
                            color=color,
                            style=style,
                            metadata=metadata
                        ))
                    else:
                        segment_list.append(HighlightSegment(text=text, highlight=False))

                segment_map[key] = segment_list

        return segment_map

    def _merge_segment_lists(
        self,
        exact_segments: List[HighlightSegment],
        semantic_segments: List[HighlightSegment]
    ) -> List[HighlightSegment]:
        """
        Merge two segment lists, combining highlights where text matches.

        Strategy:
        - Use semantic segments as base (they have more matches: 4610 vs 902)
        - Add exact green color where both highlight same text
        - This preserves all semantic highlights with bold styling
        - If only semantic exists, use semantic segments
        - If only exact exists, use exact segments

        Args:
            exact_segments: Segments from exact alignment
            semantic_segments: Segments from semantic alignment

        Returns:
            Merged segment list
        """
        if not exact_segments and not semantic_segments:
            return []

        if not exact_segments:
            return semantic_segments

        if not semantic_segments:
            return exact_segments

        # Build text index for exact segments for quick lookup
        exact_text_map = {}
        for seg in exact_segments:
            if seg.highlight:
                exact_text_map[seg.text.strip().lower()] = seg

        # Build a comprehensive merge that includes all highlights
        # Strategy: Use semantic as base structure, then add exact-only segments

        # Step 1: Iterate through semantic segments and enhance with exact color where overlap exists
        merged = []
        for sem_seg in semantic_segments:
            text_key = sem_seg.text.strip().lower()

            if sem_seg.highlight and text_key in exact_text_map:
                # Both semantic and exact highlight this text
                # Combine: semantic bold + exact green color
                merged_metadata = sem_seg.metadata.copy()
                merged_metadata["also_exact"] = True
                merged_metadata["exact_ngram_length"] = exact_text_map[text_key].metadata.get("ngram_length")

                merged.append(HighlightSegment(
                    text=sem_seg.text,
                    highlight=True,
                    color=exact_text_map[text_key].color,  # Add exact green color
                    style="bold",  # Keep bold
                    metadata=merged_metadata
                ))
            else:
                # Only semantic or no highlight - keep as is
                merged.append(sem_seg)

        # Step 2: DON'T add exact-only segments
        # Exact and semantic have different segmentations of the same text.
        # Adding exact segments that aren't in semantic would create duplication
        # because the text exists in semantic, just split differently.
        #
        # Solution: Only use semantic structure and enhance with exact colors where texts match.
        # This preserves text integrity while showing exact matches through green coloring.

        return merged

    def get_highlighted_explanation(
        self,
        feature_id: int,
        llm_explainer: str,
        llm_explainers: List[str]
    ) -> Optional[List[Dict]]:
        """
        Get highlighted explanation segments for a specific feature and explainer.

        Args:
            feature_id: Feature ID
            llm_explainer: LLM explainer ID
            llm_explainers: List of all LLM explainers (to map index)

        Returns:
            List of highlight segment dicts, or None if not available
        """
        if not self.is_ready:
            return None

        try:
            # Map llm_explainer to index
            explainer_idx = llm_explainers.index(llm_explainer)

            # Lookup in cache
            key = (feature_id, explainer_idx)
            segments = self._merged_cache.get(key)

            if not segments:
                return None

            # Convert to dicts for JSON serialization
            return [seg.to_dict() for seg in segments]

        except (ValueError, KeyError) as e:
            logger.debug(f"No alignment data for feature_id={feature_id}, llm_explainer={llm_explainer}: {e}")
            return None

    async def cleanup(self):
        """Clean up resources."""
        self._merged_cache.clear()
        logger.info("Alignment service cleaned up")
