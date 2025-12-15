"""Codebook Manager for adaptive code storage and retrieval."""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


@dataclass
class CodebookEntry:
    """An entry in the adaptive codebook."""

    code_id: int
    code_text: str
    embedding: np.ndarray
    frequency: int = 1
    variants: List[str] = field(default_factory=list)
    example_quotes: List[str] = field(default_factory=list)
    merged_from: List[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "code_id": self.code_id,
            "code_text": self.code_text,
            "frequency": self.frequency,
            "variants": self.variants,
            "example_quotes": self.example_quotes[:5],  # Limit quotes for storage
            "merged_from": self.merged_from
        }


class CodebookManager:
    """Manages the adaptive codebook with embedding-based similarity retrieval.

    The codebook stores codes generated during thematic analysis and supports:
    - Embedding-based similarity search for finding related codes
    - Automatic merging of highly similar codes
    - Tracking of code variants and usage frequency
    """

    def __init__(
        self,
        embedding_model: str = "google/embeddinggemma-300m",
        device: str = "cuda",
        similarity_threshold: float = 0.85,
        auto_merge_threshold: float = 0.90,
        max_example_quotes: int = 5
    ):
        """Initialize the CodebookManager.

        Args:
            embedding_model: Sentence transformer model for embeddings
            device: Device for embedding model ('cuda' or 'cpu')
            similarity_threshold: Minimum similarity to consider codes related
            auto_merge_threshold: Similarity threshold for automatic merging
            max_example_quotes: Maximum number of example quotes to store per code
        """
        self.similarity_threshold = similarity_threshold
        self.auto_merge_threshold = auto_merge_threshold
        self.max_example_quotes = max_example_quotes

        logger.info(f"Loading embedding model: {embedding_model}")
        self.model = SentenceTransformer(embedding_model, device=device)

        self.entries: Dict[int, CodebookEntry] = {}
        self._embeddings_matrix: Optional[np.ndarray] = None
        self._id_to_index: Dict[int, int] = {}
        self._next_id = 0
        self.version = 1

    def get_embedding(self, text: str) -> np.ndarray:
        """Generate embedding for a code text.

        Args:
            text: Code text to embed

        Returns:
            Embedding vector as numpy array
        """
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.astype(np.float32)

    def _update_embeddings_matrix(self):
        """Rebuild the embeddings matrix for efficient similarity search."""
        if len(self.entries) == 0:
            self._embeddings_matrix = None
            self._id_to_index = {}
        else:
            sorted_ids = sorted(self.entries.keys())
            self._id_to_index = {code_id: idx for idx, code_id in enumerate(sorted_ids)}
            self._embeddings_matrix = np.vstack(
                [self.entries[code_id].embedding for code_id in sorted_ids]
            )

    def find_similar(
        self,
        code_text: str,
        top_k: int = 5
    ) -> List[Tuple[CodebookEntry, float]]:
        """Find top-k most similar existing codes.

        Args:
            code_text: Code text to search for
            top_k: Number of similar codes to return

        Returns:
            List of (CodebookEntry, similarity_score) tuples, sorted by similarity
        """
        if len(self.entries) == 0 or self._embeddings_matrix is None:
            return []

        query_embedding = self.get_embedding(code_text)
        similarities = cosine_similarity(
            query_embedding.reshape(1, -1),
            self._embeddings_matrix
        )[0]

        # Get indices sorted by similarity (descending)
        top_indices = np.argsort(similarities)[::-1][:top_k]

        # Map indices back to code IDs
        index_to_id = {v: k for k, v in self._id_to_index.items()}

        results = []
        for idx in top_indices:
            code_id = index_to_id[idx]
            entry = self.entries[code_id]
            sim_score = float(similarities[idx])
            results.append((entry, sim_score))

        return results

    def add_code(self, code_text: str, quote: str) -> Tuple[int, bool]:
        """Add a new code to the codebook.

        Args:
            code_text: The code label
            quote: Supporting quote from the data

        Returns:
            Tuple of (code_id, is_new) indicating the code ID and whether it's new
        """
        embedding = self.get_embedding(code_text)

        new_entry = CodebookEntry(
            code_id=self._next_id,
            code_text=code_text,
            embedding=embedding,
            frequency=1,
            variants=[code_text],
            example_quotes=[quote] if quote else []
        )

        self.entries[self._next_id] = new_entry
        code_id = self._next_id
        self._next_id += 1
        self._update_embeddings_matrix()

        return code_id, True

    def merge_code(
        self,
        code_text: str,
        quote: str,
        existing_code_id: int
    ) -> int:
        """Merge a new code into an existing code entry.

        Args:
            code_text: The new code text (may become a variant)
            quote: Supporting quote
            existing_code_id: ID of existing code to merge into

        Returns:
            The existing code ID
        """
        entry = self.entries[existing_code_id]
        entry.frequency += 1

        # Add variant if different
        if code_text.lower() != entry.code_text.lower() and code_text not in entry.variants:
            entry.variants.append(code_text)

        # Add quote
        if quote and len(entry.example_quotes) < self.max_example_quotes:
            entry.example_quotes.append(quote)

        return existing_code_id

    def add_or_merge(self, code_text: str, quote: str) -> Tuple[int, bool, float]:
        """Add a new code or merge with existing similar code.

        Automatically merges if similarity >= auto_merge_threshold.
        Returns the code_id to use and whether it's a new code.

        Args:
            code_text: The code label
            quote: Supporting quote

        Returns:
            Tuple of (code_id, is_new, similarity_score)
            - code_id: The ID to use
            - is_new: True if a new code was created
            - similarity_score: Highest similarity to existing codes (0 if new)
        """
        similar = self.find_similar(code_text, top_k=1)

        if similar and similar[0][1] >= self.auto_merge_threshold:
            # Auto-merge with existing code
            existing_entry, sim_score = similar[0]
            code_id = self.merge_code(code_text, quote, existing_entry.code_id)
            return code_id, False, sim_score
        else:
            # Create new code
            code_id, is_new = self.add_code(code_text, quote)
            sim_score = similar[0][1] if similar else 0.0
            return code_id, is_new, sim_score

    def get_top_codes(self, k: int = 20) -> List[str]:
        """Get top-k most frequent codes for context.

        Args:
            k: Number of codes to return

        Returns:
            List of code texts sorted by frequency
        """
        sorted_entries = sorted(
            self.entries.values(),
            key=lambda e: e.frequency,
            reverse=True
        )
        return [e.code_text for e in sorted_entries[:k]]

    def save(self, output_path: Path):
        """Save codebook to JSON file.

        Args:
            output_path: Path to save the codebook
        """
        codebook_data = {
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "total_codes": len(self.entries),
                "version": self.version,
                "similarity_threshold": self.similarity_threshold,
                "auto_merge_threshold": self.auto_merge_threshold
            },
            "entries": [entry.to_dict() for entry in self.entries.values()]
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(codebook_data, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved codebook with {len(self.entries)} codes to {output_path}")

    def load(self, input_path: Path):
        """Load codebook from JSON file.

        Args:
            input_path: Path to load the codebook from
        """
        with open(input_path, 'r', encoding='utf-8') as f:
            codebook_data = json.load(f)

        self.version = codebook_data["metadata"].get("version", 1)

        # Reconstruct entries
        self.entries = {}
        for entry_data in codebook_data["entries"]:
            code_id = entry_data["code_id"]
            # Re-generate embedding for the code text
            embedding = self.get_embedding(entry_data["code_text"])

            self.entries[code_id] = CodebookEntry(
                code_id=code_id,
                code_text=entry_data["code_text"],
                embedding=embedding,
                frequency=entry_data["frequency"],
                variants=entry_data.get("variants", []),
                example_quotes=entry_data.get("example_quotes", []),
                merged_from=entry_data.get("merged_from", [])
            )

            if code_id >= self._next_id:
                self._next_id = code_id + 1

        self._update_embeddings_matrix()
        logger.info(f"Loaded codebook with {len(self.entries)} codes from {input_path}")

    def __len__(self) -> int:
        """Return number of codes in the codebook."""
        return len(self.entries)
