#!/usr/bin/env python3
"""
Diagnostic Script: Identify Edge Cases in Token/Char Extraction

This script scans activation examples to find tokens that could cause
issues with n-gram extraction in the preprocessing pipeline.

Edge cases checked:
1. Standalone '▁' tokens (space markers only)
2. Multiple '▁' tokens ('▁▁', '▁▁▁', '▁▁▁▁' - indentation)
3. Tokens with '_' underscore characters (Python identifiers)
4. Tokens with whitespace ('\n', '\t', ' ')
5. Very short tokens (length 1 after normalization)
6. Tokens that become empty after normalization

Usage:
    python data/diagnostics/diagnose_token_extraction.py [--limit N]
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any
from collections import defaultdict
import polars as pl

# Add pipeline to path for core utilities
sys.path.insert(0, str(Path(__file__).parent.parent / "pipeline"))

from core.tokens import normalize_token, reconstruct_words_with_positions  # type: ignore
from core.paths import find_project_root  # type: ignore


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
    if '_' in token:
        issues.append("python_underscore")

    # Check for whitespace characters
    if '\n' in token:
        issues.append("newline")
    if '\t' in token:
        issues.append("tab")
    if ' ' in token:
        issues.append("space")

    # Check normalization
    norm = normalize_token(token)
    if not norm:
        issues.append("empty_after_norm")
    elif len(norm) == 1:
        issues.append("single_char_after_norm")

    return {
        "token": token,
        "normalized": norm,
        "issues": issues
    }


def main():
    parser = argparse.ArgumentParser(description='Diagnose token extraction edge cases')
    parser.add_argument('--limit', type=int, default=None, help='Limit number of examples to scan')
    args = parser.parse_args()

    project_root = find_project_root()

    # Try intermediate first, fall back to output
    activation_path = project_root / "data/intermediate/activation_examples.parquet"
    if not activation_path.exists():
        activation_path = project_root / "data/output/activation_examples.parquet"

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
            print(f"    Normalized: {repr(ex['analysis']['normalized'])}")

    # Test word reconstruction
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
        words = reconstruct_words_with_positions(tokens)
        print(f"  Reconstructed: {words}")


if __name__ == "__main__":
    main()
