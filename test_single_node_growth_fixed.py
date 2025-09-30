#!/usr/bin/env python3
"""
Test script to capture the single node growth issue.
Send a request where only one node is selected to grow from stage 1 to stage 2,
and save both request and response for analysis.
"""

import json
import requests
import sys
from pathlib import Path

# API base URL
BASE_URL = "http://localhost:8003"

def save_json(data, filename):
    """Save data to JSON file in root directory"""
    root_dir = Path("/home/dohyun/interface")
    file_path = root_dir / filename
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    print(f"✅ Saved to: {file_path}")

def create_test_request():
    """Create a request that demonstrates the single node growth issue"""

    print("🚨 Creating single node growth request...")
    print("   Only growing 'root_feature_splitting_1' to stage 2")
    print("   'root_feature_splitting_0' should stay at stage 1")

    single_growth_request = {
        "filters": {
            "sae_id": [],
            "explanation_method": [],
            "llm_explainer": [],
            "llm_scorer": []
        },
        "thresholdTree": {
            "nodes": [
                {
                    "id": "root",
                    "stage": 0,
                    "category": "root",
                    "parent_path": [],
                    "split_rule": {
                        "type": "range",
                        "metric": "feature_splitting",
                        "thresholds": [0.5]
                    },
                    "children_ids": ["root_feature_splitting_0", "root_feature_splitting_1"]
                },
                {
                    "id": "root_feature_splitting_0",
                    "stage": 1,
                    "category": "feature_splitting",
                    "parent_path": [
                        {
                            "parent_id": "root",
                            "parent_split_rule": {
                                "type": "range",
                                "range_info": {
                                    "metric": "feature_splitting",
                                    "thresholds": [0.5],
                                    "selected_range": 0
                                }
                            },
                            "branch_index": 0,
                            "triggering_values": {"feature_splitting": 0.3}
                        }
                    ],
                    "split_rule": None,  # No split rule = leaf node, should stay at stage 1
                    "children_ids": []
                },
                {
                    "id": "root_feature_splitting_1",
                    "stage": 1,
                    "category": "feature_splitting",
                    "parent_path": [
                        {
                            "parent_id": "root",
                            "parent_split_rule": {
                                "type": "range",
                                "range_info": {
                                    "metric": "feature_splitting",
                                    "thresholds": [0.5],
                                    "selected_range": 1
                                }
                            },
                            "branch_index": 1,
                            "triggering_values": {"feature_splitting": 0.7}
                        }
                    ],
                    "split_rule": {  # This node grows to stage 2
                        "type": "range",
                        "metric": "semdist_mean",
                        "thresholds": [0.1]
                    },
                    "children_ids": ["root_feature_splitting_1_semdist_mean_0", "root_feature_splitting_1_semdist_mean_1"]
                },
                # New child nodes for the growing parent
                {
                    "id": "root_feature_splitting_1_semdist_mean_0",
                    "stage": 2,
                    "category": "semantic_distance",
                    "parent_path": [
                        {
                            "parent_id": "root",
                            "parent_split_rule": {
                                "type": "range",
                                "range_info": {
                                    "metric": "feature_splitting",
                                    "thresholds": [0.5],
                                    "selected_range": 1
                                }
                            },
                            "branch_index": 1,
                            "triggering_values": {"feature_splitting": 0.7}
                        },
                        {
                            "parent_id": "root_feature_splitting_1",
                            "parent_split_rule": {
                                "type": "range",
                                "range_info": {
                                    "metric": "semdist_mean",
                                    "thresholds": [0.1],
                                    "selected_range": 0
                                }
                            },
                            "branch_index": 0,
                            "triggering_values": {"semdist_mean": 0.05}
                        }
                    ],
                    "split_rule": None,
                    "children_ids": []
                },
                {
                    "id": "root_feature_splitting_1_semdist_mean_1",
                    "stage": 2,
                    "category": "semantic_distance",
                    "parent_path": [
                        {
                            "parent_id": "root",
                            "parent_split_rule": {
                                "type": "range",
                                "range_info": {
                                    "metric": "feature_splitting",
                                    "thresholds": [0.5],
                                    "selected_range": 1
                                }
                            },
                            "branch_index": 1,
                            "triggering_values": {"feature_splitting": 0.7}
                        },
                        {
                            "parent_id": "root_feature_splitting_1",
                            "parent_split_rule": {
                                "type": "range",
                                "range_info": {
                                    "metric": "semdist_mean",
                                    "thresholds": [0.1],
                                    "selected_range": 1
                                }
                            },
                            "branch_index": 1,
                            "triggering_values": {"semdist_mean": 0.15}
                        }
                    ],
                    "split_rule": None,
                    "children_ids": []
                }
            ],
            "metrics": ["feature_splitting", "semdist_mean"],
        },
    }

    return single_growth_request

def test_single_node_growth():
    """Test the single node growth issue"""

    print("🧪 Testing Single Node Growth Issue")
    print("=" * 50)

    # Create and send the request
    request = create_test_request()
    if not request:
        return

    print("📤 Sending single node growth request...")

    try:
        response = requests.post(f"{BASE_URL}/api/sankey-data", json=request, timeout=10)

        if response.status_code != 200:
            print(f"❌ Request failed: {response.status_code}")
            print(response.text)
            save_json(request, "failed_request.json")
            with open("/home/dohyun/interface/failed_response.txt", "w") as f:
                f.write(f"Status: {response.status_code}\n\n{response.text}")
            return

        result_data = response.json()

        # Save request and response
        save_json(request, "single_growth_request.json")
        save_json(result_data, "single_growth_response.json")

        print(f"✅ Success! Response: {len(result_data['nodes'])} nodes, {len(result_data['links'])} links")

        # Analyze the results
        print("\n🔍 ANALYSIS:")
        print("=" * 30)

        print("\n📊 Expected Behavior:")
        print("   - root_feature_splitting_0 should stay at stage 1 (no growth)")
        print("   - root_feature_splitting_1 should have links to stage 2 (growth)")
        print("   - New nodes should appear at stage 2 as children of root_feature_splitting_1")

        print("\n📊 Actual Response Nodes:")
        stages = {}
        for node in result_data['nodes']:
            stage = node.get('stage', '?')
            if stage not in stages:
                stages[stage] = []
            stages[stage].append({
                'id': node['id'],
                'category': node.get('category', '?'),
                'count': node.get('feature_count', '?')
            })
            print(f"   - {node['id']}")
            print(f"     Stage: {stage}, Category: {node.get('category', '?')}, Count: {node.get('feature_count', '?')}")

        print(f"\n📊 Nodes by Stage:")
        for stage in sorted(stages.keys()):
            print(f"   Stage {stage}: {len(stages[stage])} nodes")
            for node in stages[stage]:
                print(f"     - {node['id']} ({node['count']} features)")

        print(f"\n📊 Links:")
        for link in result_data['links']:
            print(f"   - {link['source']} → {link['target']} ({link['value']} features)")

        # Check for the specific issue
        print(f"\n🚨 ISSUE CHECK:")
        root_fs_0_nodes = [n for n in result_data['nodes'] if n['id'] == 'root_feature_splitting_0']
        if root_fs_0_nodes:
            node = root_fs_0_nodes[0]
            expected_stage = 1
            actual_stage = node.get('stage')
            if actual_stage == expected_stage:
                print(f"   ✅ root_feature_splitting_0 correctly stays at stage {actual_stage}")
            else:
                print(f"   ❌ root_feature_splitting_0 incorrectly moved to stage {actual_stage} (expected {expected_stage})")
        else:
            print(f"   ❌ root_feature_splitting_0 missing from response!")

        # Check if links exist from root_feature_splitting_0 (they shouldn't)
        fs_0_links = [link for link in result_data['links'] if link['source'] == 'root_feature_splitting_0']
        if fs_0_links:
            print(f"   ❌ root_feature_splitting_0 has {len(fs_0_links)} outgoing links (should have 0):")
            for link in fs_0_links:
                print(f"      - {link['source']} → {link['target']} ({link['value']} features)")
        else:
            print(f"   ✅ root_feature_splitting_0 has no outgoing links (correct)")

        # Check if links exist from root_feature_splitting_1 (they should)
        fs_1_links = [link for link in result_data['links'] if link['source'] == 'root_feature_splitting_1']
        if fs_1_links:
            print(f"   ✅ root_feature_splitting_1 has {len(fs_1_links)} outgoing links (correct):")
            for link in fs_1_links:
                print(f"      - {link['source']} → {link['target']} ({link['value']} features)")
        else:
            print(f"   ❌ root_feature_splitting_1 has no outgoing links (should have links to stage 2)")

    except Exception as e:
        print(f"❌ Error: {e}")
        save_json(request, "error_request.json")

if __name__ == "__main__":
    test_single_node_growth()