"""Phrase extraction utilities for the SAE preprocessing pipeline."""

import re
from typing import List, Tuple

# Lazy-loaded spaCy model
_nlp = None


def _get_nlp():
    """Lazy-load spaCy model for smart_coordination."""
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


def smart_coordination(text: str) -> List[str]:
    """Split text preserving coordinated noun phrases.

    Uses spaCy dependency parsing to identify when "and"/"or" connect
    nouns (keep together) vs clauses (split).

    - Splits on commas
    - Keeps "X and Y" together when both are nouns
    - Splits on clause-level conjunctions (but, however, although, though)
    - Splits on "and"/"or" when followed by a verb (clause coordination)

    Args:
        text: Input text to split

    Returns:
        List of non-empty phrase chunks
    """
    if not text or not text.strip():
        return []

    nlp = _get_nlp()
    doc = nlp(text)

    # Find coordination boundaries: (start_idx, end_idx) of delimiter to remove
    split_ranges = []

    for i, token in enumerate(doc):
        if token.text == ",":
            split_ranges.append((token.idx, token.idx + 1))
        elif token.text.lower() in ("but", "however", "although", "though"):
            # Always split on these clause-level conjunctions
            split_ranges.append((token.idx, token.idx + len(token.text)))
        elif token.text.lower() in ("and", "or"):
            # Check if this coordinates clauses (verb follows) or nouns
            head = token.head
            # If the conjunction connects verbs or clauses, split
            if token.dep_ == "cc":
                siblings = [child for child in head.children]
                has_verb_sibling = any(s.pos_ == "VERB" for s in siblings if s.i > token.i)
                if has_verb_sibling or head.pos_ == "VERB":
                    # Check if there's a conjoined verb after
                    for j in range(i + 1, min(i + 5, len(doc))):
                        if doc[j].pos_ == "VERB" and doc[j].dep_ == "conj":
                            split_ranges.append((token.idx, token.idx + len(token.text)))
                            break

    # If no split points found, try simple comma splitting
    if not split_ranges:
        phrases = text.split(",")
        return [p.strip() for p in phrases if p.strip()]

    # Sort by start index and deduplicate
    split_ranges = sorted(set(split_ranges), key=lambda x: x[0])

    # Split text at identified boundaries
    phrases = []
    prev_idx = 0
    for start_idx, end_idx in split_ranges:
        phrase = text[prev_idx:start_idx].strip()
        if phrase:
            # Remove leading conjunctions that might remain
            phrase = re.sub(r'^(and|or|but)\s+', '', phrase, flags=re.IGNORECASE)
            if phrase:
                phrases.append(phrase)
        prev_idx = end_idx

    # Add the last segment
    last_phrase = text[prev_idx:].strip()
    if last_phrase:
        last_phrase = re.sub(r'^(and|or|but)\s+', '', last_phrase, flags=re.IGNORECASE)
        if last_phrase:
            phrases.append(last_phrase)

    return phrases if phrases else [text.strip()]


def chunk_text(text: str, method: str = "smart") -> List[str]:
    """Split text into chunks for analysis.

    Args:
        text: Input text to split
        method: Chunking method:
            - "smart": Smart coordination (preserves "X and Y" noun phrases)
            - "phrase": Legacy regex split on comma/and/or/but
            - "sentence": Split on sentence boundaries (.!?;)

    Returns:
        List of non-empty text chunks
    """
    if not text or not text.strip():
        return []

    if method == "sentence":
        chunks = [s.strip() for s in re.split(r'[.!?;]', text) if s.strip()]
    elif method == "phrase":
        chunks = [c.strip() for c in re.split(r',|\band\b|\bor\b|\bbut\b', text) if c.strip()]
    else:  # "smart" - new default
        chunks = smart_coordination(text)

    return chunks


def extract_all_phrases(
    explanations: List[str],
    method: str = "smart"
) -> List[Tuple[str, int, int]]:
    """Extract all phrases from multiple explanations with source tracking.

    Args:
        explanations: List of explanation texts
        method: Chunking method ("smart", "phrase", or "sentence")

    Returns:
        List of (phrase_text, explanation_index, phrase_index) tuples
    """
    result = []
    for exp_idx, text in enumerate(explanations):
        phrases = chunk_text(text, method)
        for phrase_idx, phrase in enumerate(phrases):
            result.append((phrase, exp_idx, phrase_idx))
    return result
