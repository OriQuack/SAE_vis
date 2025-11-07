"""
Test script for similarity sort API endpoint.
"""
import requests
import json

BASE_URL = "http://localhost:8003"

def test_similarity_sort():
    """Test the similarity sort endpoint with sample data."""

    # Test payload - mimicking what the frontend sends
    payload = {
        "selected_ids": [0, 1, 2],  # 3 selected features
        "rejected_ids": [],          # 0 rejected features
        "feature_ids": list(range(824))  # All 824 features
    }

    print("=" * 80)
    print("Testing Similarity Sort API")
    print("=" * 80)
    print(f"\nRequest payload:")
    print(f"  Selected IDs: {len(payload['selected_ids'])} features")
    print(f"  Rejected IDs: {len(payload['rejected_ids'])} features")
    print(f"  Total features: {len(payload['feature_ids'])} features")
    print()

    try:
        print("Sending POST request to /api/similarity-sort...")
        response = requests.post(
            f"{BASE_URL}/api/similarity-sort",
            json=payload,
            timeout=30
        )

        print(f"Response status: {response.status_code}")
        print()

        if response.status_code == 200:
            data = response.json()
            print("✅ SUCCESS!")
            print(f"  Sorted features: {data.get('total_features', 0)}")
            print(f"  Weights used: {len(data.get('weights_used', []))}")
            print(f"  First 5 scores:")
            for i, feat in enumerate(data.get('sorted_features', [])[:5]):
                print(f"    {i+1}. Feature {feat['feature_id']}: score={feat['score']:.4f}")
        else:
            print("❌ FAILED!")
            print(f"Response text: {response.text}")

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_similarity_sort()
