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


# Paper prompt (Appendix B), adapted for neuron explanations
REVIEWER_SYSTEM_PROMPT = """You are a review coder in the thematic analysis of neuron explanations. Your job is to review new codes against existing codes in the codebook, merge similar codes, and give them more representative names. You will be given two items: (1) new codes and quotes, (2) similar existing codes from the codebook.

If a new code has the same or very similar meaning as an existing code, merge them by including the existing code name in merge_codes. When merging, you may refine the code name to be more representative. If no existing codes have similar meaning, leave merge_codes empty.

Output in JSON format:
{
  "codes": [
    {
      "code": "<code name (refined if merging, original if new)>",
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
