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

    Loads semantic alignment file at startup and caches highlights
    with similarity >= 0.7 for efficient access during table data generation.
    """

    def __init__(self, data_path: str = "/home/dohyun/interface/data"):
        """
        Initialize AlignmentService.

        Args:
            data_path: Base path to data directory
        """
        self.data_path = Path(data_path)
        self.alignment_semantic_file = self.data_path / "explanation_alignment" / "alignment_semantic.json"

        # Cache: { (feature_id, llm_explainer): List[HighlightSegment] }
        self._semantic_cache: Dict[Tuple[int, str], List[HighlightSegment]] = {}

        # Statistics
        self.semantic_stats: Dict = {}
        self.is_ready = False

    async def initialize(self) -> bool:
        """
        Load semantic alignment data from file.

        Returns:
            True if initialization successful, False otherwise
        """
        try:
            logger.info("Loading semantic alignment data...")

            # Load semantic alignment
            semantic_data = self._load_alignment_file(self.alignment_semantic_file, "semantic")

            # Process semantic highlights (filter to similarity >= 0.7)
            self._process_semantic_alignment(semantic_data)

            self.is_ready = True
            logger.info(
                f"Alignment service ready: {len(self._semantic_cache)} features cached, "
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
            mode: 'semantic' (only semantic supported)

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
            self.semantic_stats = data.get("statistics", {})

            logger.info(
                f"Loaded semantic alignment: "
                f"{data.get('statistics', {}).get('features_with_matches', 0)}/{data.get('statistics', {}).get('total_features', 0)} features, "
                f"{data.get('statistics', {}).get('total_matches', 0)} total matches"
            )

            return data

        except Exception as e:
            logger.error(f"Error loading alignment file {file_path}: {e}")
            return {"statistics": {}, "results": []}

    def _process_semantic_alignment(self, semantic_data: Dict):
        """
        Process semantic alignment data into cache.

        Strategy:
        - Build segment map from semantic data only
        - Filter segments with similarity >= 0.7
        - Apply bold styling to all highlighted segments

        Args:
            semantic_data: Semantic alignment data
        """
        # Build segment map from semantic data (filters to similarity >= 0.7)
        semantic_map = self._build_segment_map(semantic_data)

        # Store in cache
        for key, segments in semantic_map.items():
            self._semantic_cache[key] = segments

        logger.info(f"Processed {len(semantic_map)} feature-explainer combinations (similarity >= 0.7)")

    def _build_segment_map(self, data: Dict) -> Dict[Tuple[int, int], List[HighlightSegment]]:
        """
        Build segment map from semantic alignment data.

        Filters to only include segments with similarity >= 0.7.

        Args:
            data: Semantic alignment data

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
                        # Extract similarity value
                        similarity = seg.get("similarity", 0.0)

                        # Filter: only include segments with similarity >= 0.7
                        if similarity >= 0.7:
                            # Extract metadata
                            metadata = {
                                "match_type": "semantic",
                                "similarity": similarity,
                                "shared_with": seg.get("shared_with", [])
                            }

                            # All semantic matches get bold style
                            # Color will be calculated on frontend based on similarity
                            segment_list.append(HighlightSegment(
                                text=text,
                                highlight=True,
                                color=None,  # Frontend will calculate opacity-based color
                                style="bold",
                                metadata=metadata
                            ))
                        else:
                            # Similarity < 0.7: treat as plain text
                            segment_list.append(HighlightSegment(text=text, highlight=False))
                    else:
                        segment_list.append(HighlightSegment(text=text, highlight=False))

                # Only add to map if we have segments
                if segment_list:
                    segment_map[key] = segment_list

        return segment_map


    def get_highlighted_explanation(
        self,
        feature_id: int,
        llm_explainer: str,
        llm_explainers: List[str]
    ) -> Optional[List[Dict]]:
        """
        Get highlighted explanation segments for a specific feature and explainer.

        Only returns segments with semantic similarity >= 0.7.

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
            segments = self._semantic_cache.get(key)

            if not segments:
                return None

            # Convert to dicts for JSON serialization
            return [seg.to_dict() for seg in segments]

        except (ValueError, KeyError) as e:
            logger.debug(f"No alignment data for feature_id={feature_id}, llm_explainer={llm_explainer}: {e}")
            return None

    async def cleanup(self):
        """Clean up resources."""
        self._semantic_cache.clear()
        logger.info("Alignment service cleaned up")
