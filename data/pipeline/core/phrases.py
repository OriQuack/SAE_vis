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


_MAX_MODIFIER_SUBTREE = 10


def _extend_with_modifiers(root, indices: set) -> None:
    """Extend index set by absorbing prep/acl/relcl/appos subtrees off root.

    Skips subtrees larger than _MAX_MODIFIER_SUBTREE tokens — their noun
    chunks will still appear as separate phrases via doc.noun_chunks.
    Strips trailing PUNCT and cc tokens from absorbed subtrees to prevent
    dangling connectors and trailing commas.
    """
    STRIP_DEPS = {"cc", "punct"}
    for child in root.children:
        if child.dep_ in ("prep", "acl", "relcl", "appos", "agent"):
            subtree_indices = set()
            for tok in child.subtree:
                subtree_indices.add(tok.i)
            # Skip oversized subtrees — their noun chunks will be separate phrases
            if len(subtree_indices) > _MAX_MODIFIER_SUBTREE:
                continue
            # Strip trailing cc/punct tokens
            if subtree_indices:
                max_idx = max(subtree_indices)
                while max_idx in subtree_indices:
                    tok = root.doc[max_idx]
                    if tok.dep_ in STRIP_DEPS:
                        subtree_indices.discard(max_idx)
                        max_idx -= 1
                    else:
                        break
            indices.update(subtree_indices)


def _merge_overlapping_sets(spans: List[set]) -> List[set]:
    """Merge index sets that share any token index (union-find style)."""
    if not spans:
        return []
    parent = list(range(len(spans)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    # Build token->span index for overlap detection
    token_to_span = {}
    for i, s in enumerate(spans):
        for idx in s:
            if idx in token_to_span:
                union(i, token_to_span[idx])
            else:
                token_to_span[idx] = i

    # Group by root
    groups = {}
    for i in range(len(spans)):
        r = find(i)
        if r not in groups:
            groups[r] = set()
        groups[r].update(spans[i])
    return list(groups.values())


def _index_sets_to_phrases(index_sets: List[set], doc) -> List[str]:
    """Convert sets of token indices into contiguous text runs."""
    phrases = []
    for indices in index_sets:
        if not indices:
            continue
        sorted_idx = sorted(indices)
        # Split into contiguous runs
        runs = []
        run_start = sorted_idx[0]
        prev = sorted_idx[0]
        for idx in sorted_idx[1:]:
            if idx == prev + 1:
                prev = idx
            else:
                runs.append((run_start, prev))
                run_start = idx
                prev = idx
        runs.append((run_start, prev))

        # Extract text for each run using char offsets
        run_texts = []
        for start, end in runs:
            start_char = doc[start].idx
            end_char = doc[end].idx + len(doc[end].text)
            run_texts.append(doc.text[start_char:end_char])
        phrases.append(" ".join(run_texts))
    return phrases


def _merge_conj_chains(chunk_spans: List[set], chunk_simple: List[bool],
                       chunk_roots: list, doc) -> None:
    """Merge simple coordinated chunks connected by conj relations in-place.

    For each conj chain (chunks whose roots are linked by conj deps), if ALL
    chunks in the chain are simple (no modifier subtrees absorbed), merge them
    into the first chunk's span, filling gap tokens. Other chunks in the chain
    are emptied.

    A chunk is "simple" if its extended index set equals the original
    range(chunk.start, chunk.end) — no prep/acl/relcl/appos children absorbed.

    Safety: only merge if all gap tokens between chunks have POS in
    {PUNCT, CCONJ, SCONJ, SPACE}.
    """
    SAFE_GAP_POS = {"PUNCT", "CCONJ", "SCONJ", "SPACE"}

    # Map each chunk root token index to its chunk index
    root_to_chunk = {}
    for i, root in enumerate(chunk_roots):
        root_to_chunk[root.i] = i

    # Walk conj chains to find the ultimate head for each chunk root
    def ultimate_head(token):
        visited = {token.i}
        while token.dep_ == "conj" and token.head.i not in visited:
            visited.add(token.head.i)
            token = token.head
        return token.i

    # Group chunks by ultimate head
    groups = {}
    for i, root in enumerate(chunk_roots):
        head_idx = ultimate_head(root)
        groups.setdefault(head_idx, []).append(i)

    # Process each group with 2+ chunks
    for head_idx, chunk_indices in groups.items():
        if len(chunk_indices) < 2:
            continue

        # All chunks in chain must be simple
        if not all(chunk_simple[ci] for ci in chunk_indices):
            continue

        # Sort by minimum token index for gap checking
        chunk_indices.sort(key=lambda ci: min(chunk_spans[ci]))

        # Check gap safety: all tokens between chunks must be safe POS
        all_chunk_tokens = set()
        for ci in chunk_indices:
            all_chunk_tokens.update(chunk_spans[ci])

        min_idx = min(all_chunk_tokens)
        max_idx = max(all_chunk_tokens)
        gap_safe = True
        for idx in range(min_idx, max_idx + 1):
            if idx not in all_chunk_tokens:
                if doc[idx].pos_ not in SAFE_GAP_POS:
                    gap_safe = False
                    break

        if not gap_safe:
            continue

        # Merge: union all spans + fill gaps → assign to first chunk
        merged = set(range(min_idx, max_idx + 1))
        first = chunk_indices[0]
        chunk_spans[first] = merged
        for ci in chunk_indices[1:]:
            chunk_spans[ci] = set()


def _recover_gaps(covered: set, doc) -> List[str]:
    """Recover uncovered content tokens as additional phrases.

    Finds tokens not in any covered span, groups them into contiguous runs,
    and keeps runs that contain a NOUN/PROPN token or a token with dep=conj
    whose head is in a covered span. Strips leading/trailing PUNCT/CCONJ.

    Returns list of recovered phrase strings.
    """
    CONTENT_POS = {"NOUN", "PROPN"}
    STRIP_POS = {"PUNCT", "CCONJ", "SCONJ", "SPACE"}

    all_indices = set(range(len(doc)))
    uncovered = sorted(all_indices - covered)

    if not uncovered:
        return []

    # Group into contiguous runs
    runs = []
    run_start = uncovered[0]
    prev = uncovered[0]
    for idx in uncovered[1:]:
        if idx == prev + 1:
            prev = idx
        else:
            runs.append((run_start, prev))
            run_start = idx
            prev = idx
    runs.append((run_start, prev))

    # Filter: keep runs with NOUN/PROPN or conj-of-covered
    recovered = []
    for start, end in runs:
        has_content = False
        for idx in range(start, end + 1):
            tok = doc[idx]
            if tok.pos_ in CONTENT_POS:
                has_content = True
                break
            if tok.dep_ == "conj" and tok.head.i in covered:
                has_content = True
                break

        if not has_content:
            continue

        # Strip leading/trailing PUNCT/CCONJ/SCONJ/SPACE
        indices = list(range(start, end + 1))
        while indices and doc[indices[0]].pos_ in STRIP_POS:
            indices.pop(0)
        while indices and doc[indices[-1]].pos_ in STRIP_POS:
            indices.pop()

        if not indices:
            continue

        # Build text from char offsets
        start_char = doc[indices[0]].idx
        end_char = doc[indices[-1]].idx + len(doc[indices[-1]].text)
        phrase = doc.text[start_char:end_char].strip()
        if phrase:
            recovered.append(phrase)

    return recovered


def aspect_phrases(text: str) -> List[str]:
    """Extract aspect-oriented phrases from text using spaCy noun chunks.

    Extracts noun chunks and extends each by absorbing prep/acl/relcl/appos
    subtrees hanging off the chunk root. Short coordinated chains of simple
    chunks (no modifiers absorbed) are merged. Uncovered content tokens
    (NOUN/PROPN or conj-of-covered) are recovered as additional phrases.

    Args:
        text: Input text to extract phrases from

    Returns:
        List of non-empty aspect phrases, or [text.strip()] as fallback
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    nlp = _get_nlp()
    doc = nlp(text)

    # Collect index sets from noun chunks + their modifier subtrees
    # Track whether each chunk is "simple" (no modifiers absorbed)
    chunk_spans = []
    chunk_simple = []
    chunk_roots = []
    for chunk in doc.noun_chunks:
        original = set(range(chunk.start, chunk.end))
        indices = set(original)
        _extend_with_modifiers(chunk.root, indices)
        chunk_spans.append(indices)
        chunk_simple.append(indices == original)
        chunk_roots.append(chunk.root)

    if not chunk_spans:
        # No noun chunks found — return full text as fallback
        return [text.strip()]

    # Merge simple coordinated chunks (conj-chain merge)
    _merge_conj_chains(chunk_spans, chunk_simple, chunk_roots, doc)

    # Filter empty spans (emptied by conj-chain merge)
    chunk_spans = [s for s in chunk_spans if s]

    # Merge overlapping spans
    merged = _merge_overlapping_sets(chunk_spans)

    # Compute covered token set for gap recovery
    covered = set()
    for s in merged:
        covered.update(s)

    # Recover uncovered content tokens
    gap_phrases = _recover_gaps(covered, doc)

    # Convert merged spans to text phrases
    phrases = _index_sets_to_phrases(merged, doc)

    # Append gap-recovered phrases
    phrases.extend(gap_phrases)

    # Sort all phrases by their position in text (min token index)
    def phrase_sort_key(phrase_text):
        idx = text.find(phrase_text)
        return idx if idx >= 0 else len(text)
    phrases.sort(key=phrase_sort_key)

    # Deduplicate, strip, filter empties
    seen = set()
    result = []
    for p in phrases:
        p = p.strip()
        if p and p not in seen:
            seen.add(p)
            result.append(p)

    return result if result else [text.strip()]


def chunk_text(text: str, method: str = "smart") -> List[str]:
    """Split text into chunks for analysis.

    Args:
        text: Input text to split
        method: Chunking method:
            - "smart": Smart coordination (preserves "X and Y" noun phrases)
            - "aspect": Aspect-oriented noun chunk extraction with modifier absorption
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
    elif method == "aspect":
        chunks = aspect_phrases(text)
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
