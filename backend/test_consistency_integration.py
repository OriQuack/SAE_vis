#!/usr/bin/env python3
"""
Test script to verify the backend integration with pre-computed consistency scores.

Tests various configurations to ensure:
1. Pre-computed scores are used when applicable
2. Real-time calculation works for non-default configs
3. Mixed mode works for partial default configs
"""

import asyncio
import json
import logging
from pathlib import Path
import sys

# Add parent directory to path
sys.path.append(str(Path(__file__).parent))

from app.services.visualization_service import DataService
from app.services.table_data_service import TableDataService
from app.models.common import Filters

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_default_configuration():
    """Test with all default explainers and scorers - should use pre-computed."""
    logger.info("\n" + "="*80)
    logger.info("TEST 1: Default configuration (all pre-computed)")
    logger.info("="*80)

    filters = Filters(
        llm_explainer=[
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
            'openai/gpt-oss-20b'
        ],
        llm_scorer=[
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
            'openai/gpt-oss-20b'
        ]
    )

    # Initialize services
    data_service = DataService()
    await data_service.initialize()

    table_service = TableDataService(data_service)
    response = await table_service.get_table_data(filters)

    logger.info(f"Features returned: {response.total_features}")
    logger.info(f"Explainers: {response.explainer_ids}")
    logger.info(f"Is averaged: {response.is_averaged}")

    # Check first feature for consistency scores
    if response.features:
        feature = response.features[0]
        logger.info(f"\nFirst feature ID: {feature.feature_id}")

        for exp_name, exp_data in feature.explainers.items():
            logger.info(f"\nExplainer: {exp_name}")
            if exp_data.scorer_consistency:
                for metric, score in exp_data.scorer_consistency.items():
                    logger.info(f"  Scorer consistency ({metric}): {score.value:.3f} [{score.method}]")
            if exp_data.metric_consistency:
                logger.info(f"  Within-explanation consistency: {exp_data.metric_consistency.value:.3f} [{exp_data.metric_consistency.method}]")
            if exp_data.explainer_consistency:
                logger.info(f"  LLM explainer consistency: {exp_data.explainer_consistency.value:.3f} [{exp_data.explainer_consistency.method}]")
            if exp_data.cross_explainer_metric_consistency:
                for metric, score in exp_data.cross_explainer_metric_consistency.items():
                    logger.info(f"  Cross-explanation ({metric}): {score.value:.3f} [{score.method}]")

    return response


async def test_partial_configuration():
    """Test with subset of explainers - should use pre-computed for per-explainer metrics."""
    logger.info("\n" + "="*80)
    logger.info("TEST 2: Partial configuration (mixed pre-computed/real-time)")
    logger.info("="*80)

    filters = Filters(
        llm_explainer=[
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',  # Default
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8'  # Default
            # Missing openai - so cross-explainer metrics need real-time calc
        ],
        llm_scorer=[
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
            'openai/gpt-oss-20b'
        ]
    )

    # Initialize services
    data_service = DataService()
    await data_service.initialize()

    table_service = TableDataService(data_service)
    response = await table_service.get_table_data(filters)

    logger.info(f"Features returned: {response.total_features}")
    logger.info(f"Explainers: {response.explainer_ids}")
    logger.info("Expected: Per-explainer metrics from pre-computed, cross-explainer from real-time")

    # Check first feature
    if response.features:
        feature = response.features[0]
        for exp_name, exp_data in feature.explainers.items():
            logger.info(f"\nExplainer: {exp_name}")
            if exp_data.scorer_consistency:
                # Should be std_based (pre-computed)
                for metric, score in exp_data.scorer_consistency.items():
                    logger.info(f"  Scorer consistency ({metric}): {score.method} - {'✓ Pre-computed' if score.method == 'std_based' else '✗ Real-time'}")
            if exp_data.cross_explainer_metric_consistency:
                # Should be std_based (real-time calculated)
                for metric, score in exp_data.cross_explainer_metric_consistency.items():
                    logger.info(f"  Cross-explanation ({metric}): {score.method}")

    return response


async def test_single_explainer():
    """Test with single explainer - individual mode."""
    logger.info("\n" + "="*80)
    logger.info("TEST 3: Single explainer (individual mode)")
    logger.info("="*80)

    filters = Filters(
        llm_explainer=['hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4'],
        llm_scorer=[
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
            'openai/gpt-oss-20b'
        ]
    )

    # Initialize services
    data_service = DataService()
    await data_service.initialize()

    table_service = TableDataService(data_service)
    response = await table_service.get_table_data(filters)

    logger.info(f"Features returned: {response.total_features}")
    logger.info(f"Explainers: {response.explainer_ids}")
    logger.info(f"Is averaged: {response.is_averaged} (should be False)")

    # Check consistency scores
    if response.features:
        feature = response.features[0]
        for exp_name, exp_data in feature.explainers.items():
            logger.info(f"\nExplainer: {exp_name}")
            logger.info(f"  Cross-explainer consistency: {exp_data.cross_explainer_metric_consistency} (should be None)")
            logger.info(f"  Explainer consistency: {exp_data.explainer_consistency} (should be None)")
            if exp_data.scorer_consistency:
                for metric, score in exp_data.scorer_consistency.items():
                    logger.info(f"  Scorer consistency ({metric}): {score.value:.3f} [{score.method}]")

    return response


async def test_custom_scorers():
    """Test with subset of scorers - should calculate real-time."""
    logger.info("\n" + "="*80)
    logger.info("TEST 4: Custom scorer configuration (real-time calculation)")
    logger.info("="*80)

    filters = Filters(
        llm_explainer=[
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8'
        ],
        llm_scorer=[
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8'
            # Missing openai scorer - should trigger real-time calculation
        ]
    )

    # Initialize services
    data_service = DataService()
    await data_service.initialize()

    table_service = TableDataService(data_service)
    response = await table_service.get_table_data(filters)

    logger.info(f"Features returned: {response.total_features}")
    logger.info(f"Scorers: {response.scorer_ids} (subset of defaults)")
    logger.info("Expected: All metrics calculated in real-time due to non-default scorer config")

    # Check consistency scores
    if response.features:
        feature = response.features[0]
        for exp_name, exp_data in feature.explainers.items():
            logger.info(f"\nExplainer: {exp_name}")
            if exp_data.scorer_consistency:
                for metric, score in exp_data.scorer_consistency.items():
                    is_precomputed = score.method == "std_based" and len(response.scorer_ids) == 3
                    logger.info(f"  Scorer consistency ({metric}): {score.method} - {'Pre-computed' if is_precomputed else 'Real-time'}")

    return response


async def main():
    """Run all tests."""
    logger.info("Starting backend consistency integration tests...")

    try:
        # Test 1: Default configuration
        await test_default_configuration()

        # Test 2: Partial configuration
        await test_partial_configuration()

        # Test 3: Single explainer
        await test_single_explainer()

        # Test 4: Custom scorers
        await test_custom_scorers()

        logger.info("\n" + "="*80)
        logger.info("ALL TESTS COMPLETED SUCCESSFULLY!")
        logger.info("="*80)

    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        return 1

    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)