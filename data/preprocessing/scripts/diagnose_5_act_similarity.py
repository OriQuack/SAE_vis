#!/usr/bin/env python3
"""
Diagnostic Script: Identify Edge Cases in Token/Char Extraction

This script scans activation examples to find tokens that could cause
issues with n-gram extraction in 5_act_similarity.py.

Edge cases checked:
1. Standalone '▁' tokens (space markers only)
2. Multiple '▁' tokens ('▁▁', '▁▁▁', '▁▁▁▁' - indentation)
3. Tokens with '_' underscore characters (Python identifiers)
4. Tokens with whitespace ('\n', '\t', ' ')
5. Very short tokens (length 1 after normalization)
6. Tokens that become empty after normalization

Usage:
    python diagnose_5_act_similarity.py [--limit N]
"""

import argparse
import re
from pathlib import Path
from typing import Dict, List, Tuple, Any
from collections import defaultdict
import polars as pl


def find_project_root() -> Path:
    """Find project root by looking for 'interface' directory."""
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent
    if project_root.name == "interface":
        return project_root
    raise RuntimeError("Could not find interface project root")


def normalize_token_current(token: str) -> str:
    """Current _normalize_token() implementation."""
    return token.lstrip('▁')


def normalize_token_word_reconstruction(token: str) -> str:
    """Current _reconstruct_words_with_positions() normalization (FIXED)."""
    # Handle standalone '▁' token
    if token == '▁':
        return ''
    # Strip only '▁' prefix, preserve '_' for Python identifiers
    return token.lstrip('▁').strip()


def analyze_token(token: str) -> Dict[str, Any]:
    """Analyze a token for potential edge cases."""
    issues = []

    # Check for standalone '▁'
    if token == '▁':
        issues.append("standalone_underscore")

    # Check for multiple '▁' (indentation)
    if re.match(r'^▁{2,}$', token):
        issues.append(f"multiple_underscore_{len(token)}")

    # Check for leading '▁' followed by more '▁'
    if token.startswith('▁') and len(token) > 1 and token[1] == '▁':
        issues.append("indentation_token")

    # Check for '_' underscore (Python identifiers)
    if '_' in token and '▁' != '_':
        issues.append("python_underscore")

    # Check for whitespace characters
    if '\n' in token:
        issues.append("newline")
    if '\t' in token:
        issues.append("tab")
    if ' ' in token:
        issues.append("space")

    # Check if normalization produces different results
    norm1 = normalize_token_current(token)
    norm2 = normalize_token_word_reconstruction(token)
    if norm1 != norm2:
        issues.append("inconsistent_normalization")

    # Check if token becomes empty after normalization
    if not norm1:
        issues.append("empty_after_norm")
    elif len(norm1) == 1:
        issues.append("single_char_after_norm")

    return {
        "token": token,
        "norm_current": norm1,
        "norm_word_recon": norm2,
        "issues": issues
    }


def test_word_reconstruction(tokens: List[str]) -> List[Tuple[str, int]]:
    """
    Replicate _reconstruct_words_with_positions() to test position tracking (FIXED VERSION).
    """
    if not tokens:
        return []

    words_with_positions = []
    current_word = ""
    word_start_pos = 0

    # NOTE: Do NOT include '_' here - it's part of Python identifiers
    punct_chars = '.,!?;:"\'\n\t()[]{}\u201c\u201d\u2018\u2019`'

    for i, token in enumerate(tokens):
        # Handle standalone '▁' token (space marker only) - skip without updating position
        if token == '▁':
            if current_word:
                words_with_positions.append((current_word, word_start_pos))
                current_word = ""
            continue

        # Strip only '▁' prefix, preserve '_' for Python identifiers like __init__
        token_clean = token.lstrip('▁').strip()

        if token.startswith('▁'):
            if current_word:
                words_with_positions.append((current_word, word_start_pos))
            current_word = token_clean.lower()
            word_start_pos = i
        elif not token_clean or token_clean in punct_chars:
            if current_word:
                words_with_positions.append((current_word, word_start_pos))
                current_word = ""
        elif not current_word:
            while token_clean and token_clean[0] in punct_chars:
                token_clean = token_clean[1:]
            if token_clean:
                current_word = token_clean.lower()
                word_start_pos = i
        else:
            current_word += token_clean.lower()

    if current_word:
        words_with_positions.append((current_word, word_start_pos))

    return words_with_positions


def test_char_ngram_extraction(tokens: List[str], ngram_size: int = 3) -> Dict[str, List[Tuple[int, str, int]]]:
    """
    Replicate _extract_token_char_ngrams() to test char offset tracking.
    """
    ngram_map = defaultdict(list)

    for token_idx, token in enumerate(tokens):
        token_normalized = normalize_token_current(token).lower()

        if len(token_normalized) < 2:
            continue

        if len(token_normalized) >= ngram_size:
            for i in range(len(token_normalized) - ngram_size + 1):
                ngram = token_normalized[i:i+ngram_size]
                ngram_map[ngram].append((token_idx, token, i))

    return dict(ngram_map)


def main():
    parser = argparse.ArgumentParser(description='Diagnose token extraction edge cases')
    parser.add_argument('--limit', type=int, default=None, help='Limit number of examples to scan')
    args = parser.parse_args()

    project_root = find_project_root()
    activation_path = project_root / "data/master/activation_examples.parquet"

    print(f"Loading activation examples from {activation_path}")
    df = pl.read_parquet(activation_path)
    print(f"Loaded {len(df):,} examples")

    if args.limit:
        df = df.head(args.limit)
        print(f"Limited to {len(df):,} examples")

    # Track edge cases
    edge_cases = defaultdict(list)
    issue_counts = defaultdict(int)
    examples_with_issues = set()

    print("\nScanning tokens for edge cases...")

    for row in df.iter_rows(named=True):
        feature_id = row["feature_id"]
        prompt_id = row["prompt_id"]
        tokens = row["prompt_tokens"]

        if not tokens:
            continue

        for token_idx, token in enumerate(tokens):
            analysis = analyze_token(token)

            if analysis["issues"]:
                key = (feature_id, prompt_id)
                examples_with_issues.add(key)

                for issue in analysis["issues"]:
                    issue_counts[issue] += 1
                    # Store first 5 examples of each issue type
                    if len(edge_cases[issue]) < 5:
                        edge_cases[issue].append({
                            "feature_id": feature_id,
                            "prompt_id": prompt_id,
                            "token_idx": token_idx,
                            "token": token,
                            "analysis": analysis
                        })

    # Print summary
    print("\n" + "="*80)
    print("EDGE CASE SUMMARY")
    print("="*80)

    print(f"\nTotal examples scanned: {len(df):,}")
    print(f"Examples with issues: {len(examples_with_issues):,}")

    print("\nIssue counts:")
    for issue, count in sorted(issue_counts.items(), key=lambda x: -x[1]):
        print(f"  {issue}: {count:,}")

    # Print detailed examples
    print("\n" + "="*80)
    print("DETAILED EXAMPLES")
    print("="*80)

    for issue, examples in sorted(edge_cases.items()):
        print(f"\n--- {issue} ({issue_counts[issue]:,} occurrences) ---")
        for ex in examples[:3]:
            print(f"  Feature {ex['feature_id']}, Prompt {ex['prompt_id']}, Token {ex['token_idx']}")
            print(f"    Token: {repr(ex['token'])}")
            print(f"    Norm (current): {repr(ex['analysis']['norm_current'])}")
            print(f"    Norm (word_recon): {repr(ex['analysis']['norm_word_recon'])}")

    # Test word reconstruction on problematic examples
    print("\n" + "="*80)
    print("WORD RECONSTRUCTION TESTS")
    print("="*80)

    test_cases = [
        ['▁', 'hello'],
        ['▁▁▁▁', 'def'],
        ['▁__init__', '(', 'self', ')'],
        ['▁_private', '▁variable'],
        ['▁hello', '\n', '▁world'],
    ]

    for tokens in test_cases:
        print(f"\nTokens: {tokens}")
        words = test_word_reconstruction(tokens)
        print(f"  Reconstructed: {words}")

    # Find actual examples with multiple issues
    print("\n" + "="*80)
    print("MULTI-ISSUE EXAMPLES (for testing)")
    print("="*80)

    # Pick specific examples for testing
    test_feature_ids = set()
    for issue, examples in edge_cases.items():
        for ex in examples[:2]:
            test_feature_ids.add(ex['feature_id'])

    print(f"\nFeature IDs with edge cases for testing: {sorted(list(test_feature_ids))[:10]}")

    if test_feature_ids:
        print("\nTo test on these features, run:")
        feature_list = ",".join(str(f) for f in sorted(list(test_feature_ids))[:5])
        print(f"  python 5_act_similarity.py --limit 5")


if __name__ == "__main__":
    main()
