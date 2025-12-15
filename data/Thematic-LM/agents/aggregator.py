"""Aggregator Agent for merging codes from multiple coders."""

import json
import logging
from dataclasses import dataclass
from typing import List, Dict, Any

from providers.base import LLMProvider

logger = logging.getLogger(__name__)


@dataclass
class AggregatedCode:
    """A code after aggregation from multiple coders."""

    code_text: str
    quotes: List[Dict[str, Any]]  # List of {quote, quote_id, coder_id}
    original_codes: List[str]  # Original code texts before merging
    confidence: float = 1.0


# Paper-style aggregator prompt (following Thematic-LM paper exactly)
AGGREGATOR_SYSTEM_PROMPT = """You are an aggregator coder in the thematic analysis of SAE (Sparse Autoencoder) feature explanations.

Your job is to take the codes and corresponding quotes from other coders, merge the similar codes and retain the different ones. Store the quotes under the merged codes, and keep the top {K} most relevant quotes. Quote_id is the same as data_id.

Output the codes and quotes in JSON format. Don't output anything else.

Output format:
{
  "aggregated_codes": [
    {
      "code": "temporal expressions",
      "merged_from": ["temporal expressions", "time-related words"],
      "quotes": [
        {"quote": "words related to time", "quote_id": "f123_llama", "coder_id": "coder_1"}
      ]
    }
  ]
}"""


class AggregatorAgent:
    """Agent for aggregating codes from multiple coder agents.

    The Aggregator Agent takes outputs from multiple coders, merges codes
    with similar meanings while retaining differences, and organizes the
    results for the reviewer agent.
    """

    def __init__(
        self,
        llm: LLMProvider,
        max_quotes_per_code: int = 5
    ):
        """Initialize the Aggregator Agent.

        Args:
            llm: LLM provider for aggregation decisions
            max_quotes_per_code: Maximum quotes to keep per code
        """
        self.llm = llm
        self.max_quotes_per_code = max_quotes_per_code

    def aggregate(
        self,
        codes_from_coders: List[Dict[str, Any]]
    ) -> List[AggregatedCode]:
        """Aggregate codes from multiple coders.

        Args:
            codes_from_coders: List of dicts with 'coder_id' and 'codes' keys
                Each code has: code_text, quote, quote_id

        Returns:
            List of AggregatedCode objects
        """
        # If only one coder or no codes, return directly
        total_codes = sum(len(c.get("codes", [])) for c in codes_from_coders)
        if total_codes == 0:
            return []

        if len(codes_from_coders) == 1:
            # Single coder - no aggregation needed
            coder_data = codes_from_coders[0]
            return [
                AggregatedCode(
                    code_text=code["code"],
                    quotes=[{
                        "quote": code["quote"],
                        "quote_id": code.get("quote_id", ""),
                        "coder_id": coder_data["coder_id"]
                    }],
                    original_codes=[code["code"]]
                )
                for code in coder_data.get("codes", [])
            ]

        # Multiple coders - use LLM to aggregate
        prompt = self._build_prompt(codes_from_coders)
        system_prompt = AGGREGATOR_SYSTEM_PROMPT.replace("{K}", str(self.max_quotes_per_code))

        try:
            response = self.llm.generate_json(prompt, system=system_prompt)
            return self._parse_response(response, codes_from_coders)
        except Exception as e:
            logger.warning(f"Aggregator LLM failed: {e}")
            return self._fallback_aggregate(codes_from_coders)

    def _build_prompt(self, codes_from_coders: List[Dict[str, Any]]) -> str:
        """Build prompt for aggregation."""
        input_data = {"codes_from_coders": codes_from_coders}
        return f"Aggregate these codes from multiple coders:\n\n{json.dumps(input_data, indent=2)}"

    def _parse_response(
        self,
        response: str,
        codes_from_coders: List[Dict[str, Any]]
    ) -> List[AggregatedCode]:
        """Parse LLM response into AggregatedCode objects."""
        try:
            data = json.loads(response)
            aggregated = []

            for item in data.get("aggregated_codes", []):
                code_text = item.get("code", "").strip().lower()
                if not code_text:
                    continue

                quotes = item.get("quotes", [])[:self.max_quotes_per_code]
                merged_from = item.get("merged_from", [code_text])

                aggregated.append(AggregatedCode(
                    code_text=code_text,
                    quotes=quotes,
                    original_codes=merged_from
                ))

            return aggregated

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse aggregator response: {e}")
            return self._fallback_aggregate(codes_from_coders)

    def _fallback_aggregate(
        self,
        codes_from_coders: List[Dict[str, Any]]
    ) -> List[AggregatedCode]:
        """Simple fallback aggregation without LLM."""
        # Collect all codes
        all_codes = []
        for coder_data in codes_from_coders:
            coder_id = coder_data["coder_id"]
            for code in coder_data.get("codes", []):
                all_codes.append(AggregatedCode(
                    code_text=code["code"].lower(),
                    quotes=[{
                        "quote": code["quote"],
                        "quote_id": code.get("quote_id", ""),
                        "coder_id": coder_id
                    }],
                    original_codes=[code["code"]]
                ))

        # Simple deduplication by exact match
        seen = {}
        for code in all_codes:
            if code.code_text in seen:
                seen[code.code_text].quotes.extend(code.quotes)
                seen[code.code_text].original_codes.extend(code.original_codes)
            else:
                seen[code.code_text] = code

        return list(seen.values())
