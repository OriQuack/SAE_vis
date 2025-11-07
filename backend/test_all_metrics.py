"""
Comprehensive sanity check for ALL similarity sort metrics.
"""
import polars as pl

pl.enable_string_cache()

print("=" * 80)
print("ALL METRICS SANITY CHECK")
print("=" * 80)

# Test features
test_features = [0, 1, 2]

# ============================================================================
# 1. DECODER SIMILARITY COUNT
# ============================================================================
print("\n" + "=" * 80)
print("1. DECODER SIMILARITY COUNT (from decoder weights)")
print("=" * 80)

df = pl.read_parquet("../data/master/features.parquet")

# Show raw decoder_similarity structure
print("\nRaw decoder_similarity structure (Feature 0):")
sample = df.filter(pl.col("feature_id") == 0).select(["feature_id", "llm_explainer", "decoder_similarity"])
dec_sim = sample[0]["decoder_similarity"][0]
print(f"  Type: List(Struct)")
print(f"  Length: {len(dec_sim)}")
print(f"  First 3 items: {dec_sim[:3]}")

# Extract count
df_with_count = df.with_columns([
    pl.col("decoder_similarity").list.len().alias("decoder_similarity_count")
])

print("\nDecoder similarity count per row:")
check = df_with_count.filter(pl.col("feature_id").is_in(test_features)).select([
    "feature_id", "llm_explainer", "decoder_similarity_count"
])
print(check)

print("\n✅ EXPECTED: Same count for all explainers of a feature (decoder weights are feature-level)")

# ============================================================================
# 2. SEMANTIC SIMILARITY (between explainers)
# ============================================================================
print("\n" + "=" * 80)
print("2. SEMANTIC SIMILARITY (pairwise between explainers)")
print("=" * 80)

print("\nRaw semantic_similarity structure (Feature 0):")
sample = df.filter(pl.col("feature_id") == 0).select(["feature_id", "llm_explainer", "semantic_similarity"])
for i, row in enumerate(sample.iter_rows(named=True)):
    print(f"\n  Explainer: {row['llm_explainer'][:30]}...")
    sem_sim = row['semantic_similarity']
    print(f"  Pairwise similarities: {sem_sim}")

# Extract mean
df_with_sem = df.with_columns([
    pl.col("semantic_similarity")
      .list.eval(pl.element().struct.field("cosine_similarity"))
      .list.mean()
      .alias("semantic_sim_mean")
])

print("\nSemantic similarity mean per explainer:")
check = df_with_sem.filter(pl.col("feature_id").is_in(test_features)).select([
    "feature_id", "llm_explainer", "semantic_sim_mean"
])
print(check)

print("\n✅ EXPECTED: Different values per explainer (measuring similarity to OTHER explainers)")

# ============================================================================
# 3. FUZZ AND DETECTION SCORES
# ============================================================================
print("\n" + "=" * 80)
print("3. FUZZ AND DETECTION SCORES (from scorers)")
print("=" * 80)

# Explode scores
df_exploded = df.explode("scores")
df_exploded = df_exploded.with_columns([
    pl.col("scores").struct.field("scorer").alias("llm_scorer"),
    pl.col("scores").struct.field("fuzz").alias("score_fuzz"),
    pl.col("scores").struct.field("detection").alias("score_detection"),
    pl.col("scores").struct.field("embedding").alias("score_embedding"),
])

print("\nFuzz scores for Feature 0 (across scorers):")
check = df_exploded.filter(
    (pl.col("feature_id") == 0)
).select(["feature_id", "llm_explainer", "llm_scorer", "score_fuzz", "score_detection"])
print(check)

# Aggregate per explainer
agg1 = df_exploded.filter(pl.col("feature_id").is_in(test_features)).group_by(
    ["feature_id", "llm_explainer"]
).agg([
    pl.col("score_fuzz").mean().alias("fuzz_avg"),
    pl.col("score_detection").mean().alias("detection_avg"),
    pl.col("score_embedding").mean().alias("embed_avg"),
])

print("\nAveraged across scorers (per explainer):")
print(agg1.sort(["feature_id", "llm_explainer"]))

# Take max across explainers
agg2 = agg1.group_by("feature_id").agg([
    pl.col("fuzz_avg").max().alias("fuzz_max"),
    pl.col("detection_avg").max().alias("detection_max"),
    pl.col("embed_avg").max().alias("embed_max"),
])

print("\nMAX across explainers (best explainer):")
print(agg2.sort("feature_id"))

print("\n✅ EXPECTED: Fuzz/detection averaged across scorers, then MAX across explainers")

# ============================================================================
# 4. INTRA-FEATURE METRICS (activation patterns)
# ============================================================================
print("\n" + "=" * 80)
print("4. INTRA-FEATURE METRICS (from activation patterns)")
print("=" * 80)

act_df = pl.read_parquet("../data/master/activation_display.parquet")
act_df = act_df.filter(pl.col("feature_id").is_in(test_features))

print("\nRaw activation metrics:")
print(act_df.select([
    "feature_id", "pattern_type",
    "semantic_similarity", "char_ngram_max_jaccard", "word_ngram_max_jaccard"
]))

# Compute intra metrics
intra = act_df.select([
    "feature_id",
    pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
      .fill_null(0.0).alias("intra_ngram_jaccard"),
    pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim")
])

print("\nComputed intra metrics:")
print(intra)

print("\n✅ EXPECTED: One row per feature, max of char/word n-gram Jaccard")

# ============================================================================
# 5. INTER-FEATURE METRICS
# ============================================================================
print("\n" + "=" * 80)
print("5. INTER-FEATURE METRICS (comparing decoder-similar features)")
print("=" * 80)

inter_df = pl.read_parquet("../data/master/interfeature_activation_similarity.parquet")
inter_df = inter_df.filter(pl.col("feature_id").is_in(test_features))

print(f"\nFeatures with inter-feature data: {inter_df['feature_id'].to_list()}")

if len(inter_df) > 0:
    print("\nShowing structure for first feature:")
    feature_inter = inter_df[0]
    print(f"  Feature ID: {feature_inter['feature_id'][0]}")

    sem_pairs = feature_inter['semantic_pairs'][0]
    lex_pairs = feature_inter['lexical_pairs'][0]

    print(f"\n  Semantic pairs: {len(sem_pairs) if sem_pairs is not None else 0}")
    if sem_pairs is not None and len(sem_pairs) > 0:
        print(f"    First pair: {sem_pairs[0]}")

    print(f"\n  Lexical pairs: {len(lex_pairs) if lex_pairs is not None else 0}")
    if lex_pairs is not None and len(lex_pairs) > 0:
        print(f"    First pair: {lex_pairs[0]}")

    # Show how service extracts max values
    print("\n  Service extracts:")
    for row in inter_df.iter_rows(named=True):
        fid = row["feature_id"]
        max_char = 0.0
        max_word = 0.0
        max_sem = 0.0

        for pairs_field in ["semantic_pairs", "lexical_pairs"]:
            pairs = row.get(pairs_field)
            if pairs:
                for pair in pairs:
                    if pair.get("char_jaccard"):
                        max_char = max(max_char, pair["char_jaccard"])
                    if pair.get("word_jaccard"):
                        max_word = max(max_word, pair["word_jaccard"])
                    if pair.get("semantic_similarity"):
                        max_sem = max(max_sem, pair["semantic_similarity"])

        print(f"    Feature {fid}: max_char={max_char:.3f}, max_word={max_word:.3f}, max_sem={max_sem:.3f}")
        print(f"               inter_ngram = max(char, word) = {max(max_char, max_word):.3f}")

print("\n✅ EXPECTED: Max Jaccard/semantic across all similar feature pairs")

# ============================================================================
# 6. FINAL WEIGHTED CALCULATION
# ============================================================================
print("\n" + "=" * 80)
print("6. WEIGHTS CALCULATION")
print("=" * 80)

print("\nMetrics used (9 total):")
metrics = [
    "decoder_similarity_count",
    "intra_ngram_jaccard",
    "intra_semantic_sim",
    "inter_ngram_jaccard",
    "inter_semantic_sim",
    "embed_score",
    "fuzz_score",
    "detection_score",
    "llm_explainer_semantic_sim"
]

for i, metric in enumerate(metrics, 1):
    print(f"  {i}. {metric}")

print("\nWeight formula: w_i = 1 / (std_i * 2)")
print("Then normalized to sum = 1")

print("\n✅ Lower std = higher weight (more discriminative metric)")

print("\n" + "=" * 80)
print("SANITY CHECK COMPLETE")
print("=" * 80)
