#!/usr/bin/env python3
"""
Test script for performance optimization of explanation highlighting system.
Tests 3-phase optimization:
- Phase 1: Backend caching
- Phase 2: Batch database fetching
- Phase 3: Algorithm optimization
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, 'app')
from app.services.data_service import DataService
from app.services.alignment_service import AlignmentService

async def main():
    print("=" * 80)
    print("Performance Optimization Test")
    print("=" * 80)

    # Initialize services
    print("\n1. Initializing services...")
    data_service = DataService(data_path="../data")
    await data_service.initialize()

    alignment_service = AlignmentService(data_path="../data", data_service=data_service)
    await alignment_service.initialize()

    print(f"✅ Services initialized")
    print(f"   - Aligned segments cache: {len(alignment_service._semantic_cache)} entries")

    # Test data
    test_features = list(range(0, 100))  # First 100 features
    test_explainers = [
        "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4",
        "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8",
        "openai/gpt-oss-20b"
    ]

    # PHASE 2 TEST: Batch vs Individual Fetching
    print("\n2. Testing Phase 2: Batch Database Fetching")
    print("-" * 80)

    # Individual fetching (old way)
    start_time = time.time()
    for feature_id in test_features[:10]:
        for explainer in test_explainers:
            data_service.get_explanation_text(feature_id, explainer)
    individual_time = time.time() - start_time
    print(f"   Individual fetching (10 features × 3 explainers = 30 queries): {individual_time:.3f}s")

    # Batch fetching (new way)
    start_time = time.time()
    batch_texts = data_service.get_explanation_texts_batch(test_features[:10], test_explainers)
    batch_time = time.time() - start_time
    print(f"   Batch fetching (1 query for 30 texts): {batch_time:.3f}s")
    print(f"   ✅ Speedup: {individual_time/batch_time:.1f}x faster")

    # PHASE 2: Test Preload
    print("\n3. Testing Phase 2: Preload Explanations")
    print("-" * 80)

    start_time = time.time()
    alignment_service.preload_explanations(test_features, test_explainers)
    preload_time = time.time() - start_time
    print(f"   Preloaded {len(test_features)} features × {len(test_explainers)} explainers: {preload_time:.3f}s")
    print(f"   Text cache size: {len(alignment_service._text_cache)} entries")

    # PHASE 1 TEST: Caching Performance
    print("\n4. Testing Phase 1: 3-Level Caching")
    print("-" * 80)

    test_feature_id = 0
    test_explainer = test_explainers[0]

    # First call (no cache)
    start_time = time.time()
    segments1 = alignment_service.get_highlighted_explanation(test_feature_id, test_explainer)
    first_call_time = time.time() - start_time
    print(f"   First call (reconstruction): {first_call_time*1000:.1f}ms")
    print(f"   Segments returned: {len(segments1) if segments1 else 0}")

    # Second call (Level 3 cache hit)
    start_time = time.time()
    segments2 = alignment_service.get_highlighted_explanation(test_feature_id, test_explainer)
    cached_call_time = time.time() - start_time
    print(f"   Second call (Level 3 cache hit): {cached_call_time*1000:.1f}ms")
    print(f"   ✅ Speedup: {first_call_time/cached_call_time:.0f}x faster")

    # Verify cache sizes
    print(f"\n   Cache Statistics:")
    print(f"   - Level 1 (aligned segments): {len(alignment_service._semantic_cache)} entries")
    print(f"   - Level 2 (full texts): {len(alignment_service._text_cache)} entries")
    print(f"   - Level 3 (reconstructed): {len(alignment_service._reconstructed_cache)} entries")

    # PHASE 3 TEST: Algorithm Performance
    print("\n5. Testing Phase 3: Algorithm Optimization")
    print("-" * 80)

    # Test reconstruction speed for different text lengths
    test_cases = [
        (5, "Short explanations"),
        (50, "Medium explanations"),
        (100, "Long explanations")
    ]

    for count, description in test_cases:
        # Clear cache to force reconstruction
        alignment_service._reconstructed_cache.clear()

        start_time = time.time()
        for i in range(count):
            feature_id = test_features[i % len(test_features)]
            for explainer in test_explainers:
                alignment_service.get_highlighted_explanation(feature_id, explainer)

        elapsed = time.time() - start_time
        per_call = (elapsed / (count * len(test_explainers))) * 1000
        print(f"   {description} ({count} features × 3): {elapsed:.3f}s ({per_call:.1f}ms per call)")

    # FULL INTEGRATION TEST
    print("\n6. Full Integration Test (Simulating Table Load)")
    print("-" * 80)

    # Clear all caches to simulate fresh load
    alignment_service._text_cache.clear()
    alignment_service._reconstructed_cache.clear()

    # Simulate table load
    print(f"   Loading table: {len(test_features)} features × {len(test_explainers)} explainers...")

    start_time = time.time()

    # Step 1: Preload (Phase 2)
    alignment_service.preload_explanations(test_features, test_explainers)
    preload_time = time.time() - start_time

    # Step 2: Get all highlighted explanations (Phase 1 + 3)
    reconstruction_start = time.time()
    for feature_id in test_features:
        for explainer in test_explainers:
            alignment_service.get_highlighted_explanation(feature_id, explainer)
    reconstruction_time = time.time() - reconstruction_start

    total_time = time.time() - start_time

    print(f"\n   Performance Breakdown:")
    print(f"   - Preload (batch fetch): {preload_time*1000:.0f}ms")
    print(f"   - Reconstruction: {reconstruction_time*1000:.0f}ms")
    print(f"   - Total: {total_time*1000:.0f}ms")
    print(f"   - Per explanation: {(total_time / (len(test_features) * len(test_explainers)))*1000:.1f}ms")

    # Test cache hit performance
    print("\n7. Testing Cached Performance (Second Table Load)")
    print("-" * 80)

    start_time = time.time()
    for feature_id in test_features:
        for explainer in test_explainers:
            alignment_service.get_highlighted_explanation(feature_id, explainer)
    cached_total_time = time.time() - start_time

    print(f"   Cached load time: {cached_total_time*1000:.0f}ms")
    print(f"   ✅ Speedup: {total_time/cached_total_time:.0f}x faster than first load")

    # Cleanup
    await data_service.cleanup()
    await alignment_service.cleanup()

    print("\n" + "=" * 80)
    print("✅ All performance tests completed successfully!")
    print("=" * 80)

    # Summary
    print("\nPerformance Summary:")
    print(f"- Batch fetching: {individual_time/batch_time:.1f}x faster than individual queries")
    print(f"- Cache hits: {first_call_time/cached_call_time:.0f}x faster than reconstruction")
    print(f"- Second load: {total_time/cached_total_time:.0f}x faster (all cached)")
    print(f"\n  Expected table load time (824 features × 3 explainers):")
    print(f"  - First load: ~{(total_time / len(test_features)) * 824 / 1000:.1f}s")
    print(f"  - Cached load: ~{(cached_total_time / len(test_features)) * 824 / 1000:.2f}s")

if __name__ == "__main__":
    asyncio.run(main())
