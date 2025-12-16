"""Reviewer Agent for maintaining codebook consistency.

Following paper Appendix B prompt structure exactly, adapted for SAE domain.

CRITICAL paper behavior (from Appendix B):
- "If the previous codes are all different or there are no similar codes,
   leave the merge_codes empty in the output"
- merge_codes empty [] → add as new code
- merge_codes non-empty ["existing code"] → merge with existing code(s)

Note: merge_codes contains CODE NAMES (strings), not IDs.
"""

from typing import Dict
from autogen import ConversableAgent


# Paper prompt (Appendix B), structured for clarity with one-shot example
REVIEWER_SYSTEM_PROMPT = """You are a reviewer in thematic analysis of neuron explanations.

TASK: Compare new codes against existing codebook codes and decide to merge or add as new.

RULES:
- If new code overlaps with existing code → merge (include existing code name in merge_codes)
- If new code is a specific instance of broader existing code → merge
- If no similar codes exist → leave merge_codes empty
- When merging, use a code name that accurately covers merged concepts

EXAMPLE:
New code: "playoff terminology"
Existing codes: ["sports terminology", "time expressions"]
Decision: merge_codes: ["sports terminology"]

OUTPUT FORMAT:
{
  "codes": [
    {
      "code": "<code name>",
      "merge_codes": ["<existing code name>"] or [],
      "quotes": [{"quote": "<text>", "quote_id": "<id>"}]
    }
  ]
}"""


def create_reviewer_agent(llm_config: Dict) -> ConversableAgent:
    """Create a reviewer agent following paper Appendix B exactly.

    The reviewer is responsible for maintaining codebook consistency by
    comparing new codes with existing entries and deciding whether to
    merge or create new entries.

    Args:
        llm_config: LLM configuration dict with model, temperature, top_p

    Returns:
        AutoGen ConversableAgent configured for reviewing
    """
    # Build AutoGen llm_config (following paper Section 4)
    # CRITICAL: response_format MUST be set for JSON mode
    autogen_llm_config = {
        "config_list": [{
            "model": llm_config.get("model", "gpt-4o-mini"),
            "api_key": llm_config.get("api_key"),
            "temperature": llm_config.get("temperature", 1.0),
            "top_p": llm_config.get("top_p", 1.0),
            "max_completion_tokens": 1024,
            "response_format": {"type": "json_object"},  # JSON mode per paper
        }],
        "cache_seed": None,
    }

    return ConversableAgent(
        name="reviewer",
        system_message=REVIEWER_SYSTEM_PROMPT,
        llm_config=autogen_llm_config,
        human_input_mode="NEVER",  # Fully automated per paper
    )
