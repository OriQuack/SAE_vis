"""Aggregator Agent for merging codes from multiple coders.

Following paper Appendix B prompt structure exactly, adapted for SAE domain.
"""

from typing import Dict
from autogen import ConversableAgent


# Paper prompt (Appendix B), adapted for neuron explanations with category-aware merging
AGGREGATOR_SYSTEM_PROMPT_TEMPLATE = """You are an aggregator in thematic analysis of neuron explanations.

TASK: Take codes from the coder, merge similar codes, and retain different ones.
- Preserve the category label from each code
- Only merge codes within the SAME category
- Keep the top {max_quotes} most relevant quotes

MERGE RULES:
- Merge codes with similar meaning AND same category
- Do NOT merge codes from different categories (linguistic vs contextual)
- When merging, keep the more descriptive code name

EXAMPLE:
Input: [
  {{"code": "prepositions", "category": "linguistic", "quote": "...", "quote_id": "f1"}},
  {{"code": "prepositions and conjunctions", "category": "linguistic", "quote": "...", "quote_id": "f2"}},
  {{"code": "formal writing", "category": "contextual", "quote": "...", "quote_id": "f1"}}
]
Output:
{{
  "codes": [
    {{"code": "prepositions and conjunctions", "category": "linguistic", "quotes": [{{"quote": "...", "quote_id": "f1"}}, {{"quote": "...", "quote_id": "f2"}}]}},
    {{"code": "formal writing", "category": "contextual", "quotes": [{{"quote": "...", "quote_id": "f1"}}]}}
  ]
}}

OUTPUT FORMAT:
{{
  "codes": [
    {{
      "code": "<merged or retained code>",
      "category": "linguistic|contextual",
      "quotes": [{{"quote": "<text>", "quote_id": "<id>"}}]
    }}
  ]
}}"""


def create_aggregator_agent(
    llm_config: Dict,
    max_quotes_per_code: int = 20
) -> ConversableAgent:
    """Create an aggregator agent following paper Appendix B exactly.

    Args:
        llm_config: LLM configuration dict with model, temperature, top_p
        max_quotes_per_code: Maximum quotes to keep per code (paper: 20)

    Returns:
        AutoGen ConversableAgent configured for aggregation
    """
    system_message = AGGREGATOR_SYSTEM_PROMPT_TEMPLATE.format(
        max_quotes=max_quotes_per_code
    )

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
        name="code_aggregator",  # Per plan line 438
        system_message=system_message,
        llm_config=autogen_llm_config,
        human_input_mode="NEVER",  # Fully automated per paper
    )
