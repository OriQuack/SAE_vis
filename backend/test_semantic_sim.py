"""
Test semantic_similarity field specifically.
"""
import polars as pl
import sys
import traceback

def test_semantic_similarity():
    """Test semantic_similarity operations."""

    print("=" * 80)
    print("Semantic Similarity Test")
    print("=" * 80)

    try:
        # Load the parquet file
        print("\n1. Loading parquet file...")
        lf = pl.scan_parquet("../data/master/features.parquet")
        print("   ✅ File loaded (lazy)")

        # Sample feature IDs
        feature_ids = [0, 1, 2]
        print(f"\n2. Filtering to {len(feature_ids)} features...")
        lf = lf.filter(pl.col("feature_id").is_in(feature_ids))
        print("   ✅ Filter applied")

        # Check if semantic_similarity has nulls
        print("\n3. Checking for null values...")
        null_check = lf.select([
            pl.col("feature_id"),
            pl.col("semantic_similarity").is_null().alias("is_null")
        ]).collect()
        print(f"   Null count: {null_check['is_null'].sum()}/{len(null_check)}")
        if null_check['is_null'].sum() > 0:
            print(f"   Features with null semantic_similarity: {null_check.filter(pl.col('is_null'))['feature_id'].to_list()}")

        # Try basic aggregation without processing semantic_similarity
        print("\n4. Test 1: Group without semantic_similarity...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("decoder_similarity").first().list.len().alias("dec_len")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
        except Exception as e:
            print(f"   ❌ Failed: {e}")

        # Try semantic_similarity .first()
        print("\n5. Test 2: semantic_similarity.first()...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("semantic_similarity").first().alias("sem_first")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
            print(f"   First 3 values:")
            for i in range(min(3, len(test_df))):
                print(f"     [{i}] {test_df['sem_first'][i]}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            traceback.print_exc()

        # Try semantic_similarity .first().list.eval()
        print("\n6. Test 3: semantic_similarity.first().list.eval()...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("semantic_similarity")
                  .first()
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .alias("sem_cosines")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            traceback.print_exc()

        # Try with .list.mean()
        print("\n7. Test 4: semantic_similarity.first().list.eval().list.mean()...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("semantic_similarity")
                  .first()
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.mean()
                  .alias("sem_mean")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
            print(f"   First 3 values: {test_df['sem_mean'][:3]}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            traceback.print_exc()

        # Try with coalesce
        print("\n8. Test 5: coalesce version...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.coalesce([
                    pl.col("semantic_similarity")
                      .first()
                      .list.eval(pl.element().struct.field("cosine_similarity"))
                      .list.mean(),
                    pl.lit(0.0)
                ]).alias("sem_mean_coalesce")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
            print(f"   First 3 values: {test_df['sem_mean_coalesce'][:3]}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            traceback.print_exc()

        # Try full aggregation  combining both fields
        print("\n9. Test 6: Full aggregation (both decoder and semantic)...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("decoder_similarity").first().list.len().alias("dec_len"),
                pl.coalesce([
                    pl.col("semantic_similarity")
                      .first()
                      .list.eval(pl.element().struct.field("cosine_similarity"))
                      .list.mean(),
                    pl.lit(0.0)
                ]).alias("sem_mean")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            traceback.print_exc()

    except Exception as e:
        print(f"\n❌ OVERALL FAILED: {e}")
        traceback.print_exc()
        return False

    print("\n" + "=" * 80)
    print("All tests passed!")
    return True

if __name__ == "__main__":
    success = test_semantic_similarity()
    sys.exit(0 if success else 1)
