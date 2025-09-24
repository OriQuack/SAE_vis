#!/usr/bin/env python3
"""
Test script to demonstrate hierarchical threshold logging.

This test will trigger all the logging we've added to help debug the issue
where all nodes in a stage change when a threshold is adjusted.
"""

import asyncio
import httpx
import json
from typing import Dict, Any

# Test endpoint
BASE_URL = "http://localhost:8004"

def create_hierarchical_request_with_individual_override() -> Dict[str, Any]:
    """Create a sankey request with individual node threshold override."""
    return {
        "filters": {
            "sae_id": ["google/gemma-scope-9b-pt-res/layer_30/width_16k/average_l0_120"],
            "explanation_method": ["quantiles"],
            "llm_explainer": ["hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"],
            "llm_scorer": ["hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"]
        },
        "thresholds": {
            "semdist_mean": 0.1,
            "score_high": 0.5
        },
        "nodeThresholds": None,
        "hierarchicalThresholds": {
            "global_thresholds": {
                "semdist_mean": 0.1,
                "score_high": 0.5
            },
            "parent_groups": {
                "split_true": {
                    "semdist_mean": 0.05
                },
                "split_false": {
                    "semdist_mean": 0.1
                },
                "split_true_semdist_high": {
                    "score_fuzz": 0.5,
                    "score_simulation": 0.5,
                    "score_detection": 0.5
                },
                "split_true_semdist_low": {
                    "score_fuzz": 0.5,
                    "score_simulation": 0.5,
                    "score_detection": 0.5
                },
                "split_false_semdist_high": {
                    "score_fuzz": 0.5,
                    "score_simulation": 0.5,
                    "score_detection": 0.5
                },
                "split_false_semdist_low": {
                    "score_fuzz": 0.5,
                    "score_simulation": 0.5,
                    "score_detection": 0.5
                }
            },
            "individual_node_groups": {
                # This should affect ONLY split_true_semdist_low node
                "node_split_true_semdist_low": {
                    "semdist_mean": 0.001  # Much lower threshold - should merge most into "low" semantic distance
                }
            }
        }
    }

def create_baseline_hierarchical_request() -> Dict[str, Any]:
    """Create baseline request without individual node overrides."""
    request = create_hierarchical_request_with_individual_override()
    # Remove individual node overrides
    request["hierarchicalThresholds"]["individual_node_groups"] = {}
    return request

async def test_threshold_logging():
    """Test the logging by comparing baseline vs override scenarios."""
    async with httpx.AsyncClient() as client:
        print("🔍 Testing threshold logging...")
        print("=" * 60)

        # Test 1: Baseline (no individual overrides)
        print("\n🔄 Test 1: BASELINE (no individual node overrides)")
        print("-" * 50)
        baseline_request = create_baseline_hierarchical_request()

        try:
            response = await client.post(
                f"{BASE_URL}/api/sankey-data",
                json=baseline_request,
                timeout=30.0
            )

            if response.status_code == 200:
                baseline_data = response.json()
                print(f"✅ Baseline request successful")

                # Find split_true_semdist_low node count
                baseline_low_count = None
                for node in baseline_data.get("nodes", []):
                    if node["id"] == "split_true_semdist_low":
                        baseline_low_count = node["feature_count"]
                        break

                print(f"📊 Baseline split_true_semdist_low count: {baseline_low_count}")
            else:
                print(f"❌ Baseline request failed: {response.status_code}")
                print(f"Response: {response.text}")

        except Exception as e:
            print(f"❌ Baseline request error: {e}")

        # Test 2: With individual node override
        print("\n🎯 Test 2: WITH INDIVIDUAL NODE OVERRIDE")
        print("-" * 50)
        override_request = create_hierarchical_request_with_individual_override()

        try:
            response = await client.post(
                f"{BASE_URL}/api/sankey-data",
                json=override_request,
                timeout=30.0
            )

            if response.status_code == 200:
                override_data = response.json()
                print(f"✅ Override request successful")

                # Find split_true_semdist_low node count
                override_low_count = None
                for node in override_data.get("nodes", []):
                    if node["id"] == "split_true_semdist_low":
                        override_low_count = node["feature_count"]
                        break

                print(f"📊 Override split_true_semdist_low count: {override_low_count}")

                # Compare the counts
                if baseline_low_count and override_low_count:
                    if baseline_low_count != override_low_count:
                        print(f"✅ SUCCESS: Node counts changed from {baseline_low_count} to {override_low_count}")
                        print(f"🔧 Individual node override is WORKING!")
                    else:
                        print(f"❌ ISSUE: Node counts are the SAME ({baseline_low_count})")
                        print(f"🚫 Individual node override is NOT WORKING!")

            else:
                print(f"❌ Override request failed: {response.status_code}")
                print(f"Response: {response.text}")

        except Exception as e:
            print(f"❌ Override request error: {e}")

        print("\n📝 Check the backend logs above to see detailed threshold application!")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_threshold_logging())