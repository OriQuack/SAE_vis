"""
Simple sanity check: verify embedding is same across scorers.
"""
import polars as pl

pl.enable_string_cache()

# Load and transform like DataService does
print("=" * 80)
print("Embedding Score Sanity Check")
print("=" * 80)

# Read raw parquet
df = pl.read_parquet("../data/master/features.parquet")
print(f"\n1. RAW SCHEMA (before transformation)")
print(f"   Columns: {df.columns}")
print(f"   Rows: {len(df)}")
print(f"   Unique features: {df['feature_id'].n_unique()}")

# Check scores structure
print(f"\n2. SCORES FIELD STRUCTURE")
sample_row = df[0]
scores_list = sample_row['scores'][0]
print(f"   Type: List(Struct)")
print(f"   Number of scorers: {len(scores_list)}")
print(f"   First scorer: {scores_list[0]}")

# Explode scores like DataService does
df_exploded = df.explode("scores")
df_exploded = df_exploded.with_columns([
    pl.col("scores").struct.field("scorer").alias("llm_scorer"),
    pl.col("scores").struct.field("fuzz").alias("score_fuzz"),
    pl.col("scores").struct.field("detection").alias("score_detection"),
    pl.col("scores").struct.field("embedding").alias("score_embedding"),
])

print(f"\n3. AFTER EXPLODING SCORES")
print(f"   Rows: {len(df_exploded)} (was {len(df)})")
print(f"   Scorers: {df_exploded['llm_scorer'].unique().to_list()}")

# Check feature 0 embedding scores
feature_0 = df_exploded.filter(pl.col("feature_id") == 0)
print(f"\n4. FEATURE 0 EMBEDDING SCORES (across scorers)")
print(feature_0.select(["feature_id", "llm_explainer", "llm_scorer", "score_embedding"]))

# Check if embedding is same across scorers for each feature+explainer
print(f"\n5. EMBEDDING CONSISTENCY CHECK")
for fid in [0, 1, 2]:
    feature_df = df_exploded.filter(pl.col("feature_id") == fid)
    for explainer in feature_df["llm_explainer"].unique().to_list():
        embed_vals = feature_df.filter(
            pl.col("llm_explainer") == explainer
        )["score_embedding"].to_list()
        is_same = len(set(embed_vals)) == 1
        status = "✅ SAME" if is_same else "❌ DIFFERENT"
        print(f"   Feature {fid}, {explainer[:30]}...: {embed_vals} {status}")

print("\n" + "=" * 80)
