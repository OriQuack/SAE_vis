"""
Structural parsing utilities for the SAE preprocessing pipeline.

Provides spaCy dependency parsing and tree-sitter AST parsing for
extracting structural relations around activated tokens.
"""

import logging
from collections import defaultdict
from typing import Dict, List, Set, Tuple

logger = logging.getLogger(__name__)


def build_char_to_token_map(tokens: List[str]) -> Tuple[str, List[int]]:
    """Detokenize tokens into text, building a character-to-token index map.

    Handles SentencePiece '▁' prefix → space conversion.

    Args:
        tokens: List of subword tokens (SentencePiece format)

    Returns:
        (text, char_to_token) where char_to_token[char_pos] = token_index
    """
    text_parts = []
    char_to_token = []

    for i, token in enumerate(tokens):
        if token.startswith('▁'):
            stripped = token.lstrip('▁')
            if stripped:
                if text_parts:
                    text_parts.append(' ')
                    char_to_token.append(i)
                text_parts.append(stripped)
                char_to_token.extend([i] * len(stripped))
            else:
                text_parts.append(' ')
                char_to_token.append(i)
        else:
            text_parts.append(token)
            char_to_token.extend([i] * len(token))

    return ''.join(text_parts), char_to_token


def get_activated_char_range(
    max_pos: int,
    char_to_token: List[int],
) -> Tuple[int, int]:
    """Find the character range for the activated token.

    Args:
        tokens: Token list
        max_pos: Activated token index
        char_to_token: Character-to-token mapping

    Returns:
        (char_start, char_end) for the activated token in the text
    """
    char_start = None
    char_end = None
    for ci, ti in enumerate(char_to_token):
        if ti == max_pos:
            if char_start is None:
                char_start = ci
            char_end = ci + 1

    if char_start is None or char_end is None:
        return 0, 0

    return char_start, char_end


def extract_dependency_relations(
    doc,
    activated_char_start: int,
    char_to_token: List[int],
    prompt_id: int,
) -> List[Dict]:
    """Extract dependency relations for the activated token from a spaCy Doc.

    Args:
        doc: spaCy Doc object (already parsed)
        activated_char_start: Start char position of activated token
        char_to_token: Character-to-token index mapping
        prompt_id: Prompt ID for position tracking

    Returns:
        List of relation dicts:
        {
            "relation": str (dep label),
            "direction": "head" | "dep",
            "partner_token_positions": List[int] (subword token indices)
        }
    """
    # Find the spaCy token overlapping the activated position
    activated_spacy_token = None
    for token in doc:
        if token.idx <= activated_char_start < token.idx + len(token.text):
            activated_spacy_token = token
            break

    if activated_spacy_token is None:
        return []

    relations = []

    def _map_spacy_token_to_positions(spacy_token) -> List[int]:
        """Map a spaCy token's character range to subword token positions."""
        positions = set()
        start = spacy_token.idx
        end = start + len(spacy_token.text)
        for ci in range(start, min(end, len(char_to_token))):
            positions.add(char_to_token[ci])
        return sorted(positions)

    # Relation 1: head of this token (this token depends on head)
    head = activated_spacy_token.head
    if head != activated_spacy_token:  # not root
        partner_positions = _map_spacy_token_to_positions(head)
        if partner_positions:
            relations.append({
                "relation": activated_spacy_token.dep_,
                "direction": "dep",  # activated is the dependent
                "partner_token_positions": partner_positions,
                "prompt_id": prompt_id,
            })

    # Relation 2: children of this token (depend on activated token)
    for child in activated_spacy_token.children:
        partner_positions = _map_spacy_token_to_positions(child)
        if partner_positions:
            relations.append({
                "relation": child.dep_,
                "direction": "head",  # activated is the head
                "partner_token_positions": partner_positions,
                "prompt_id": prompt_id,
            })

    return relations


def extract_ast_relations(
    text: str,
    activated_char_start: int,
    activated_char_end: int,
    char_to_token: List[int],
    parsers: List[Tuple],
    prompt_id: int,
) -> List[Dict]:
    """Extract AST relations using tree-sitter parsers.

    Tries each parser in order. On first parse with valid structure,
    finds the AST node containing the activated position and extracts
    parent/sibling relations.

    Args:
        text: Detokenized text
        activated_char_start: Start char of activated token
        activated_char_end: End char of activated token
        char_to_token: Char-to-token mapping
        parsers: List of (language_name, parser) tuples
        prompt_id: Prompt ID

    Returns:
        List of relation dicts, or [] if no parse succeeds
    """
    text_bytes = bytes(text, "utf8")

    for _lang_name, parser in parsers:
        tree = parser.parse(text_bytes)
        root = tree.root_node

        # Check if parse produced meaningful structure
        if root.child_count == 0:
            continue

        # Strict validation: reject parses that lack real code structure.
        # tree-sitter wraps ANY text as expression_statement, so we require
        # at least one structurally meaningful node type in the tree.
        all_children = list(root.children)
        error_children = [c for c in all_children if c.type == "ERROR"]
        named_non_error = [c for c in all_children if c.is_named and c.type != "ERROR"]
        if len(named_non_error) == 0:
            continue
        # Reject if >= 50% of top-level children are ERROR nodes
        if len(error_children) >= len(all_children) * 0.5:
            continue

        # Require structurally meaningful nodes (not just expression_statement wrappers).
        # Check top-level children AND their immediate children (depth 2).
        if not _has_meaningful_structure(root):
            continue

        # Convert char position to byte position
        activated_byte_start = len(text[:activated_char_start].encode("utf8"))
        activated_byte_end = len(text[:activated_char_end].encode("utf8"))

        # Reject if activated token falls inside an ERROR node
        activated_in_error = False
        for err_node in error_children:
            if err_node.start_byte <= activated_byte_start < err_node.end_byte:
                activated_in_error = True
                break
        if activated_in_error:
            continue

        # Find the deepest named node containing the activated byte position
        node = _find_deepest_named_node(root, activated_byte_start, activated_byte_end)
        if node is None or node == root:
            continue

        relations = []

        def _node_to_token_positions(n) -> List[int]:
            """Map tree-sitter node byte range to subword token positions."""
            # Convert byte offsets to char offsets
            try:
                node_char_start = len(text_bytes[:n.start_byte].decode("utf8"))
                node_char_end = len(text_bytes[:n.end_byte].decode("utf8"))
            except (UnicodeDecodeError, ValueError):
                return []
            positions = set()
            for ci in range(node_char_start, min(node_char_end, len(char_to_token))):
                positions.add(char_to_token[ci])
            return sorted(positions)

        # Parent relation
        parent = node.parent
        if parent and parent != root:
            partner_positions = _node_to_token_positions(parent)
            if partner_positions:
                relations.append({
                    "relation": "child_of",
                    "node_type": parent.type,
                    "partner_token_positions": partner_positions,
                    "prompt_id": prompt_id,
                })

        # Sibling relations
        if parent:
            for sibling in parent.named_children:
                if sibling.id == node.id:
                    continue
                partner_positions = _node_to_token_positions(sibling)
                if partner_positions:
                    relations.append({
                        "relation": "sibling_of",
                        "node_type": sibling.type,
                        "partner_token_positions": partner_positions,
                        "prompt_id": prompt_id,
                    })

        if relations:
            return relations

    return []


# Node types that indicate real code structure (not just expression_statement wrappers).
# tree-sitter parses natural language as flat expression_statements — these are spurious.
# Real code has control flow, definitions, declarations, etc.
_MEANINGFUL_NODE_TYPES = {
    # Python
    "function_definition", "class_definition", "if_statement", "for_statement",
    "while_statement", "return_statement", "import_statement", "import_from_statement",
    "assignment", "augmented_assignment", "with_statement", "try_statement",
    "raise_statement", "assert_statement", "decorator", "decorated_definition",
    "list_comprehension", "dictionary_comprehension", "set_comprehension",
    "lambda", "conditional_expression",
    # JavaScript / TypeScript
    "function_declaration", "class_declaration", "if_statement", "for_statement",
    "for_in_statement", "while_statement", "return_statement", "import_statement",
    "export_statement", "variable_declaration", "lexical_declaration",
    "arrow_function", "statement_block", "try_statement", "switch_statement",
    "throw_statement",
    # Shared
    "call_expression", "method_definition",
}

# Shallow node types that tree-sitter produces for any text — not evidence of code
_SHALLOW_NODE_TYPES = {
    "expression_statement", "comment", "string", "concatenated_string",
    "string_content", "template_string", "number", "true", "false", "null",
    "undefined", "identifier",
}


def _has_meaningful_structure(root_node) -> bool:
    """Check if the parse tree contains structurally meaningful code nodes.

    Scans top-level children and their immediate children (depth 2).
    Returns True if any node type is in _MEANINGFUL_NODE_TYPES.
    """
    for child in root_node.children:
        if not child.is_named or child.type == "ERROR":
            continue
        if child.type in _MEANINGFUL_NODE_TYPES:
            return True
        # Check one level deeper
        for grandchild in child.children:
            if grandchild.is_named and grandchild.type in _MEANINGFUL_NODE_TYPES:
                return True
    return False


def _find_deepest_named_node(node, byte_start: int, byte_end: int):
    """Find the deepest named AST node containing the byte range."""
    if byte_start < node.start_byte or byte_end > node.end_byte:
        return None

    for child in node.named_children:
        if child.start_byte <= byte_start and byte_end <= child.end_byte:
            deeper = _find_deepest_named_node(child, byte_start, byte_end)
            if deeper is not None:
                return deeper

    if node.is_named:
        return node
    return None


def compute_common_structural_relations(
    all_example_relations: List[List[Dict]],
    prompt_ids: List[int],
    min_rate: float = 0.5,
    min_success: int = 3,
) -> List[Dict]:
    """Count relation frequencies across examples, return common ones.

    A relation is identified by (relation_type, direction_or_node_type).
    Rate is computed over successfully parsed examples only.

    Args:
        all_example_relations: [example_idx] -> list of relation dicts
        prompt_ids: Prompt IDs for each example (parallel to all_example_relations)
        min_rate: Minimum rate among successful parses
        min_success: Minimum number of successful parses to report

    Returns:
        List of common relation dicts with per-example partner positions
    """
    # Count successful parses
    success_count = sum(1 for rels in all_example_relations if len(rels) > 0)
    if success_count < min_success:
        return []

    # Group relations by key
    # Key: (relation, direction_or_node_type)
    relation_examples: Dict[Tuple, Set[int]] = defaultdict(set)  # key -> set of example indices
    relation_positions: Dict[Tuple, Dict[int, List[int]]] = defaultdict(lambda: defaultdict(list))

    for ex_idx, rels in enumerate(all_example_relations):
        pid = prompt_ids[ex_idx]
        for rel in rels:
            direction = rel.get("direction", rel.get("node_type", ""))
            key = (rel["relation"], direction)
            relation_examples[key].add(ex_idx)
            relation_positions[key][pid].extend(rel["partner_token_positions"])

    # Filter to common relations
    result = []
    for key, example_set in relation_examples.items():
        rate = len(example_set) / success_count
        if rate >= min_rate:
            result.append({
                "relation": key[0],
                "direction": key[1],
                "rate": rate,
                "count": len(example_set),
                "partner_positions_by_prompt": dict(relation_positions[key]),
            })

    return result


def compute_structural_parse_scores(
    num_tokens: int,
    prompt_id: int,
    common_relations: List[Dict],
) -> List[float]:
    """Per-token score from common structural relations.

    For each token j that is a partner in a common relation:
      score[j] += rate

    Args:
        num_tokens: Number of tokens in the example
        prompt_id: Prompt ID to look up positions for
        common_relations: Common relations from compute_common_structural_relations

    Returns:
        List of floats, length = num_tokens
    """
    scores = [0.0] * num_tokens

    for rel in common_relations:
        positions = rel.get("partner_positions_by_prompt", {}).get(prompt_id, [])
        rate = rel["rate"]
        for pos in positions:
            if 0 <= pos < num_tokens:
                scores[pos] += rate

    return scores


def load_spacy_model(model_name: str = "en_core_web_sm"):
    """Load spaCy model with only the parser enabled.

    Args:
        model_name: spaCy model name

    Returns:
        spaCy Language model
    """
    import spacy
    logger.info(f"Loading spaCy model: {model_name}")
    nlp = spacy.load(model_name, disable=["ner", "lemmatizer"])
    logger.info(f"Loaded spaCy model (pipeline: {nlp.pipe_names})")
    return nlp


def load_tree_sitter_parsers() -> List[Tuple[str, object]]:
    """Load tree-sitter parsers for Python and JavaScript.

    Returns:
        List of (language_name, Parser) tuples
    """
    from tree_sitter import Parser

    parsers = []

    try:
        import tree_sitter_python as tspython
        from tree_sitter import Language
        py_parser = Parser(Language(tspython.language()))
        parsers.append(("python", py_parser))
        logger.info("Loaded tree-sitter Python parser")
    except ImportError:
        logger.warning("tree-sitter-python not available")

    try:
        import tree_sitter_javascript as tsjavascript
        from tree_sitter import Language
        js_parser = Parser(Language(tsjavascript.language()))
        parsers.append(("javascript", js_parser))
        logger.info("Loaded tree-sitter JavaScript parser")
    except ImportError:
        logger.warning("tree-sitter-javascript not available")

    return parsers
