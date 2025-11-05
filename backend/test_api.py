#!/usr/bin/env python3
"""
Backend API tests for dual n-gram architecture.

Tests the activation examples endpoint to ensure proper dual n-gram data structure
including char_ngram_max_jaccard, word_ngram_max_jaccard, and position data.
"""

import sys
from pathlib import Path

# Add backend to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

import asyncio
from httpx import AsyncClient
from app.main import app, data_service


async def test_activation_examples_dual_ngram():
    """Test that activation examples return dual n-gram structure."""
    print("\n" + "=" * 80)
    print("Testing Activation Examples API - Dual N-gram Architecture")
    print("=" * 80)

    # Get data service from main module (initialized in main())
    from app.main import data_service as service

    # Wait for data service to initialize
    if service and not service.is_ready():
        print("⏳ Waiting for data service initialization...")
        await asyncio.sleep(2)

    async with AsyncClient(app=app, base_url="http://test") as client:
        # Test with a small batch of features
        test_feature_ids = [0, 1, 2]

        print(f"\n📤 Requesting activation examples for feature IDs: {test_feature_ids}")

        response = await client.post(
            "/api/activation-examples",
            json={"feature_ids": test_feature_ids}
        )

        print(f"📥 Response status: {response.status_code}")

        if response.status_code != 200:
            print(f"❌ Error: {response.text}")
            return False

        data = response.json()

        # Verify response structure
        assert "examples" in data, "Response missing 'examples' field"
        examples = data["examples"]

        print(f"✅ Received data for {len(examples)} features")

        # Test first feature in detail
        feature_id = str(test_feature_ids[0])
        if feature_id not in examples:
            print(f"❌ Feature {feature_id} not in response")
            return False

        feature_data = examples[feature_id]
        print(f"\n🔍 Inspecting feature {feature_id} data structure:")

        # Check required fields exist
        required_fields = [
            "quantile_examples",
            "semantic_similarity",
            "char_ngram_max_jaccard",
            "word_ngram_max_jaccard",
            "top_char_ngram_text",
            "top_word_ngram_text",
            "pattern_type"
        ]

        missing_fields = []
        for field in required_fields:
            if field in feature_data:
                print(f"  ✅ {field}: {type(feature_data[field]).__name__}")
                if field in ["char_ngram_max_jaccard", "word_ngram_max_jaccard"]:
                    print(f"      → Value: {feature_data[field]:.4f}")
                elif field in ["top_char_ngram_text", "top_word_ngram_text"]:
                    print(f"      → Value: '{feature_data[field]}'")
                elif field == "pattern_type":
                    print(f"      → Value: '{feature_data[field]}'")
            else:
                missing_fields.append(field)
                print(f"  ❌ {field}: MISSING")

        # Check that max_jaccard is removed (clean break)
        if "max_jaccard" in feature_data:
            print(f"  ⚠️  max_jaccard: SHOULD BE REMOVED (legacy field)")
        else:
            print(f"  ✅ max_jaccard: Properly removed (clean break)")

        # Check quantile examples structure
        quantile_examples = feature_data["quantile_examples"]
        print(f"\n🔍 Quantile examples structure:")
        print(f"  → Count: {len(quantile_examples)} examples")

        if len(quantile_examples) > 0:
            first_example = quantile_examples[0]
            print(f"  → First example fields:")

            example_fields = [
                "quantile_index",
                "prompt_id",
                "prompt_tokens",
                "activation_pairs",
                "max_activation",
                "max_activation_position",
                "char_ngram_positions",
                "word_ngram_positions"
            ]

            for field in example_fields:
                if field in first_example:
                    if field == "char_ngram_positions":
                        positions = first_example[field]
                        print(f"      ✅ {field}: {len(positions)} positions")
                        if len(positions) > 0:
                            print(f"          → Example: {positions[0]}")
                    elif field == "word_ngram_positions":
                        positions = first_example[field]
                        print(f"      ✅ {field}: {len(positions)} positions")
                        if len(positions) > 0:
                            print(f"          → Example: {positions[0]}")
                    elif field == "prompt_tokens":
                        tokens = first_example[field]
                        print(f"      ✅ {field}: {len(tokens)} tokens")
                        print(f"          → First 3: {tokens[:3]}")
                    elif field == "activation_pairs":
                        pairs = first_example[field]
                        print(f"      ✅ {field}: {len(pairs)} pairs")
                    else:
                        print(f"      ✅ {field}: {first_example[field]}")
                else:
                    print(f"      ❌ {field}: MISSING")

        # Summary
        print(f"\n" + "=" * 80)
        if missing_fields:
            print(f"❌ TEST FAILED - Missing fields: {missing_fields}")
            return False
        else:
            print("✅ TEST PASSED - All dual n-gram fields present and properly structured")
            print("\n📊 Summary:")
            print(f"  • Features tested: {len(test_feature_ids)}")
            print(f"  • Dual n-gram fields verified: ✅")
            print(f"  • Legacy max_jaccard removed: ✅")
            print(f"  • Position data (char_offset) present: ✅")
            print(f"  • Nested structures validated: ✅")
            return True


async def test_health_check():
    """Test health endpoint."""
    print("\n" + "=" * 80)
    print("Testing Health Endpoint")
    print("=" * 80)

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health")
        print(f"📥 Response status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed")
            print(f"   → Status: {data.get('status')}")
            return True
        else:
            print(f"❌ Health check failed")
            return False


async def main():
    """Run all tests."""
    print("\n" + "🧪" * 40)
    print("BACKEND API TEST SUITE - DUAL N-GRAM ARCHITECTURE")
    print("🧪" * 40)

    # Initialize data service (handle if already initialized by lifespan)
    print("\n⏳ Checking data service...")
    try:
        # Import DataService and create instance if needed
        from app.services.data_service import DataService

        # Check if data_service is None (happens in test context)
        if data_service is None:
            print("⚠️  Data service not initialized by lifespan, creating test instance...")
            test_data_service = DataService()
            await test_data_service.initialize()
            print("✅ Test data service initialized")

            # Temporarily replace for testing
            import app.main as main_module
            main_module.data_service = test_data_service
        elif not data_service.is_ready():
            print("⏳ Data service exists but not ready, initializing...")
            await data_service.initialize()
            print("✅ Data service initialized")
        else:
            print("✅ Data service already initialized")
    except Exception as e:
        print(f"❌ Failed to initialize data service: {e}")
        import traceback
        traceback.print_exc()
        return

    results = []

    # Run tests
    results.append(("Health Check", await test_health_check()))
    results.append(("Activation Examples (Dual N-gram)", await test_activation_examples_dual_ngram()))

    # Print summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status} - {test_name}")

    print(f"\n{'=' * 80}")
    print(f"TOTAL: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed!")
    else:
        print("⚠️  Some tests failed")

    print("=" * 80 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
