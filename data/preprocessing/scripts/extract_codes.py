#!/usr/bin/env python3
"""
Extract Normalized Codes from SAE Feature Explanations

Combined pipeline:
1. Load explanations from parquet
2. Extract keywords using YAKE
3. Normalize keywords: lowercase + lemmatize + filter stopwords
4. Build vocabulary with frequencies
5. Output codes JSON

Usage:
    python extract_codes.py                    # All features
    python extract_codes.py --num-features 100 # First 100 features
"""

import json
import re
import argparse
from pathlib import Path
from datetime import datetime
from collections import defaultdict

import polars as pl
import yake
import spacy
from tqdm import tqdm


# Generic stopwords to filter (LEMMATIZED forms - too vague to be useful codes)
STOPWORDS = {
    # Meta-words about the explanation itself
    "relate", "reference", "context", "term",
    "thing", "something", "anything",
    "indicate", "often", "typically", "usually", "commonly", "frequently",
    "use", "involve", "associate",
    "specific", "particular", "certain", "various",
    "type", "kind", "form",
    "way", "manner",
    "example", "instance",
    "part", "portion",
    "include",
    # Too generic
    "text", "word", "phrase",
    "token", "character",
    "element", "item",
    "concept", "idea",
    "meaning", "sense",
    # Compound stopwords
    "term relate",
}


def find_project_root() -> Path:
    """Find the project root directory (interface)."""
    current = Path.cwd()
    while current.name != "interface" and current.parent != current:
        current = current.parent
    return current if current.name == "interface" else Path.cwd()


def lemmatize_keyword(keyword: str, nlp) -> str:
    """Lemmatize a keyword phrase.

    Lemmatizes each word independently to avoid spaCy context-dependent
    POS tagging issues (e.g., 'contexts' tagged as Foreign Word in phrases).
    """
    words = keyword.lower().split()
    lemmas = []
    for word in words:
        doc = nlp(word)
        # Get lemma for single word (more reliable than phrase-level)
        for token in doc:
            if not token.is_punct and not token.is_space:
                lemmas.append(token.lemma_)
    return " ".join(lemmas)


# Conjunctions to handle
CONJUNCTIONS = {"and", "or", "&"}  # For fallback split
CONJUNCTION_PATTERN = re.compile(r'\s+(and|or|&)\s+', re.IGNORECASE)  # For preprocessing

# Idioms/collocations to preserve (not split by conjunction)
# These are common phrases where "and/or" is integral to meaning
PRESERVED_PHRASES = {
    "trial and error",
    "pros and cons",
    "black and white",
    "up and down",
    "back and forth",
    "more or less",
    "either or",
    "and/or",
}

# Meta-linguistic patterns to filter (relative clauses, fragments)
# These describe explanation structure, not concepts
META_PATTERNS = [
    "that be", "that is", "that are", "that have", "that has",
    "which be", "which is", "which are", "which have",
    "who be", "who is", "who are",
    "token that", "tokens that", "word that", "words that",
    "phrase that", "phrases that", "term that", "terms that",
]


def preprocess_text_for_yake(text: str) -> str:
    """Preprocess text before YAKE extraction.

    Replaces conjunctions (and, or, &) with commas so YAKE treats
    connected phrases as separate units. This maximizes keyword slot
    efficiency (YAKE's top-N won't be wasted on conjunction phrases).

    Preserves idiomatic expressions where conjunction is integral.

    Args:
        text: Original explanation text

    Returns:
        Preprocessed text with conjunctions replaced by commas
    """
    text_lower = text.lower()

    # Check for preserved phrases and temporarily mask them
    masked_text = text
    placeholders = {}
    for i, phrase in enumerate(PRESERVED_PHRASES):
        if phrase in text_lower:
            placeholder = f"__PRESERVE_{i}__"
            # Case-insensitive replacement with placeholder
            pattern = re.compile(re.escape(phrase), re.IGNORECASE)
            masked_text = pattern.sub(placeholder, masked_text)
            placeholders[placeholder] = phrase

    # Replace conjunctions with commas
    processed = CONJUNCTION_PATTERN.sub(', ', masked_text)

    # Restore preserved phrases
    for placeholder, phrase in placeholders.items():
        processed = processed.replace(placeholder, phrase)

    return processed


def split_by_conjunction(keyword: str) -> list:
    """Split keyword by conjunctions (and, or, &) into separate parts.

    NOTE: This is now a fallback. Primary splitting happens in preprocess_text_for_yake().

    Args:
        keyword: Keyword string like "punctuation marks and special characters"

    Returns:
        List of parts: ["punctuation marks", "special characters"]
        Returns [keyword] if no conjunction found
    """
    keyword_lower = keyword.lower()

    # Check each conjunction
    for conj in CONJUNCTIONS:
        # Match " and ", " or ", " & " (with spaces)
        pattern = f" {conj} "
        if pattern in keyword_lower:
            # Find the split point in original string (preserve case)
            idx = keyword_lower.find(pattern)
            left = keyword[:idx].strip()
            right = keyword[idx + len(pattern):].strip()

            # Filter empty parts
            parts = [p for p in [left, right] if p]
            return parts if parts else [keyword]

    return [keyword]


def contains_meta_pattern(text: str) -> bool:
    """Check if text contains meta-linguistic patterns.

    These are relative clause fragments that describe explanation structure,
    not actual concepts (e.g., "tokens that are part", "word that is").
    """
    text_lower = text.lower()
    return any(pattern in text_lower for pattern in META_PATTERNS)


def is_valid_code(lemma: str) -> bool:
    """Check if a lemmatized keyword is a valid code."""
    # Filter stopwords (all words are stopwords)
    words = lemma.split()
    if all(w in STOPWORDS for w in words):
        return False

    # Filter meta-linguistic patterns
    if contains_meta_pattern(lemma):
        return False

    # Filter very short or very long
    if len(lemma) < 2 or len(lemma) > 50:
        return False

    # Filter if mostly numbers
    alpha_chars = sum(1 for c in lemma if c.isalpha())
    if alpha_chars < len(lemma) * 0.5:
        return False

    return True


def dedupe_overlapping_keywords(keywords: list) -> list:
    """Keep only longest n-grams, remove substrings.

    Args:
        keywords: List of (keyword, score) tuples from YAKE

    Returns:
        Filtered list with overlapping shorter n-grams removed
    """
    if not keywords:
        return keywords

    # Sort by length (longest first), then by score (lower is better)
    sorted_kw = sorted(keywords, key=lambda x: (-len(x[0]), x[1]))

    kept = []
    kept_texts = []

    for kw, score in sorted_kw:
        kw_lower = kw.lower()
        # Check if this keyword is a substring of any already kept keyword
        is_substring = any(kw_lower in kept_text for kept_text in kept_texts)
        if not is_substring:
            kept.append((kw, score))
            kept_texts.append(kw_lower)

    return kept


def main():
    parser = argparse.ArgumentParser(description="Extract normalized codes from SAE feature explanations")
    parser.add_argument(
        "--num-features",
        type=int,
        default=None,
        help="Number of features to process (default: all)"
    )
    parser.add_argument(
        "--num-keywords",
        type=int,
        default=10,
        help="Number of keywords to extract per explanation (default: 10)"
    )
    parser.add_argument(
        "--max-ngram",
        type=int,
        default=4,
        help="Maximum n-gram size for keywords (default: 4)"
    )
    args = parser.parse_args()

    # Setup paths
    project_root = find_project_root()
    input_path = project_root / "data" / "master" / "explanation_embeddings.parquet"
    output_dir = project_root / "data" / "yake_keywords"
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.num_features:
        output_codes_path = output_dir / f"codes_{args.num_features}_features.json"
        output_keywords_path = output_dir / f"keywords_{args.num_features}_features.json"
    else:
        output_codes_path = output_dir / "codes_all_features.json"
        output_keywords_path = output_dir / "keywords_all_features.json"

    print(f"Project root: {project_root}")
    print(f"Input: {input_path}")
    print(f"Output (codes): {output_codes_path}")
    print(f"Output (keywords): {output_keywords_path}")

    # Load models
    print("\nLoading spaCy model...")
    nlp = spacy.load("en_core_web_sm")

    # Initialize YAKE
    yake_params = {
        "lan": "en",
        "n": args.max_ngram,
        "dedupLim": 0.9,
        "dedupFunc": "seqm",
        "windowsSize": 1,
        "top": args.num_keywords
    }
    extractor = yake.KeywordExtractor(**yake_params)
    print(f"YAKE parameters: {yake_params}")

    # Load explanation embeddings
    print("\nLoading explanation embeddings...")
    df = pl.read_parquet(input_path)
    print(f"Loaded {len(df)} rows")

    # Filter to N features if specified
    if args.num_features:
        unique_features = sorted(df["feature_id"].unique().to_list())[:args.num_features]
        df = df.filter(pl.col("feature_id").is_in(unique_features))
        print(f"Filtered to {len(df)} rows ({args.num_features} features)")

    total_rows = len(df)

    # Track vocabulary and features
    vocabulary = defaultdict(lambda: {"count": 0, "variants": set(), "features": set()})
    features_data = defaultdict(lambda: {"codes": set(), "explanations": []})

    # Track raw keywords for second output file
    keywords_data = defaultdict(list)

    # Process each explanation
    print("\nProcessing explanations...")
    for row in tqdm(df.iter_rows(named=True), total=total_rows, desc="Extracting codes"):
        feature_id = row["feature_id"]
        llm_explainer = row["llm_explainer"]
        explanation_text = row["explanation_text"]

        # Step 1: Preprocess text - replace conjunctions with commas BEFORE YAKE
        # "X and Y" → "X, Y" so YAKE treats them as separate phrases
        preprocessed_text = preprocess_text_for_yake(explanation_text)

        # Step 2: Extract YAKE keywords from preprocessed text
        raw_keywords = extractor.extract_keywords(preprocessed_text)

        # Build raw keywords list (for debugging/output)
        raw_kw_list = [{"keyword": kw, "score": round(score, 6)} for kw, score in raw_keywords]

        # Step 3: Fallback split (in case any conjunctions slipped through)
        split_keywords = []
        for kw, score in raw_keywords:
            parts = split_by_conjunction(kw)
            for part in parts:
                split_keywords.append((part, score))

        # Step 4: Deduplicate - keep longest, remove substrings
        deduped_keywords = dedupe_overlapping_keywords(split_keywords)

        # Step 5: Normalize to codes (lemmatize + filter)
        codes = []
        normalized_kw_list = []
        for kw, score in deduped_keywords:
            lemma = lemmatize_keyword(kw, nlp)
            normalized_kw_list.append({
                "original": kw,
                "normalized": lemma,
                "score": round(score, 6),
                "filtered": not is_valid_code(lemma)
            })

            if is_valid_code(lemma):
                codes.append({
                    "code": lemma,
                    "original": kw,
                    "score": round(score, 6)
                })
                features_data[feature_id]["codes"].add(lemma)

                # Update vocabulary
                vocabulary[lemma]["count"] += 1
                vocabulary[lemma]["variants"].add(kw.lower())
                vocabulary[lemma]["features"].add(feature_id)

        features_data[feature_id]["explanations"].append({
            "llm_explainer": llm_explainer,
            "explanation_text": explanation_text,
            "codes": codes
        })

        # Store keywords data
        keywords_data[feature_id].append({
            "llm_explainer": llm_explainer,
            "explanation_text": explanation_text,
            "raw_keywords": raw_kw_list,
            "normalized_keywords": normalized_kw_list
        })


    # Build output structure
    print("\nBuilding output...")

    # Sort vocabulary by count
    vocab_output = {}
    for lemma, info in sorted(vocabulary.items(), key=lambda x: -x[1]["count"]):
        vocab_output[lemma] = {
            "count": info["count"],
            "feature_count": len(info["features"]),
            "variants": sorted(info["variants"])
        }

    # Build features list
    features_output = []
    for fid in sorted(features_data.keys()):
        data = features_data[fid]
        features_output.append({
            "feature_id": fid,
            "codes": sorted(data["codes"]),
            "explanations": data["explanations"]
        })

    # Build keywords output (file 2)
    keywords_output = []
    for fid in sorted(keywords_data.keys()):
        keywords_output.append({
            "feature_id": fid,
            "explanations": keywords_data[fid]
        })

    # Output 1: Codes (vocabulary + features with codes)
    codes_output = {
        "metadata": {
            "created_at": datetime.now().isoformat(),
            "num_features": len(features_output),
            "num_explanations": total_rows,
            "num_unique_codes": len(vocab_output),
            "yake_params": yake_params,
            "stopwords_filtered": sorted(STOPWORDS)
        },
        "vocabulary": vocab_output,
        "features": features_output
    }

    # Output 2: Keywords (raw + normalized for each explanation)
    keywords_file_output = {
        "metadata": {
            "created_at": datetime.now().isoformat(),
            "num_features": len(keywords_output),
            "num_explanations": total_rows,
            "yake_params": yake_params
        },
        "features": keywords_output
    }

    # Save codes file
    print(f"\nSaving codes to {output_codes_path}...")
    with open(output_codes_path, "w", encoding="utf-8") as f:
        json.dump(codes_output, f, indent=2, ensure_ascii=False)

    # Save keywords file
    print(f"Saving keywords to {output_keywords_path}...")
    with open(output_keywords_path, "w", encoding="utf-8") as f:
        json.dump(keywords_file_output, f, indent=2, ensure_ascii=False)

    print(f"\nDone!")
    print(f"  Features: {codes_output['metadata']['num_features']:,}")
    print(f"  Explanations: {codes_output['metadata']['num_explanations']:,}")
    print(f"  Unique codes: {codes_output['metadata']['num_unique_codes']:,}")

    # Show top codes
    print("\nTop 20 codes by frequency:")
    for code, info in list(vocab_output.items())[:20]:
        print(f"  {info['count']:5d}x ({info['feature_count']:4d} features)  {code}")


if __name__ == "__main__":
    main()
