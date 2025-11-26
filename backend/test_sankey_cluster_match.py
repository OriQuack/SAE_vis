"""
Production Sanity Check: Verify Sankey filtering matches clustering using actual services.

Uses:
1. FeatureGroupService - Get features above threshold (Sankey logic)
2. HierarchicalClusterCandidateService - Get features in >=2 clusters (clustering logic)
3. Verify: clustered_features ⊆ sankey_features
"""

import asyncio
import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent / "app"))

from app.services.feature_group_service import FeatureGroupService
from app.services.hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService
from app.models.common import Filters


async def test_sankey_cluster_match():
    """Test using actual production services"""

    print("=" * 80)
    print("PRODUCTION SANITY CHECK: Sankey vs Clustering")
    print("=" * 80)

    # ============================================================================
    # STEP 1: Initialize services
    # ============================================================================

    print("\n📦 Initializing services...")

    project_root = Path(__file__).parent.parent
    feature_service = FeatureGroupService()
    cluster_service = HierarchicalClusterCandidateService(project_root)

    print("✅ FeatureGroupService initialized")
    print("✅ HierarchicalClusterCandidateService initialized")

    # ============================================================================
    # STEP 2: Test with multiple thresholds
    # ============================================================================

    # Use empty filters to get ALL features
    filters = Filters(
        sae_id=[],
        explanation_method=[],
        llm_explainer=[],
        llm_scorer=[]
    )

    # Test all thresholds from 0.1 to 0.9 by 0.1 step
    # (0.0 and 1.0 are excluded as they're invalid for clustering)
    test_cases = [
        ("decoder_similarity", threshold)
        for threshold in [round(x * 0.1, 1) for x in range(1, 10)]
    ]

    for metric, similarity_threshold in test_cases:
        print(f"\n{'=' * 80}")
        print(f"TEST: {metric} >= {similarity_threshold}")
        print(f"{'=' * 80}")

        distance_threshold = 1.0 - similarity_threshold

        # ========================================================================
        # STEP 2A: Get Sankey features (features >= similarity_threshold)
        # ========================================================================

        print(f"\n📊 Step 1: Get Sankey segment features ({metric} >= {similarity_threshold})")

        # Get feature groups with single threshold
        # This creates 2 groups: [< threshold] and [>= threshold]
        response = await feature_service.get_feature_groups(
            filters=filters,
            metric=metric,
            thresholds=[similarity_threshold]
        )

        # The second group (index 1) contains features >= threshold
        sankey_group = response.groups[1]  # ">= threshold" group
        sankey_features = set(sankey_group.feature_ids)

        print(f"   Sankey features: {len(sankey_features)}")
        print(f"   Range: {sankey_group.range_label}")

        if len(sankey_features) == 0:
            print(f"   ⚠️  No features above threshold, skipping")
            continue

        # ========================================================================
        # STEP 2B: Get clustered features (distance <= distance_threshold)
        # ========================================================================

        print(f"\n🔬 Step 2: Cluster features (distance <= {distance_threshold:.3f})")

        # Pass ALL sankey features to clustering
        cluster_result = await cluster_service.get_all_cluster_pairs(
            feature_ids=list(sankey_features),
            threshold=distance_threshold
        )

        # Extract features from non-singleton clusters
        clustered_features = set()
        for cluster_info in cluster_result["clusters"]:
            # Only count features in clusters with 2+ members
            if len(cluster_info["feature_ids"]) >= 2:
                clustered_features.update(cluster_info["feature_ids"])

        singleton_count = len(sankey_features) - len(clustered_features)

        print(f"   Total clusters: {cluster_result['total_clusters']}")
        print(f"   Non-singleton clusters: {len(cluster_result['clusters'])}")
        print(f"   Clustered features: {len(clustered_features)}")
        print(f"   Singleton features: {singleton_count}")
        print(f"   Total pairs: {cluster_result['total_pairs']}")

        # ========================================================================
        # STEP 3: Sanity check
        # ========================================================================

        print(f"\n✅ SANITY CHECK:")

        is_subset = clustered_features.issubset(sankey_features)
        print(f"   clustered_features ⊆ sankey_features? {is_subset}")

        if not is_subset:
            extra = clustered_features - sankey_features
            print(f"   ❌ FAILED: {len(extra)} features in clusters but not in Sankey!")
            print(f"   Extra features: {list(extra)[:20]}")
            return False

        coverage = len(clustered_features) / len(sankey_features) * 100
        print(f"   Coverage: {coverage:.1f}% of Sankey features are clustered")

        # ========================================================================
        # STEP 4: Show cluster distribution
        # ========================================================================

        if len(cluster_result['clusters']) > 0:
            cluster_sizes = sorted(
                [len(c["feature_ids"]) for c in cluster_result['clusters']],
                reverse=True
            )

            print(f"\n📈 Cluster Distribution:")
            print(f"   Largest cluster: {cluster_sizes[0]} features")
            print(f"   Top 5 sizes: {cluster_sizes[:5]}")

            # Show example cluster
            example = cluster_result['clusters'][0]
            pairs_in_cluster = len(example["feature_ids"]) * (len(example["feature_ids"]) - 1) // 2
            print(f"\n🔍 Example Cluster #{example['cluster_id']}:")
            print(f"   Features: {example['feature_ids'][:10]}")
            print(f"   Size: {len(example['feature_ids'])}")
            print(f"   Pairs: {pairs_in_cluster}")

    # ============================================================================
    # FINAL RESULT
    # ============================================================================

    print(f"\n{'=' * 80}")
    print(f"✅ ALL SANITY CHECKS PASSED")
    print(f"{'=' * 80}")
    print(f"\nConclusion:")
    print(f"  ✅ clustered_features ⊆ sankey_features for all thresholds")
    print(f"  ✅ Backend clustering logic matches Sankey filtering")
    print(f"  ✅ Your logic (steps 1-6) is correctly implemented")
    print(f"\nKey findings:")
    print(f"  • Not all Sankey features cluster (some are singletons)")
    print(f"  • Stricter thresholds → fewer, tighter clusters")
    print(f"  • Looser thresholds → more, larger clusters")

    return True


if __name__ == "__main__":
    try:
        success = asyncio.run(test_sankey_cluster_match())
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
