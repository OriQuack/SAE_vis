"""
Sanity check for similarity sort metric calculations.
Shows the breakdown of how each metric is calculated.
"""
import polars as pl
import numpy as np

# Enable string cache for categorical operations
pl.enable_string_cache()

def check_metric_calculations():
    print("=" * 80)
    print("Similarity Sort Metric Calculation Sanity Check")
    print("=" * 80)

    # Load main dataframe
    lf = pl.scan_parquet("../data/master/features.parquet")

    # Check a few sample features
    sample_features = [0, 1, 2]

    # Extract and transform like the service does
    lf = lf.with_columns([
        pl.col("decoder_similarity").list.len().alias("decoder_similarity_count"),
        pl.col("semantic_similarity")
          .list.eval(pl.element().struct.field("cosine_similarity"))
          .list.mean()
          .alias("llm_explainer_semantic_sim_raw")
    ])

    # Filter to sample features
    df = lf.filter(pl.col("feature_id").is_in(sample_features)).collect()

    print(f"\n1. RAW DATA (before aggregation)")
    print(f"   Total rows: {len(df)}")
    print(f"   Features: {df['feature_id'].unique().to_list()}")
    print(f"   Explainers: {df['llm_explainer'].unique().to_list()}")
    print(f"   Scorers per row: {df['llm_scorer'].unique().to_list()}")

    # Show raw data for first feature
    feature_0 = df.filter(pl.col("feature_id") == 0)
    print(f"\n2. FEATURE 0 RAW DATA ({len(feature_0)} rows)")
    print(feature_0.select([
        "feature_id", "llm_explainer", "llm_scorer",
        "score_embedding", "score_fuzz", "score_detection",
        "decoder_similarity_count", "llm_explainer_semantic_sim_raw"
    ]))

    # First aggregation: group by feature_id and llm_explainer
    print(f"\n3. FIRST AGGREGATION: feature_id + llm_explainer")
    agg1 = df.group_by(["feature_id", "llm_explainer"]).agg([
        pl.col("decoder_similarity_count").first(),
        pl.col("llm_explainer_semantic_sim_raw").first().alias("sem_sim"),
        pl.col("score_embedding").mean().alias("embed_avg"),
        pl.col("score_fuzz").mean().alias("fuzz_avg"),
        pl.col("score_detection").mean().alias("detection_avg")
    ])
    print(agg1.sort(["feature_id", "llm_explainer"]))

    # Check if embedding is same across scorers
    print(f"\n4. EMBEDDING SCORE CHECK (same across scorers?)")
    for fid in sample_features:
        for explainer in df.filter(pl.col("feature_id") == fid)["llm_explainer"].unique().to_list():
            embed_vals = df.filter(
                (pl.col("feature_id") == fid) &
                (pl.col("llm_explainer") == explainer)
            )["score_embedding"].to_list()
            unique_vals = list(set(embed_vals))
            print(f"   Feature {fid}, {explainer[:20]}...: {embed_vals} → unique: {unique_vals}")

    # Compute quality score per explainer
    agg1 = agg1.with_columns([
        ((pl.col("embed_avg") + pl.col("fuzz_avg") + pl.col("detection_avg")) / 3.0)
        .alias("quality_score")
    ])
    print(f"\n5. QUALITY SCORE PER EXPLAINER (avg of 3 scores)")
    print(agg1.select([
        "feature_id", "llm_explainer",
        "embed_avg", "fuzz_avg", "detection_avg", "quality_score"
    ]).sort(["feature_id", "llm_explainer"]))

    # Second aggregation: take max across explainers
    print(f"\n6. SECOND AGGREGATION: MAX across explainers")
    agg2 = agg1.group_by("feature_id").agg([
        pl.col("decoder_similarity_count").first(),
        pl.col("quality_score").max(),
        pl.col("embed_avg").max().alias("embed_score"),
        pl.col("fuzz_avg").max().alias("fuzz_score"),
        pl.col("detection_avg").max().alias("detection_score"),
        pl.col("sem_sim").mean().alias("llm_explainer_semantic_sim")
    ])
    print(agg2.sort("feature_id"))

    # Load activation metrics
    print(f"\n7. ACTIVATION METRICS")
    act_df = pl.read_parquet("../data/master/activation_display.parquet")
    act_df = act_df.filter(pl.col("feature_id").is_in(sample_features))
    print(act_df.select([
        "feature_id", "pattern_type",
        "semantic_similarity", "char_ngram_max_jaccard", "word_ngram_max_jaccard"
    ]))

    # Compute intra metrics like service does
    intra_metrics = act_df.select([
        "feature_id",
        pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
          .fill_null(0.0).alias("intra_ngram_jaccard"),
        pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim")
    ])
    print(f"\n8. INTRA METRICS (computed)")
    print(intra_metrics)

    # Load inter-feature metrics
    print(f"\n9. INTER-FEATURE METRICS")
    inter_df = pl.read_parquet("../data/master/interfeature_activation_similarity.parquet")
    inter_df = inter_df.filter(pl.col("feature_id").is_in(sample_features))
    print(f"   Features with inter-feature data: {inter_df['feature_id'].to_list()}")
    print(f"   (Note: May not have data for all features)")

    # Final join
    print(f"\n10. FINAL RESULT (all metrics joined)")
    result = agg2.join(intra_metrics, on="feature_id", how="left")
    if len(inter_df) > 0:
        # Process inter-feature metrics (simplified for display)
        inter_simple = inter_df.select([
            "feature_id",
            pl.lit(0.0).alias("inter_ngram_jaccard"),  # Would compute from pairs
            pl.lit(0.0).alias("inter_semantic_sim")
        ])
        result = result.join(inter_simple, on="feature_id", how="left")

    result = result.fill_null(0.0)
    print(result.sort("feature_id"))

    print("\n" + "=" * 80)
    print("SUMMARY:")
    print("- Embedding: Same value across all scorers for a feature+explainer")
    print("- Fuzz/Detection: Averaged across scorers per explainer")
    print("- Quality: (embed + fuzz + detection) / 3 per explainer")
    print("- Final scores: MAX quality across explainers")
    print("- Semantic sim: MEAN across explainers (pairwise similarities)")
    print("=" * 80)

if __name__ == "__main__":
    check_metric_calculations()
