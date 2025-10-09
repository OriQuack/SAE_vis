"""
LLM Comparison API Endpoint

Serves pre-calculated LLM consistency statistics for visualization.
"""

import json
from pathlib import Path
from typing import Dict, Any
from fastapi import APIRouter, HTTPException

from app.models.requests import LLMComparisonRequest
from app.models.responses import LLMComparisonResponse

router = APIRouter()

# Cache for LLM comparison stats (loaded once at startup)
_llm_comparison_stats: Dict[str, Any] | None = None


def load_llm_comparison_stats() -> Dict[str, Any]:
    """Load pre-calculated LLM comparison statistics from file."""
    global _llm_comparison_stats

    if _llm_comparison_stats is not None:
        return _llm_comparison_stats

    # Find project root
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent

    if project_root.name != "interface":
        raise FileNotFoundError("Could not find project root 'interface' directory")

    # Load stats file
    stats_file = project_root / "data" / "llm_comparison" / "llm_comparison_stats.json"

    if not stats_file.exists():
        raise FileNotFoundError(f"LLM comparison stats not found: {stats_file}")

    with open(stats_file, 'r') as f:
        _llm_comparison_stats = json.load(f)

    return _llm_comparison_stats


@router.post("/llm-comparison", response_model=LLMComparisonResponse)
async def get_llm_comparison(request: LLMComparisonRequest) -> LLMComparisonResponse:
    """
    Get LLM comparison consistency statistics.

    Returns pre-calculated consistency scores for:
    - Explainer consistency (cosine similarity between explanation embeddings)
    - Scorer consistency (RV coefficient between scoring vectors)

    Currently returns global statistics (filters not applied).
    """
    try:
        # Load pre-calculated statistics
        stats = load_llm_comparison_stats()

        # Extract data
        explainer_consistency = stats.get("explainer_consistency", {})
        scorer_consistency = stats.get("scorer_consistency", {})

        # Map explainer consistency to frontend format
        # Frontend expects: 'left-1', 'left-3', 'left-4'
        # We have: 'llama_vs_gwen', 'llama_vs_openai', 'gwen_vs_openai'
        explainer_consistencies = {
            "left-1": {
                "value": explainer_consistency.get("llama_vs_gwen", 0.0),
                "method": "cosine_similarity"
            },
            "left-3": {
                "value": explainer_consistency.get("llama_vs_openai", 0.0),
                "method": "cosine_similarity"
            },
            "left-4": {
                "value": explainer_consistency.get("gwen_vs_openai", 0.0),
                "method": "cosine_similarity"
            }
        }

        # Map scorer consistency to frontend format
        # Frontend expects: 'top-right-1', 'top-right-3', etc.
        # Mapping:
        #   top-right = explainer 1 (llama)
        #   middle-right = explainer 2 (gwen)
        #   bottom-right = explainer 3 (openai)
        # Cell indices: 1, 3, 4 are diamonds (scorer comparisons)
        scorer_consistencies = {}

        # Top right triangle (llama explainer)
        llama_scores = scorer_consistency.get("llama", {})
        scorer_consistencies["top-right-1"] = {
            "value": llama_scores.get("gwen_vs_openai", 0.0),
            "method": "rv_coefficient"
        }
        scorer_consistencies["top-right-3"] = {
            "value": llama_scores.get("llama_vs_gwen", 0.0),
            "method": "rv_coefficient"
        }
        scorer_consistencies["top-right-4"] = {
            "value": llama_scores.get("llama_vs_openai", 0.0),
            "method": "rv_coefficient"
        }

        # Middle right triangle (gwen explainer)
        gwen_scores = scorer_consistency.get("gwen", {})
        scorer_consistencies["middle-right-1"] = {
            "value": gwen_scores.get("gwen_vs_openai", 0.0),
            "method": "rv_coefficient"
        }
        scorer_consistencies["middle-right-3"] = {
            "value": gwen_scores.get("llama_vs_gwen", 0.0),
            "method": "rv_coefficient"
        }
        scorer_consistencies["middle-right-4"] = {
            "value": gwen_scores.get("llama_vs_openai", 0.0),
            "method": "rv_coefficient"
        }

        # Bottom right triangle (openai explainer)
        openai_scores = scorer_consistency.get("openai", {})
        scorer_consistencies["bottom-right-1"] = {
            "value": openai_scores.get("gwen_vs_openai", 0.0),
            "method": "rv_coefficient"
        }
        scorer_consistencies["bottom-right-3"] = {
            "value": openai_scores.get("llama_vs_gwen", 0.0),
            "method": "rv_coefficient"
        }
        scorer_consistencies["bottom-right-4"] = {
            "value": openai_scores.get("llama_vs_openai", 0.0),
            "method": "rv_coefficient"
        }

        # Define explainer and scorer models with actual filter values
        explainers = [
            {"id": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4", "name": "Llama"},
            {"id": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8", "name": "Qwen"},
            {"id": "openai/gpt-oss-20b", "name": "OpenAI"}
        ]

        # Scorer models for each explainer
        scorers_for_explainer1 = [
            {"id": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4", "name": "Llama", "explainerSource": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"},
            {"id": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8", "name": "Qwen", "explainerSource": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"},
            {"id": "openai/gpt-oss-20b", "name": "OpenAI", "explainerSource": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"}
        ]

        scorers_for_explainer2 = [
            {"id": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4", "name": "Llama", "explainerSource": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8"},
            {"id": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8", "name": "Qwen", "explainerSource": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8"},
            {"id": "openai/gpt-oss-20b", "name": "OpenAI", "explainerSource": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8"}
        ]

        scorers_for_explainer3 = [
            {"id": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4", "name": "Llama", "explainerSource": "openai/gpt-oss-20b"},
            {"id": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8", "name": "Qwen", "explainerSource": "openai/gpt-oss-20b"},
            {"id": "openai/gpt-oss-20b", "name": "OpenAI", "explainerSource": "openai/gpt-oss-20b"}
        ]

        return LLMComparisonResponse(
            explainers=explainers,
            scorersForExplainer1=scorers_for_explainer1,
            scorersForExplainer2=scorers_for_explainer2,
            scorersForExplainer3=scorers_for_explainer3,
            explainerConsistencies=explainer_consistencies,
            scorerConsistencies=scorer_consistencies
        )

    except FileNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"LLM comparison statistics not found: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading LLM comparison data: {str(e)}"
        )
