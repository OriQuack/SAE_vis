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


# Paper prompt (Appendix B), adapted for SAE domain
# Key instruction: "leave the merge_codes empty" = add as new code
# Output format from plan: codes array with merge_codes as CODE NAMES
REVIEWER_SYSTEM_PROMPT = """You are a review coder in the thematic analysis of SAE (Sparse Autoencoder) feature explanations. Your job is to review the previously coded data with new codes, merge similar codes, and give them more representative codes. You will be given two items. The first contains new codes and quotes; the second contains similar codes and corresponding quotes to each new code. Decide if there are previously similar coded data with the same meaning that can be merged with the new codes. Update the new code according to the previous code if needed. If the previous codes are all different or there are no similar codes, leave the merge_codes empty in the output. Output the updated codes and quotes in JSON format.

Output Format:
{
  "codes": [
    {
      "code": "<the code (updated name if refined, original if not)>",
      "merge_codes": ["<existing code name to merge with>"] or [],
      "quotes": [
        {"quote": "<quote text>", "quote_id": "<id>"}
      ]
    }
  ]
}

Rules:
- code: The code text (possibly refined to be more representative)
- merge_codes: List of existing CODE NAMES to merge with (NOT IDs). Empty [] if no merge.
- quotes: Associated quotes for this code
- If merge_codes is empty [], the code will be added as a NEW entry
- If merge_codes has names ["Financial Stress"], the code will be MERGED with those existing codes"""


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
