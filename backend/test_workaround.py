"""
Test alternative aggregation approaches for semantic_similarity.
"""
import polars as pl
import sys
import traceback

def test_alternatives():
    """Test alternative aggregation methods."""

    print("=" * 80)
    print("Alternative Aggregation Methods Test")
    print("=" * 80)

    try:
        # Load the parquet file
        lf = pl.scan_parquet("../data/master/features.parquet")
        feature_ids = [0, 1, 2]
        lf = lf.filter(pl.col("feature_id").is_in(feature_ids))

        # Alternative 1: Don't use .first(), use list operations on the entire column
        print("\n1. Method 1: List operations without .first()...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("semantic_similarity")
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.mean()
                  .alias("sem_mean_v1")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
            print(f"   Values: {test_df['sem_mean_v1'][:3]}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")

        # Alternative 2: Use .head(1) instead of .first()
        print("\n2. Method 2: Use .head(1) instead of .first()...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("semantic_similarity")
                  .head(1)
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.mean()
                  .alias("sem_mean_v2")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
            print(f"   Values: {test_df['sem_mean_v2'][:3]}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")

        # Alternative 3: Use .get(0) instead of .first()
        print("\n3. Method 3: Use .get(0) instead of .first()...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("semantic_similarity")
                  .get(0)
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.mean()
                  .alias("sem_mean_v3")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
            print(f"   Values: {test_df['sem_mean_v3'][:3]}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")

        # Alternative 4: Process without groupby first, then group
        print("\n4. Method 4: Pre-process semantic_similarity, then group...")
        try:
            # First extract the mean from semantic_similarity for each row
            lf_prep = lf.with_columns([
                pl.col("semantic_similarity")
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.mean()
                  .alias("sem_sim_mean_raw")
            ])

            # Then group and aggregate
            test_df = lf_prep.group_by(["feature_id", "llm_explainer"]).agg([
                pl.col("sem_sim_mean_raw").first().alias("sem_mean_v4")
            ]).collect()
            print(f"   ✅ Works: {len(test_df)} rows")
            print(f"   Values: {test_df['sem_mean_v4'][:3]}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            traceback.print_exc()

        # Alternative 5: Check if we even need to group by llm_explainer
        print("\n5. Method 5: Check row count per group...")
        try:
            test_df = lf.group_by(["feature_id", "llm_explainer"]).agg([
                pl.count().alias("row_count")
            ]).collect()
            print(f"   ✅ Row counts per group:")
            print(test_df)
        except Exception as e:
            print(f"   ❌ Failed: {e}")

    except Exception as e:
        print(f"\n❌ OVERALL FAILED: {e}")
        traceback.print_exc()
        return False

    print("\n" + "=" * 80)
    print("Tests complete!")
    return True

if __name__ == "__main__":
    success = test_alternatives()
    sys.exit(0 if success else 1)
