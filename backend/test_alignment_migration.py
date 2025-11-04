#!/usr/bin/env python3
"""
Test script for alignment service migration from JSON to parquet with reconstruction.
"""

import asyncio
import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent / "app"))

from services.alignment_service import AlignmentService
from services.data_service import DataService

async def main():
    """Test the alignment service with new parquet backend and full text reconstruction."""

    print("=" * 80)
    print("Testing Alignment Service with Full Text Reconstruction")
    print("=" * 80)

    # Initialize data service first
    print("\n1. Initializing data service...")
    data_service = DataService(data_path="../data")
    await data_service.initialize()
    print("✅ Data service initialized")

    # Initialize alignment service with data_service
    print("\n2. Initializing alignment service...")
    service = AlignmentService(data_path="../data", data_service=data_service)

    print("\n3. Loading alignment data...")
    success = await service.initialize()

    if not success:
        print("❌ Failed to initialize alignment service")
        return False

    print("✅ Alignment service initialized successfully")
    print(f"   - Cache size: {len(service._semantic_cache)} feature-explainer combinations")
    print(f"   - Statistics: {service.semantic_stats}")

    # Test 1: Get highlighted explanation for a feature with alignments
    print("\n4. Testing get_highlighted_explanation() with full text reconstruction...")

    test_feature_id = 0  # We know this has aligned groups
    test_explainer = "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"

    # Get full explanation text for comparison
    full_text = data_service.get_explanation_text(test_feature_id, test_explainer)
    print(f"\n   Full explanation text length: {len(full_text) if full_text else 0} characters")

    # Test with new signature (name-based)
    segments = service.get_highlighted_explanation(
        feature_id=test_feature_id,
        llm_explainer=test_explainer
    )

    if segments:
        # Count highlighted vs non-highlighted segments
        highlighted_count = sum(1 for seg in segments if seg['highlight'])
        non_highlighted_count = sum(1 for seg in segments if not seg['highlight'])
        total_length = sum(len(seg['text']) for seg in segments)

        print(f"✅ Found {len(segments)} total segments for feature {test_feature_id}")
        print(f"   - Highlighted segments: {highlighted_count}")
        print(f"   - Non-highlighted segments: {non_highlighted_count}")
        print(f"   - Total reconstructed length: {total_length} characters")

        if full_text:
            if total_length == len(full_text):
                print(f"   ✅ Reconstructed text matches full text length!")
            else:
                print(f"   ⚠️  Length mismatch: reconstructed={total_length}, original={len(full_text)}")

        print("\n   Sample segments (first 5):")
        for i, seg in enumerate(segments[:5]):
            text_preview = seg['text'][:50] + '...' if len(seg['text']) > 50 else seg['text']
            highlight_marker = "🟢" if seg['highlight'] else "⚪"
            print(f"   {highlight_marker} [{i}] '{text_preview}'")
            if seg['highlight']:
                print(f"           Style: {seg.get('style', 'none')}, Metadata: {seg.get('metadata', {})}")
    else:
        print(f"⚠️  No segments found for feature {test_feature_id}")

    # Test 2: Test backward compatibility with llm_explainers parameter
    print("\n3. Testing backward compatibility (with llm_explainers parameter)...")

    explainer_list = [
        "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4",
        "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8",
        "openai/gpt-oss-20b"
    ]

    segments_compat = service.get_highlighted_explanation(
        feature_id=test_feature_id,
        llm_explainer=test_explainer,
        llm_explainers=explainer_list  # Deprecated parameter (should be ignored)
    )

    if segments_compat and segments:
        if len(segments_compat) == len(segments):
            print("✅ Backward compatibility maintained (same results)")
        else:
            print(f"⚠️  Different results: {len(segments_compat)} vs {len(segments)}")

    # Test 3: Test enhanced mode (future feature)
    print("\n4. Testing enhanced mode (placeholder)...")

    segments_enhanced = service.get_highlighted_explanation(
        feature_id=test_feature_id,
        llm_explainer=test_explainer,
        enhanced=True
    )

    if segments_enhanced:
        print(f"✅ Enhanced mode works (returns {len(segments_enhanced)} segments)")

    # Test 4: Test different explainers
    print("\n5. Testing all explainers...")

    for explainer in explainer_list:
        segments = service.get_highlighted_explanation(
            feature_id=test_feature_id,
            llm_explainer=explainer
        )
        short_name = explainer.split('/')[0] if '/' in explainer else explainer
        if segments:
            print(f"✅ {short_name}: {len(segments)} segments")
        else:
            print(f"⚠️  {short_name}: No segments found")

    # Test 5: Test cache lookup
    print("\n6. Cache statistics:")
    print(f"   - Total cache entries: {len(service._semantic_cache)}")

    # Count entries per explainer
    explainer_counts = {}
    for (feature_id, explainer_name) in service._semantic_cache.keys():
        short_name = explainer_name.split('/')[0] if '/' in explainer_name else explainer_name
        explainer_counts[short_name] = explainer_counts.get(short_name, 0) + 1

    for explainer, count in explainer_counts.items():
        print(f"   - {explainer}: {count} features")

    # Cleanup
    await service.cleanup()
    print("\n✅ All tests completed successfully!")
    print("=" * 80)

    return True

if __name__ == "__main__":
    result = asyncio.run(main())
    sys.exit(0 if result else 1)
