"""
Token processing utilities for the SAE preprocessing pipeline.

Provides functions for normalizing tokens, extracting windows, and reconstructing
words from subword tokens (SentencePiece format).
"""

from typing import List, Tuple


def normalize_token(token: str) -> str:
    """Strip SentencePiece '▁' prefix from token.

    Args:
        token: Token string (may have '▁' prefix)

    Returns:
        Token without '▁' prefix
    """
    return token.lstrip('▁')


def extract_token_window(tokens: List[str], center_pos: int, window_size: int) -> List[str]:
    """Extract symmetric window around center position.

    Args:
        tokens: List of token strings
        center_pos: Center token position
        window_size: Total window size

    Returns:
        List of tokens in window (may be shorter if near edges)
    """
    half_window = window_size // 2
    start = max(0, center_pos - half_window)
    # For odd window sizes, add 1 to include the center token
    # e.g., window_size=1: [center], window_size=3: [center-1, center, center+1]
    end = min(len(tokens), center_pos + half_window + (window_size % 2))
    return tokens[start:end]


def calculate_window_offset(center_pos: int, window_size: int) -> int:
    """Calculate the offset from absolute position to window-relative position.

    Args:
        center_pos: Center token position
        window_size: Total window size

    Returns:
        The starting position of the window in absolute coordinates
    """
    return max(0, center_pos - window_size // 2)


def reconstruct_words(tokens: List[str]) -> List[str]:
    """Reconstruct full words by joining subword tokens.

    Args:
        tokens: List of token strings with '▁' marking word boundaries

    Returns:
        List of reconstructed words (tokens with '▁' start new words)
    """
    if not tokens:
        return []

    words = []
    current_word = ""

    for token in tokens:
        if token.startswith('▁'):
            # New word boundary
            if current_word:
                words.append(current_word)
            current_word = normalize_token(token)
        else:
            # Continuation of previous word
            current_word += token

    # Add last word
    if current_word:
        words.append(current_word)

    return words


def reconstruct_words_with_positions(tokens: List[str]) -> List[Tuple[str, int]]:
    """Reconstruct full words from subword tokens with starting positions.

    Handles SentencePiece tokenization where '▁' marks word boundaries,
    preserves underscores in Python identifiers (like __init__), and
    properly handles punctuation.

    Args:
        tokens: List of token strings with '▁' marking word boundaries

    Returns:
        List of tuples (reconstructed_word, start_token_position)
    """
    if not tokens:
        return []

    words_with_positions = []
    current_word = ""
    word_start_pos = 0

    # Define punctuation including Unicode smart quotes
    # NOTE: Do NOT include '_' here - it's part of Python identifiers
    punct_chars = '.,!?;:"\'\n\t()[]{}\u201c\u201d\u2018\u2019`'

    for i, token in enumerate(tokens):
        # Handle standalone '▁' token (space marker only) - skip without updating position
        if token == '▁':
            # Save current word if exists, but don't start new empty word
            if current_word:
                words_with_positions.append((current_word, word_start_pos))
                current_word = ""
            continue

        # Strip only '▁' prefix, preserve '_' for Python identifiers like __init__
        token_clean = token.lstrip('▁').strip()

        if token.startswith('▁'):
            # New word boundary (space prefix)
            if current_word:
                words_with_positions.append((current_word, word_start_pos))
            current_word = token_clean.lower()
            word_start_pos = i
        elif not token_clean or token_clean in punct_chars:
            # Punctuation or whitespace - save current word and skip
            if current_word:
                words_with_positions.append((current_word, word_start_pos))
                current_word = ""
        elif not current_word:
            # Starting a new word (e.g., "How" after punctuation)
            # Strip any leading punctuation from the word itself
            while token_clean and token_clean[0] in punct_chars:
                token_clean = token_clean[1:]
            if token_clean:
                current_word = token_clean.lower()
                word_start_pos = i
        else:
            # Continuation of current word
            current_word += token_clean.lower()

    # Don't forget last word
    if current_word:
        words_with_positions.append((current_word, word_start_pos))

    return words_with_positions


def process_tokens_for_display(tokens: List[str]) -> List[str]:
    """Process token list, removing SentencePiece markers for display.

    Args:
        tokens: List of token strings (may have '▁' SentencePiece prefix)

    Returns:
        List of processed tokens suitable for display
    """
    if not tokens:
        return []
    return [t.lstrip('▁').strip() for t in tokens]


def join_tokens_to_text(tokens: List[str]) -> str:
    """Join subword tokens into natural text.

    Reconstructs natural text by:
    - Treating '▁' as a space before the token
    - Joining other tokens directly

    Args:
        tokens: List of subword token strings

    Returns:
        Reconstructed text string
    """
    if not tokens:
        return ""

    result = []
    for token in tokens:
        if token.startswith('▁'):
            # Add space before this token (word boundary)
            if result:
                result.append(' ')
            result.append(normalize_token(token))
        else:
            # Continuation token - no space
            result.append(token)

    return ''.join(result)
