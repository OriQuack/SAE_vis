#!/usr/bin/env python3
"""Test script for AlignmentService"""

import asyncio
import sys
sys.path.insert(0, '.')

from app.services.alignment_service import AlignmentService

async def test():
    print("Initializing AlignmentService...")
    service = AlignmentService()
    result = await service.initialize()

    print(f"\nInitialization result: {result}")
    print(f"Is ready: {service.is_ready}")
    print(f"\nExact stats: {service.exact_stats}")
    print(f"Semantic stats: {service.semantic_stats}")
    print(f"\nMerged cache size: {len(service._merged_cache)}")

    # Test getting highlighted explanation for feature 0
    if service.is_ready:
        print("\n--- Testing feature 0 ---")
        explainers = [
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
            'openai/gpt-oss-20b'
        ]

        for i, explainer in enumerate(explainers):
            segments = service.get_highlighted_explanation(0, explainer, explainers)
            if segments:
                print(f"\nExplainer {i} ({explainer.split('/')[1]}):")
                print(f"  Segments: {len(segments)}")
                highlighted_count = sum(1 for s in segments if s.get('highlight'))
                print(f"  Highlighted segments: {highlighted_count}")
            else:
                print(f"\nExplainer {i}: No alignment data")

    await service.cleanup()
    print("\nCleanup complete")

if __name__ == "__main__":
    asyncio.run(test())
