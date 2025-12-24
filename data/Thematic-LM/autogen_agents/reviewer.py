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


# Paper prompt (Appendix B), structured for clarity with examples
REVIEWER_SYSTEM_PROMPT = """You are a reviewer in thematic analysis of neuron explanations.

TASK: Compare new codes against existing codebook codes and decide to merge or add as new.

WHEN TO MERGE (set merge_codes to existing code name):
- New code describes the same underlying concept as an existing code
  Example: "define token" and "definition verbs" → same concept (definitions)
- New code uses different wording but captures the same pattern type
  Example: "Hor-initial tokens" and "'Hor' prefix" → same pattern
- When merging, use a code name that accurately covers the merged concepts
- CRITICAL: Only merge codes within the SAME category (linguistic ↔ linguistic, contextual ↔ contextual) 

WHEN TO ADD AS NEW (leave merge_codes empty):
- New code describes a genuinely different concept not covered by existing codes
- No existing code captures the same underlying pattern or topic

EXAMPLE:
Input:
  New code: "playoff terminology"
  Existing codes: ["game outcome terms", "mathematical symbols"]
Output:
{
  "codes": [
    {
      "code": "sports competition terminology",
      "merge_codes": ["game outcome terms"],
      "quotes": [{"quote": "playoffs and finals", "quote_id": "f3_gpt"}]
    }
  ]
}

OUTPUT FORMAT:
{
  "codes": [
    {
      "code": "<representative code name>",
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
        max_consecutive_auto_reply=0,  # Disable limit - using single-shot generate_reply()
    )
