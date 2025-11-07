"""
Direct Polars test to identify the exact aggregation error.
"""
import polars as pl
import sys
import traceback

def test_aggregation():
    """Test the problematic aggregation directly."""

    print("=" * 80)
    print("Direct Polars Aggregation Test")
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

        # Check schema
        print("\n3. Checking schema...")
        schema = lf.schema
        print(f"   Columns: {list(schema.keys())[:10]}...")  # Show first 10
        print(f"   decoder_similarity type: {schema.get('decoder_similarity', 'NOT FOUND')}")
        print(f"   semantic_similarity type: {schema.get('semantic_similarity', 'NOT FOUND')}")

        # Try the problematic aggregation
        print("\n4. Attempting aggregation...")
        print("   Testing decoder_similarity.first().list.len()...")

        # Test each part separately
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("decoder_similarity").first().alias("dec_sim_first")
            ]).collect()
            print(f"   ✅ .first() works: {len(test_df)} rows")
            print(f"   First value: {test_df['dec_sim_first'][0]}")
            print(f"   Type: {type(test_df['dec_sim_first'][0])}")
        except Exception as e:
            print(f"   ❌ .first() failed: {e}")
            traceback.print_exc()

        # Try list.len()
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("decoder_similarity").first().list.len().alias("dec_sim_len")
            ]).collect()
            print(f"   ✅ .first().list.len() works: {len(test_df)} rows")
        except Exception as e:
            print(f"   ❌ .first().list.len() failed: {e}")
            traceback.print_exc()

        # Try with coalesce
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.coalesce([
                    pl.col("decoder_similarity").first().list.len(),
                    pl.lit(0)
                ]).alias("dec_sim_len_coalesce")
            ]).collect()
            print(f"   ✅ coalesce version works: {len(test_df)} rows")
        except Exception as e:
            print(f"   ❌ coalesce version failed: {e}")
            traceback.print_exc()

        # Try semantic_similarity
        print("\n   Testing semantic_similarity...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("semantic_similarity").first().alias("sem_sim_first")
            ]).collect()
            print(f"   ✅ semantic_similarity.first() works: {len(test_df)} rows")
            print(f"   First value: {test_df['sem_sim_first'][0]}")
        except Exception as e:
            print(f"   ❌ semantic_similarity.first() failed: {e}")
            traceback.print_exc()

    except Exception as e:
        print(f"\n❌ FAILED: {e}")
        traceback.print_exc()
        return False

    print("\n" + "=" * 80)
    return True

if __name__ == "__main__":
    success = test_aggregation()
    sys.exit(0 if success else 1)
