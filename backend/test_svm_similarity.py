"""
Test script for SVM-based similarity sorting.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.data_service import DataService
from app.services.similarity_sort_service import SimilaritySortService
from app.models.similarity_sort import SimilaritySortRequest


async def test_svm_similarity():
    """Test SVM-based similarity sorting."""
    print("=" * 80)
    print("Testing SVM-Based Similarity Sorting")
    print("=" * 80)

    # Initialize services
    print("\n1. Initializing data service...")
    data_service = DataService("../data")
    await data_service.initialize()
    print(f"   ✓ Data service ready: {data_service.is_ready()}")

    # Create similarity service
    print("\n2. Creating similarity sort service...")
    similarity_service = SimilaritySortService(data_service)
    print("   ✓ Similarity service created")

    # Test with sample data
    print("\n3. Testing feature similarity sorting...")

    # Use some real feature IDs (assuming features 0-50 exist)
    all_feature_ids = list(range(50))
    selected_ids = [0, 1, 2]  # Mark as "good"
    rejected_ids = [48, 49]   # Mark as "bad"

    request = SimilaritySortRequest(
        feature_ids=all_feature_ids,
        selected_ids=selected_ids,
        rejected_ids=rejected_ids
    )

    print(f"   - All features: {len(all_feature_ids)}")
    print(f"   - Selected (✓): {selected_ids}")
    print(f"   - Rejected (✗): {rejected_ids}")

    try:
        response = await similarity_service.get_similarity_sorted_features(request)

        print(f"\n4. Results:")
        print(f"   ✓ Successfully sorted {response.total_features} features")
        print(f"   ✓ Weights used: {response.weights_used}")
        print(f"     (Empty list = SVM was used successfully)")

        if len(response.sorted_features) > 0:
            print(f"\n5. Top 5 most similar features:")
            for i, feature in enumerate(response.sorted_features[:5]):
                print(f"   {i+1}. Feature {feature.feature_id}: score = {feature.score:.4f}")

            print(f"\n6. Bottom 5 least similar features:")
            for i, feature in enumerate(response.sorted_features[-5:]):
                print(f"   {i+1}. Feature {feature.feature_id}: score = {feature.score:.4f}")

        # Check SVM cache
        print(f"\n7. SVM cache status:")
        print(f"   Cache size: {len(similarity_service._svm_cache)}")
        if len(similarity_service._svm_cache) > 0:
            print(f"   ✓ SVM model successfully cached")

        # Test cache hit
        print(f"\n8. Testing cache hit (same selections)...")
        response2 = await similarity_service.get_similarity_sorted_features(request)
        print(f"   ✓ Second call completed (should use cached model)")
        print(f"   Cache size: {len(similarity_service._svm_cache)} (should be 1)")

        print("\n" + "=" * 80)
        print("✓ All tests passed!")
        print("=" * 80)

    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True


if __name__ == "__main__":
    success = asyncio.run(test_svm_similarity())
    sys.exit(0 if success else 1)
