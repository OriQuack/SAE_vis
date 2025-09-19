#!/usr/bin/env python
"""Test hierarchical thresholds functionality"""

import requests
import json

BASE_URL = "http://localhost:8003"

def test_hierarchical_thresholds():
    """Test that hierarchical thresholds work correctly"""

    # Test 1: Score agreement groups with all three scores
    print("\n=== Test 1: Score agreement groups ===")
    request_data = {
        "filters": {
            "sae_id": ["google/gemma-scope-9b-pt-res/layer_30/width_16k/average_l0_120"],
            "explanation_method": [],
            "llm_explainer": ["hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"],
            "llm_scorer": []
        },
        "thresholds": {
            "semdist_mean": 0.15,
            "score_high": 0.8
        },
        "hierarchicalThresholds": {
            "global_thresholds": {
                "semdist_mean": 0.15,
                "score_high": 0.8
            },
            "score_agreement_groups": {
                "split_true_semdist_low": {
                    "score_fuzz": 0.6,
                    "score_simulation": 0.6,
                    "score_detection": 0.6
                }
            }
        }
    }

    response = requests.post(f"{BASE_URL}/api/sankey-data", json=request_data)
    print(f"Response status: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"Nodes: {len(data['nodes'])}, Links: {len(data['links'])}")
        print("✅ Score agreement groups test passed")
    else:
        print(f"❌ Score agreement groups test failed: {response.text}")
        return False

    # Test 2: Semantic distance groups
    print("\n=== Test 2: Semantic distance groups ===")
    request_data["hierarchicalThresholds"]["semantic_distance_groups"] = {
        "split_true": 0.1
    }

    response = requests.post(f"{BASE_URL}/api/sankey-data", json=request_data)
    print(f"Response status: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"Nodes: {len(data['nodes'])}, Links: {len(data['links'])}")
        print("✅ Semantic distance groups test passed")
    else:
        print(f"❌ Semantic distance groups test failed: {response.text}")
        return False

    # Test 3: Combined hierarchical thresholds
    print("\n=== Test 3: Combined hierarchical thresholds ===")
    request_data["hierarchicalThresholds"] = {
        "global_thresholds": {
            "semdist_mean": 0.15,
            "score_high": 0.8
        },
        "semantic_distance_groups": {
            "split_true": 0.1,
            "split_false": 0.2
        },
        "score_agreement_groups": {
            "split_true_semdist_low": {
                "score_fuzz": 0.6,
                "score_simulation": 0.6,
                "score_detection": 0.6
            },
            "split_true_semdist_high": {
                "score_fuzz": 0.9,
                "score_simulation": 0.9,
                "score_detection": 0.9
            }
        }
    }

    response = requests.post(f"{BASE_URL}/api/sankey-data", json=request_data)
    print(f"Response status: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"Nodes: {len(data['nodes'])}, Links: {len(data['links'])}")

        # Verify nodes exist
        node_ids = [node['id'] for node in data['nodes']]
        print("\nNode IDs:")
        for node_id in node_ids:
            print(f"  - {node_id}")

        print("✅ Combined hierarchical thresholds test passed")
    else:
        print(f"❌ Combined hierarchical thresholds test failed: {response.text}")
        return False

    print("\n=== All tests passed! ✅ ===")
    return True

if __name__ == "__main__":
    test_hierarchical_thresholds()