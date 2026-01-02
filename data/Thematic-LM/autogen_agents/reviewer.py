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

PURPOSE: Maintain codebook consistency by merging duplicate concepts and adding genuinely new ones.

TASK: Compare the new code against existing codebook codes. Decide: merge or add as new.

WHEN TO ADD AS NEW (leave merge_codes empty):
- Genuinely novel concepts not covered by existing codes
- Distinct concepts, even if related

WHEN TO MERGE (set merge_codes to existing code names):
- Truly redundant: same concept expressed differently
- When merging, use a code name that accurately covers the merged concepts

EXAMPLE:
Input:
  New code: "punctuation marks"
  Existing codes: ["punctuation", "sports terminology"]
Output:
{
  "codes": [
    {
      "code": "punctuation",
      "merge_codes": ["punctuation"],
      "quotes": [{"quote": "commas and periods", "quote_id": "f3_gpt"}]
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
            "max_completion_tokens": llm_config.get("max_tokens", 2048),
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
