"""Codebook Manager for adaptive code storage and retrieval.

Following Thematic-LM paper: Codebook stores codes with embeddings for
similarity-based retrieval. The reviewer agent makes all merge/new decisions -
no threshold-based auto-merging here.
"""

import json
import logging
import random
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
    """An entry in the adaptive codebook.

    Per paper (Section 3.1): "This codebook stores previous codes, their
    corresponding quotes, and quote IDs in JSON format. Each entry in the
    codebook is a code, and its associated quotes are nested below each
    code along with their quote IDs."
    """

    code_id: int
    code_text: str
    embedding: np.ndarray
    frequency: int = 1
    variants: List[str] = field(default_factory=list)
    # Per paper: quotes stored WITH quote_ids for traceability
    example_quotes: List[Dict[str, str]] = field(default_factory=list)  # [{"quote": "...", "quote_id": "..."}]
    merged_from: List[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "code_id": self.code_id,
            "code_text": self.code_text,
            "frequency": self.frequency,
            "variants": self.variants,
            "example_quotes": self.example_quotes[:20],  # Paper: max 20 quotes with quote_ids
            "merged_from": self.merged_from
        }


class CodebookManager:
    """Manages the adaptive codebook with embedding-based similarity retrieval.

    Following paper Section 3.1: The codebook stores codes and their embeddings.
    Similarity search (top-k) is used to find related codes for the reviewer.
    The reviewer agent makes ALL merge/new decisions - this class does not
    auto-merge based on thresholds.

    Key methods:
    - add_code(): Add a new code entry
    - merge_code(): Merge new code into existing entry
    - find_similar(): Find top-k similar codes for reviewer
    """

    def __init__(
        self,
        embedding_model: str = "all-MiniLM-L6-v2",
        device: str = "cuda",
        max_example_quotes: int = 20
    ):
        """Initialize the CodebookManager.

        Args:
            embedding_model: Sentence transformer model for embeddings
            device: Device for embedding model ('cuda' or 'cpu')
            max_example_quotes: Maximum number of example quotes per code (paper: 20)
        """
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
        embedding = self.model.encode(text, convert_to_numpy=True, show_progress_bar=False)
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
        top_k: int = 10,
        min_similarity: float = 0.0
    ) -> List[Tuple[CodebookEntry, float]]:
        """Find top-k most similar existing codes above threshold.

        Following paper Section 3.1: Retrieve top-k similar codes (default k=10)
        for the reviewer to compare against.

        Args:
            code_text: Code text to search for
            top_k: Maximum number of similar codes to return (paper: 10)
            min_similarity: Minimum similarity threshold (default: 0.0)

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
            sim_score = float(similarities[idx])
            if sim_score < min_similarity:
                break  # Sorted descending, no more above threshold
            code_id = index_to_id[idx]
            entry = self.entries[code_id]
            results.append((entry, sim_score))

        return results

    def add_code(self, code_text: str, quotes: List[Dict[str, str]]) -> Tuple[int, bool]:
        """Add a new code to the codebook.

        Called when reviewer decides to create a new code (merge_codes empty).

        Per paper Section 3.1: Store quotes WITH quote_ids for traceability.
        Per paper Section 4: Store up to 20 most relevant quotes per code.

        Args:
            code_text: The code label
            quotes: List of quote dicts with 'quote' and 'quote_id' keys

        Returns:
            Tuple of (code_id, is_new) - is_new is always True for add_code
        """
        embedding = self.get_embedding(code_text)

        # Store quotes WITH quote_ids per paper (respecting max limit)
        # Format: [{"quote": "...", "quote_id": "..."}]
        valid_quotes = [
            {"quote": q.get("quote", ""), "quote_id": q.get("quote_id", "")}
            for q in quotes
            if q.get("quote")
        ][:self.max_example_quotes]

        new_entry = CodebookEntry(
            code_id=self._next_id,
            code_text=code_text,
            embedding=embedding,
            frequency=1,
            variants=[code_text],
            example_quotes=valid_quotes
        )

        self.entries[self._next_id] = new_entry
        code_id = self._next_id
        self._next_id += 1
        self._update_embeddings_matrix()
        self.version += 1

        logger.debug(f"Added new code {code_id}: '{code_text}'")
        return code_id, True

    def merge_code(
        self,
        code_text: str,
        quotes: List[Dict[str, str]],
        existing_code_id: int,
        update_code_text: bool = False
    ) -> int:
        """Merge a new code into an existing code entry.

        Called when reviewer decides to merge (merge_codes non-empty).

        Per paper Section 4 and plan: When merging, add all new quotes (up to max 20)
        and optionally update the code_text to the refined name.

        Args:
            code_text: The new code text (may be a refined name)
            quotes: List of quote dicts with 'quote' and 'quote_id' keys
            existing_code_id: ID of existing code to merge into
            update_code_text: If True, update the entry's code_text to the new refined name

        Returns:
            The existing code ID
        """
        if existing_code_id not in self.entries:
            logger.warning(f"Cannot merge: code {existing_code_id} not found")
            # Fallback: add as new
            code_id, _ = self.add_code(code_text, quotes)
            return code_id

        entry = self.entries[existing_code_id]
        entry.frequency += 1

        # Per plan lines 729-732: Update code name to the (possibly refined) name
        if update_code_text and code_text.lower() != entry.code_text.lower():
            # Store old name as variant before updating
            if entry.code_text not in entry.variants:
                entry.variants.append(entry.code_text)
            # Update to refined name
            old_name = entry.code_text
            entry.code_text = code_text
            # Update embedding for new code text
            entry.embedding = self.get_embedding(code_text)
            logger.debug(f"Updated code name from '{old_name}' to '{code_text}'")
        elif code_text.lower() != entry.code_text.lower() and code_text not in entry.variants:
            # Add as variant if different (original behavior when not updating)
            entry.variants.append(code_text)

        # Add new quotes WITH quote_ids (avoiding duplicates)
        # Random replacement when at max capacity for representative sampling
        existing_quote_ids = {q.get("quote_id") for q in entry.example_quotes if q.get("quote_id")}
        for q in quotes:
            quote_text = q.get("quote", "")
            quote_id = q.get("quote_id", "")
            if quote_text and quote_id not in existing_quote_ids:
                new_quote = {"quote": quote_text, "quote_id": quote_id}
                if len(entry.example_quotes) < self.max_example_quotes:
                    entry.example_quotes.append(new_quote)
                else:
                    # Random replacement for representative sampling
                    idx = random.randint(0, self.max_example_quotes - 1)
                    entry.example_quotes[idx] = new_quote
                existing_quote_ids.add(quote_id)

        self._update_embeddings_matrix()
        self.version += 1
        logger.debug(f"Merged into code {existing_code_id}: '{entry.code_text}'")
        return existing_code_id

    def consolidate_codes(self, source_code_id: int, target_code_id: int) -> bool:
        """Consolidate one code entry into another.

        Used when reviewer suggests merging with multiple existing codes.
        The source code is merged into the target, and the source is removed.

        Args:
            source_code_id: ID of code to consolidate (will be removed)
            target_code_id: ID of code to consolidate into

        Returns:
            True if successful, False if either code not found
        """
        if source_code_id not in self.entries or target_code_id not in self.entries:
            logger.warning(f"Cannot consolidate: code {source_code_id} or {target_code_id} not found")
            return False

        if source_code_id == target_code_id:
            return True  # No-op

        source = self.entries[source_code_id]
        target = self.entries[target_code_id]

        # Transfer frequency
        target.frequency += source.frequency

        # Transfer variants
        if source.code_text not in target.variants:
            target.variants.append(source.code_text)
        for variant in source.variants:
            if variant not in target.variants:
                target.variants.append(variant)

        # Transfer quotes WITH quote_ids (random replacement when at max)
        existing_quote_ids = {q.get("quote_id") for q in target.example_quotes if isinstance(q, dict) and q.get("quote_id")}
        for quote in source.example_quotes:
            quote_id = quote.get("quote_id") if isinstance(quote, dict) else None
            if quote_id and quote_id not in existing_quote_ids:
                if len(target.example_quotes) < self.max_example_quotes:
                    target.example_quotes.append(quote)
                else:
                    idx = random.randint(0, self.max_example_quotes - 1)
                    target.example_quotes[idx] = quote
                existing_quote_ids.add(quote_id)
            elif not quote_id and quote not in target.example_quotes:
                # Fallback for old format without quote_id
                if len(target.example_quotes) < self.max_example_quotes:
                    target.example_quotes.append(quote)
                else:
                    idx = random.randint(0, self.max_example_quotes - 1)
                    target.example_quotes[idx] = quote

        # Track merge
        target.merged_from.append(source_code_id)

        # Remove source entry
        del self.entries[source_code_id]
        self._update_embeddings_matrix()
        self.version += 1

        logger.debug(f"Consolidated code {source_code_id} into {target_code_id}")
        return True

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
                "paper": "Qiao et al. Thematic-LM (WWW '25)"
            },
            "entries": [entry.to_dict() for entry in self.entries.values()]
        }

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

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
