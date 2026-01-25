"""
Phrase extraction methods for comparison study.
"""

import re
from typing import List


def regex_baseline(text: str) -> List[str]:
    """
    Method 1: Current baseline - split on comma, and, or, but.
    """
    if not text or not text.strip():
        return []
    phrases = re.split(r',|\band\b|\bor\b|\bbut\b', text, flags=re.IGNORECASE)
    return [p.strip() for p in phrases if p.strip()]


def sentence_split(text: str) -> List[str]:
    """
    Method 2: Split on sentence boundaries (.!?;).
    """
    if not text or not text.strip():
        return []
    sentences = re.split(r'[.!?;]', text)
    return [s.strip() for s in sentences if s.strip()]


def spacy_noun_chunks(text: str, nlp) -> List[str]:
    """
    Method 3: Extract noun phrases using spaCy's noun_chunks.
    """
    if not text or not text.strip():
        return []
    doc = nlp(text)
    return [chunk.text for chunk in doc.noun_chunks]


def spacy_clauses(text: str, nlp) -> List[str]:
    """
    Method 4: Clause-based segmentation via dependency parsing.

    Extracts clauses by finding verb-centered units and standalone noun phrases.
    Each clause = verb + its subject/object/modifiers.
    """
    if not text or not text.strip():
        return []

    doc = nlp(text)
    clauses = []
    used_tokens = set()

    # Find clause roots (verbs that are ROOT or have clausal dependencies)
    for token in doc:
        if token.pos_ == "VERB":
            # Collect all tokens in this verb's subtree
            clause_tokens = list(token.subtree)
            if len(clause_tokens) >= 2:  # At least verb + something
                clause_text = " ".join([t.text for t in sorted(clause_tokens, key=lambda x: x.i)])
                clauses.append(clause_text.strip())
                used_tokens.update([t.i for t in clause_tokens])

    # Extract standalone noun phrases not covered by clauses
    for chunk in doc.noun_chunks:
        chunk_indices = set(range(chunk.start, chunk.end))
        if not chunk_indices & used_tokens:
            clauses.append(chunk.text)

    # If no clauses found, fall back to noun chunks
    if not clauses:
        clauses = [chunk.text for chunk in doc.noun_chunks]

    return clauses if clauses else [text.strip()]


def smart_coordination(text: str, nlp) -> List[str]:
    """
    Method 5: Improved regex that respects noun coordination.

    - Splits on commas (except when followed by coordinated noun phrases)
    - Keeps "X and Y" together when both are nouns
    - Splits on clause-level conjunctions (but, or when followed by verb)
    """
    if not text or not text.strip():
        return []

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


# Method registry for easy access
METHODS = {
    "regex_baseline": lambda text, _nlp: regex_baseline(text),
    "sentence_split": lambda text, _nlp: sentence_split(text),
    "spacy_noun_chunks": spacy_noun_chunks,
    "spacy_clauses": spacy_clauses,
    "smart_coordination": smart_coordination,
}
