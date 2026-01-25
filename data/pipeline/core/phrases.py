"""Phrase extraction utilities for the SAE preprocessing pipeline."""

import re
from typing import List, Tuple


def chunk_text(text: str, method: str = "phrase") -> List[str]:
    """Split text into chunks for analysis.

    Args:
        text: Input text to split
        method: "phrase" (comma/and/or/but) or "sentence" (.!?;)

    Returns:
        List of non-empty text chunks
    """
    if not text or not text.strip():
        return []

    if method == "sentence":
        chunks = [s.strip() for s in re.split(r'[.!?;]', text) if s.strip()]
    else:  # "phrase" - default
        chunks = [c.strip() for c in re.split(r',|\band\b|\bor\b|\bbut\b', text) if c.strip()]

    return chunks


def extract_all_phrases(
    explanations: List[str],
    method: str = "phrase"
) -> List[Tuple[str, int, int]]:
    """Extract all phrases from multiple explanations with source tracking.

    Args:
        explanations: List of explanation texts
        method: "phrase" or "sentence" chunking method

    Returns:
        List of (phrase_text, explanation_index, phrase_index) tuples
    """
    result = []
    for exp_idx, text in enumerate(explanations):
        phrases = chunk_text(text, method)
        for phrase_idx, phrase in enumerate(phrases):
            result.append((phrase, exp_idx, phrase_idx))
    return result
