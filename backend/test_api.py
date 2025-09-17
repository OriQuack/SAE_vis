#!/usr/bin/env python3
"""
Basic API testing script for SAE Feature Visualization API

This script provides simple tests to verify the API endpoints are working correctly.
Run this after starting the server to ensure everything is functioning.

Usage:
    python test_api.py [--host HOST] [--port PORT]
"""

import requests
import json
import argparse
import sys
from typing import Dict, Any

class APITester:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()

    def test_health_check(self) -> bool:
        """Test the health check endpoint"""
        print("🔍 Testing health check...")
        try:
            response = self.session.get(f"{self.base_url}/health")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Health check passed: {data}")
                return True
            else:
                print(f"   ❌ Health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Health check error: {e}")
            return False

    def test_filter_options(self) -> Dict[str, Any]:
        """Test the filter options endpoint"""
        print("🔍 Testing filter options...")
        try:
            response = self.session.get(f"{self.base_url}/api/filter-options")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Filter options retrieved successfully")
                print(f"   📊 Available SAE IDs: {len(data.get('sae_id', []))}")
                print(f"   📊 Available explanation methods: {len(data.get('explanation_method', []))}")
                return data
            else:
                print(f"   ❌ Filter options failed: {response.status_code}")
                print(f"   Error: {response.text}")
                return {}
        except Exception as e:
            print(f"   ❌ Filter options error: {e}")
            return {}

    def test_histogram_data(self, filter_options: Dict[str, Any]) -> bool:
        """Test the histogram data endpoint"""
        print("🔍 Testing histogram data...")

        if not filter_options.get('sae_id'):
            print("   ⚠️  Skipping histogram test - no SAE IDs available")
            return False

        try:
            # Use the first available SAE ID for testing
            test_request = {
                "filters": {
                    "sae_id": [filter_options['sae_id'][0]]
                },
                "metric": "semdist_mean",
                "bins": 20
            }

            response = self.session.post(
                f"{self.base_url}/api/histogram-data",
                json=test_request
            )

            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Histogram data generated successfully")
                print(f"   📊 Total features: {data.get('total_features', 'N/A')}")
                print(f"   📊 Metric: {data.get('metric', 'N/A')}")
                return True
            else:
                print(f"   ❌ Histogram data failed: {response.status_code}")
                print(f"   Error: {response.text}")
                return False
        except Exception as e:
            print(f"   ❌ Histogram data error: {e}")
            return False

    def test_sankey_data(self, filter_options: Dict[str, Any]) -> bool:
        """Test the sankey data endpoint"""
        print("🔍 Testing Sankey data...")

        if not filter_options.get('sae_id'):
            print("   ⚠️  Skipping Sankey test - no SAE IDs available")
            return False

        try:
            # Use the first available values for testing
            test_request = {
                "filters": {
                    "sae_id": [filter_options['sae_id'][0]]
                },
                "thresholds": {
                    "semdist_mean": 0.15,
                    "score_high": 0.8
                }
            }

            response = self.session.post(
                f"{self.base_url}/api/sankey-data",
                json=test_request
            )

            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Sankey data generated successfully")
                print(f"   📊 Total nodes: {len(data.get('nodes', []))}")
                print(f"   📊 Total links: {len(data.get('links', []))}")
                print(f"   📊 Total features: {data.get('metadata', {}).get('total_features', 'N/A')}")
                return True
            else:
                print(f"   ❌ Sankey data failed: {response.status_code}")
                print(f"   Error: {response.text}")
                return False
        except Exception as e:
            print(f"   ❌ Sankey data error: {e}")
            return False

    def test_comparison_data(self, filter_options: Dict[str, Any]) -> bool:
        """Test the comparison data endpoint (expected to be not implemented)"""
        print("🔍 Testing comparison data...")

        if not filter_options.get('sae_id') or len(filter_options['sae_id']) < 1:
            print("   ⚠️  Skipping comparison test - insufficient SAE IDs")
            return False

        try:
            # Create two different configurations for testing
            test_request = {
                "sankey_left": {
                    "filters": {
                        "sae_id": [filter_options['sae_id'][0]]
                    },
                    "thresholds": {
                        "semdist_mean": 0.15,
                        "score_high": 0.8
                    }
                },
                "sankey_right": {
                    "filters": {
                        "sae_id": [filter_options['sae_id'][0]]
                    },
                    "thresholds": {
                        "semdist_mean": 0.20,  # Different threshold
                        "score_high": 0.8
                    }
                }
            }

            response = self.session.post(
                f"{self.base_url}/api/comparison-data",
                json=test_request
            )

            if response.status_code == 501:
                # Expected - Phase 2 feature not implemented yet
                print("   ✅ Comparison data correctly returns 'not implemented' (Phase 2)")
                return True
            elif response.status_code == 200:
                data = response.json()
                print(f"   ✅ Comparison data generated successfully")
                print(f"   📊 Total flows: {len(data.get('flows', []))}")
                return True
            else:
                print(f"   ❌ Comparison data unexpected status: {response.status_code}")
                print(f"   Error: {response.text}")
                return False
        except Exception as e:
            print(f"   ❌ Comparison data error: {e}")
            return False

    def test_feature_data(self) -> bool:
        """Test the feature data endpoint"""
        print("🔍 Testing feature data...")

        try:
            # Test with a common feature ID (assuming feature 0 exists)
            response = self.session.get(f"{self.base_url}/api/feature/0")

            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Feature data retrieved successfully")
                print(f"   📊 Feature ID: {data.get('feature_id', 'N/A')}")
                print(f"   📊 SAE ID: {data.get('sae_id', 'N/A')}")
                return True
            elif response.status_code == 404:
                # Try with feature ID 1
                response = self.session.get(f"{self.base_url}/api/feature/1")
                if response.status_code == 200:
                    data = response.json()
                    print(f"   ✅ Feature data retrieved successfully")
                    print(f"   📊 Feature ID: {data.get('feature_id', 'N/A')}")
                    return True
                else:
                    print("   ⚠️  No features found (feature IDs 0 and 1 both missing)")
                    return False
            else:
                print(f"   ❌ Feature data failed: {response.status_code}")
                print(f"   Error: {response.text}")
                return False
        except Exception as e:
            print(f"   ❌ Feature data error: {e}")
            return False

    def run_all_tests(self) -> int:
        """Run all tests and return the number of failures"""
        print(f"🚀 Starting API tests for {self.base_url}")
        print("=" * 60)

        failures = 0

        # Test health check first
        if not self.test_health_check():
            failures += 1
            print("⚠️  Server health check failed - other tests may not work")

        print()

        # Test filter options (needed for other tests)
        filter_options = self.test_filter_options()
        if not filter_options:
            failures += 1
        print()

        # Test histogram data
        if not self.test_histogram_data(filter_options):
            failures += 1
        print()

        # Test Sankey data
        if not self.test_sankey_data(filter_options):
            failures += 1
        print()

        # Test comparison data
        if not self.test_comparison_data(filter_options):
            failures += 1
        print()

        # Test feature data
        if not self.test_feature_data():
            failures += 1
        print()

        # Summary
        print("=" * 60)
        if failures == 0:
            print("🎉 All tests passed!")
        else:
            print(f"⚠️  {failures} test(s) failed")

        return failures

def main():
    parser = argparse.ArgumentParser(description="Test SAE Feature Visualization API")
    parser.add_argument("--host", default="127.0.0.1", help="API host")
    parser.add_argument("--port", type=int, default=8000, help="API port")

    args = parser.parse_args()

    base_url = f"http://{args.host}:{args.port}"
    tester = APITester(base_url)

    try:
        failures = tester.run_all_tests()
        sys.exit(failures)
    except KeyboardInterrupt:
        print("\n👋 Testing interrupted by user")
        sys.exit(1)

if __name__ == "__main__":
    main()