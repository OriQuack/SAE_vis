#!/usr/bin/env python3
"""
Test script to measure actual API response times during frontend reload flow.
"""

import requests
import time
import json

BASE_URL = "http://localhost:8003"

def measure_api_call(name, method, endpoint, payload=None):
    """Measure the time taken for an API call."""
    url = f"{BASE_URL}{endpoint}"

    start = time.time()
    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, json=payload)
        else:
            raise ValueError(f"Unsupported method: {method}")

        elapsed = (time.time() - start) * 1000  # Convert to ms

        if response.status_code == 200:
            status = "✅"
            data = response.json()
        else:
            status = "❌"
            data = None

        print(f"{status} {name:30s} | {elapsed:7.1f}ms | {response.status_code}")
        return elapsed, response.status_code == 200, data
    except Exception as e:
        elapsed = (time.time() - start) * 1000
        print(f"❌ {name:30s} | {elapsed:7.1f}ms | ERROR: {e}")
        return elapsed, False, None


def main():
    print("=" * 80)
    print("Frontend Reload Flow - API Timing Test")
    print("=" * 80)
    print()

    timings = {}

    # Phase 1: Health Check
    print("Phase 1: Health Check")
    print("-" * 80)
    elapsed, success, _ = measure_api_call("Health Check", "GET", "/health")
    timings["health_check"] = elapsed
    print()

    if not success:
        print("❌ Backend not healthy. Stopping test.")
        return

    # Phase 2: Filter Options
    print("Phase 2: Filter Options")
    print("-" * 80)
    elapsed, success, filter_options = measure_api_call("Get Filter Options", "GET", "/api/filter-options")
    timings["filter_options"] = elapsed

    if success and filter_options:
        print(f"   llm_explainer: {filter_options.get('llm_explainer', [])}")
        print(f"   llm_scorer: {filter_options.get('llm_scorer', [])}")
    print()

    if not success:
        print("❌ Failed to get filter options. Stopping test.")
        return

    # Phase 3: Table Data (pre-load)
    print("Phase 3: Table Data Pre-load")
    print("-" * 80)
    table_payload = {
        "filters": {
            "sae_id": [],
            "explanation_method": [],
            "llm_explainer": filter_options.get("llm_explainer", []),
            "llm_scorer": filter_options.get("llm_scorer", []),
        }
    }
    elapsed, success, table_data = measure_api_call("Get Table Data", "POST", "/api/table-data", table_payload)
    timings["table_data"] = elapsed

    if success and table_data:
        # Table data structure: {features: [{feature_id, ...}]}
        features = table_data.get('features', [])
        print(f"   Total features: {len(features)}")
        if features:
            # Show a sample feature to understand structure
            sample_keys = list(features[0].keys()) if features else []
            print(f"   Sample feature keys: {sample_keys[:5]}")
    print()

    # Phase 4: Root Features
    print("Phase 4: Root Features")
    print("-" * 80)
    root_payload = {
        "filters": {
            "llm_explainer": filter_options.get("llm_explainer", []),
            "llm_scorer": filter_options.get("llm_scorer", []),
            "feature_label": [],
        },
        "metric": "",
        "thresholds": []
    }
    elapsed, success, root_data = measure_api_call("Get Root Features", "POST", "/api/feature-groups", root_payload)
    timings["root_features"] = elapsed

    if success and root_data:
        groups = root_data.get('groups', [])
        total_features = sum(len(g.get('feature_ids', [])) for g in groups)
        print(f"   Groups: {len(groups)}")
        print(f"   Total features: {total_features}")
        for i, group in enumerate(groups):
            print(f"   Group {i}: {len(group.get('feature_ids', []))} features - {group.get('range_label', 'N/A')}")
    print()

    # Phase 5: Feature Splitting Histogram
    print("Phase 5: Feature Splitting Stage")
    print("-" * 80)
    histogram_payload = {
        "filters": {
            "llm_explainer": filter_options.get("llm_explainer", []),
            "llm_scorer": filter_options.get("llm_scorer", []),
            "feature_label": [],
        },
        "metric": "decoder_similarity",
        "num_bins": 20
    }
    elapsed, success, _ = measure_api_call("Get Histogram (decoder_sim)", "POST", "/api/histogram-data", histogram_payload)
    timings["histogram_decoder_similarity"] = elapsed
    print()

    # Phase 6: Quality Stage Histogram
    print("Phase 6: Quality Stage")
    print("-" * 80)
    histogram_payload["metric"] = "quality_score"
    elapsed, success, _ = measure_api_call("Get Histogram (quality)", "POST", "/api/histogram-data", histogram_payload)
    timings["histogram_quality"] = elapsed
    print()

    # Summary
    print("=" * 80)
    print("TIMING SUMMARY")
    print("=" * 80)
    print()

    total = sum(timings.values())

    print(f"Health Check:                    {timings['health_check']:7.1f}ms")
    print(f"Filter Options:                  {timings['filter_options']:7.1f}ms")
    print(f"Table Data Pre-load:             {timings['table_data']:7.1f}ms")
    print(f"Root Features:                   {timings['root_features']:7.1f}ms")
    print(f"Histogram (decoder_similarity):  {timings['histogram_decoder_similarity']:7.1f}ms")
    print(f"Histogram (quality_score):       {timings['histogram_quality']:7.1f}ms")
    print("-" * 80)
    print(f"TOTAL API TIME:                  {total:7.1f}ms (~{total/1000:.2f}s)")
    print()
    print("Note: Total initialization includes local processing time (tree building,")
    print("      set intersections, UI rendering) which is not measured here.")
    print()

    # Save to JSON
    with open('api_timing_results.json', 'w') as f:
        json.dump(timings, f, indent=2)
    print("✅ Results saved to api_timing_results.json")


if __name__ == "__main__":
    main()
