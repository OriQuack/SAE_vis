"""Coder Agent for generating semantic codes from explanations.

Following paper Appendix B prompt structure exactly, adapted for SAE domain.
"""

from typing import Dict, Optional
from autogen import ConversableAgent


# Paper prompt (Appendix B), generic version
# Note: "analytical interests" (plural) per paper exact wording
CODER_SYSTEM_PROMPT = """You are a coder in thematic analysis of SAE (Sparse Autoencoder) feature explanations. When given a feature explanation, write 1-3 codes for the explanation. The code should capture concepts or ideas with the most analytical interests. For each code, extract a quote from the explanation corresponding to the code. The quote needs to be an extract from a sentence. Output the codes and quotes in the following format:

{
  "data_id": "<data_id>",
  "codes": [
    {
      "code": "<short phrase code>",
      "quote": "<exact extract from the text>",
      "quote_id": "<data_id>"
    }
  ]
}"""


# SAE-specific coder prompt - structured for clarity with category classification
SAE_CODER_SYSTEM_PROMPT = """You are a coder in thematic analysis of neuron explanations.

TASK: Generate 1-3 codes for each explanation. Each code must be classified into ONE category:
- LINGUISTIC: Describes token pattern, part-of-speech, morphology, syntax, punctuation
  Examples: "prepositions", "tokens starting with 'Hor'", "verb phrases", "punctuation marks"
- CONTEXTUAL: Describes semantic meaning, domain, usage context, topic
  Examples: "formal writing context", "sports terminology", "programming domain"

IMPORTANT RULES:
- Generate SEPARATE codes for linguistic and contextual aspects
- Do NOT combine both aspects in one code
- Each code should be 1-6 words, noun phrase style
- Quote must be a phrase or clause (3+ words), not a single word
- Focus on meaningful patterns, not superficial characters

EXAMPLE:
Input: "Prepositions and conjunctions, often used in formal writing contexts"
Output:
{
  "data_id": "f7_llama",
  "codes": [
    {"code": "prepositions and conjunctions", "category": "linguistic", "quote": "Prepositions and conjunctions", "quote_id": "f7_llama"},
    {"code": "formal writing context", "category": "contextual", "quote": "often used in formal writing contexts", "quote_id": "f7_llama"}
  ]
}

OUTPUT FORMAT:
{
  "data_id": "<data_id>",
  "codes": [
    {"code": "<1-6 word noun phrase>", "category": "linguistic|contextual", "quote": "<extract>", "quote_id": "<data_id>"}
  ]
}"""


# Identity prompt template (following paper Section 3.2 exactly)
# Paper: "agents are instructed to interpret the data through the lens of their assigned
# identities, reflecting on how someone with such a background might perceive and analyse"
IDENTITY_PROMPT_TEMPLATE = """You are a coder in thematic analysis of SAE (Sparse Autoencoder) feature explanations.

[IDENTITY PERSPECTIVE]
{identity_description}

When analyzing the data, reflect on how someone with your background and perspective would interpret the information. Consider what aspects would be most meaningful or significant from your viewpoint.

When given a feature explanation, write 1-3 codes for the explanation. The code should capture concepts or ideas with the most analytical interests from your perspective. For each code, extract a quote from the explanation corresponding to the code. The quote needs to be an extract from a sentence. Output the codes and quotes in the following format:

{{
  "data_id": "<data_id>",
  "codes": [
    {{
      "code": "<short phrase code>",
      "quote": "<exact extract from the text>",
      "quote_id": "<data_id>"
    }}
  ]
}}"""


# Predefined identities for SAE feature analysis (adapted from paper's climate change perspectives)
CODER_IDENTITIES = {
    "linguist": {
        "name": "Linguistic Analyst",
        "description": "a computational linguist who focuses on grammatical structures, syntax patterns, morphological features, and linguistic phenomena in text"
    },
    "semanticist": {
        "name": "Semantic Analyst",
        "description": "a semantic analyst who focuses on meaning, conceptual relationships, word sense disambiguation, and how context shapes interpretation"
    },
    "pragmatist": {
        "name": "Pragmatic Analyst",
        "description": "a pragmatic analyst who focuses on language use in context, discourse functions, speaker intent, and communicative purposes"
    },
    "domain_expert": {
        "name": "Domain Expert",
        "description": "a domain expert who focuses on specialized terminology, technical vocabulary, field-specific patterns, and expert knowledge markers"
    },
    "cognitive": {
        "name": "Cognitive Analyst",
        "description": "a cognitive scientist who focuses on how language reflects mental processes, attention patterns, reasoning structures, and cognitive load"
    }
}


def create_coder_agent(
    llm_config: Dict,
    coder_id: str = "default",
    identity: Optional[str] = None,
    custom_identity: Optional[Dict[str, str]] = None
) -> ConversableAgent:
    """Create a coder agent following paper Appendix B exactly.

    Args:
        llm_config: LLM configuration dict with model, temperature, top_p
        coder_id: Unique identifier for this coder
        identity: Predefined identity key (e.g., "linguist", "semanticist")
        custom_identity: Custom identity dict with 'name' and 'description'

    Returns:
        AutoGen ConversableAgent configured for coding
    """
    # Build system message with optional identity (following paper Section 3.2)
    if custom_identity:
        system_message = IDENTITY_PROMPT_TEMPLATE.format(
            identity_description=custom_identity.get("description", "an analyst")
        )
    elif identity == "sae":
        # SAE-specific coder with domain guidance
        system_message = SAE_CODER_SYSTEM_PROMPT
    elif identity and identity in CODER_IDENTITIES:
        system_message = IDENTITY_PROMPT_TEMPLATE.format(
            identity_description=CODER_IDENTITIES[identity]["description"]
        )
    else:
        system_message = CODER_SYSTEM_PROMPT

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
        "cache_seed": None,  # Disable caching for diverse outputs
    }

    return ConversableAgent(
        name=f"coder_{coder_id}",
        system_message=system_message,
        llm_config=autogen_llm_config,
        human_input_mode="NEVER",  # Fully automated per paper
        max_consecutive_auto_reply=0,  # Disable limit - using single-shot generate_reply()
    )


def get_identity_info(identity: str) -> Optional[Dict[str, str]]:
    """Get information about a predefined identity."""
    if identity in CODER_IDENTITIES:
        return CODER_IDENTITIES[identity]
    return None
