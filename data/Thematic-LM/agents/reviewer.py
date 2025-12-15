"""Reviewer Agent for maintaining codebook consistency."""

import json
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional

from providers.base import LLMProvider
from codebook_manager import CodebookEntry

logger = logging.getLogger(__name__)


@dataclass
class ReviewDecision:
    """Decision from the Reviewer Agent."""

    updated_code: str  # The final code text to use
    merge_codes: List[int] = field(default_factory=list)  # IDs of codes to merge (paper terminology)
    rationale: str = ""


# Paper-style reviewer prompt (following Thematic-LM paper exactly)
REVIEWER_SYSTEM_PROMPT = """You are a review coder in the thematic analysis of SAE (Sparse Autoencoder) feature explanations.

Your job is to review the previously coded data with new codes, merge similar codes, and give them more representative codes. You will be given two items. The first contains new codes and quotes; the second contains similar codes and corresponding quotes to each new code.

Decide if there are previously similar coded data with the same meaning that can be merged with the new codes. Update the new code according to the previous code if needed. If the previous codes are all different or there are no similar codes, leave the merge_codes empty in the output.

Output the updated codes and quotes in JSON format:
{
  "updated_code": "the final code text to use",
  "merge_codes": [1, 5],
  "rationale": "brief explanation"
}

Guidelines:
- merge_codes: List of code IDs from the existing codebook to merge with (empty if no merge)
- updated_code: The most representative code text (may be the new code or an existing one)
- If merge_codes is empty, the code will be added as a new entry

Always output valid JSON."""


class ReviewerAgent:
    """Agent for reviewing and maintaining codebook consistency.

    The Reviewer Agent operates exclusively during the coding stage, maintaining
    and updating the codebook. It processes new codes from the aggregator,
    retrieves similar codes from the codebook by computing cosine similarity,
    and decides whether to merge or create new entries.

    Following the Thematic-LM paper, the reviewer ensures codes remain dynamic,
    interpretative, and responsive to the data.
    """

    def __init__(self, llm: LLMProvider):
        """Initialize the Reviewer Agent.

        Args:
            llm: LLM provider for generating decisions
        """
        self.llm = llm

    def review(
        self,
        new_code: str,
        new_quotes: List[Dict[str, Any]],
        similar_codes: List[Tuple[CodebookEntry, float]]
    ) -> ReviewDecision:
        """Review a new code against similar existing codes in the codebook.

        Args:
            new_code: The proposed new code text
            new_quotes: List of quotes supporting the new code
            similar_codes: List of (CodebookEntry, similarity_score) tuples from codebook

        Returns:
            ReviewDecision with the decision and updated code
        """
        if not similar_codes:
            return ReviewDecision(
                updated_code=new_code,
                merge_codes=[],
                rationale="No similar existing codes found in codebook"
            )

        prompt = self._build_prompt(new_code, new_quotes, similar_codes)

        try:
            response = self.llm.generate_json(prompt, system=REVIEWER_SYSTEM_PROMPT)
            return self._parse_response(response, new_code, similar_codes)
        except Exception as e:
            logger.warning(f"Reviewer LLM failed: {e}")
            return ReviewDecision(
                updated_code=new_code,
                merge_codes=[],
                rationale=f"Review failed: {e}"
            )

    def _build_prompt(
        self,
        new_code: str,
        new_quotes: List[Dict[str, Any]],
        similar_codes: List[Tuple[CodebookEntry, float]]
    ) -> str:
        """Build the prompt for the reviewer."""
        # Format new code and quotes
        quotes_str = "\n".join([
            f"  - \"{q.get('quote', '')}\" (ID: {q.get('quote_id', 'N/A')})"
            for q in new_quotes[:5]
        ])

        new_code_section = f"""NEW CODE from aggregator:
Code: "{new_code}"
Supporting quotes:
{quotes_str}"""

        # Format similar codes from codebook
        similar_section = "SIMILAR CODES from existing codebook:\n"
        for entry, sim in similar_codes[:5]:
            entry_quotes = "\n".join([
                f"    - \"{q}\""
                for q in entry.example_quotes[:3]
            ])
            similar_section += f"""
- ID {entry.code_id}: "{entry.code_text}"
  Similarity: {sim:.3f}
  Frequency: {entry.frequency}
  Variants: {entry.variants[:3]}
  Example quotes:
{entry_quotes}
"""

        return f"""{new_code_section}

{similar_section}

Should this new code be merged with existing codes, kept as new, or should it update an existing code's name?"""

    def _parse_response(
        self,
        response: str,
        new_code: str,
        similar_codes: List[Tuple[CodebookEntry, float]]
    ) -> ReviewDecision:
        """Parse LLM response into ReviewDecision (following paper format)."""
        try:
            data = json.loads(response)

            updated_code = data.get("updated_code", new_code).strip().lower()
            merge_codes = data.get("merge_codes", [])
            rationale = data.get("rationale", "")

            # Validate merge_codes - only keep IDs that exist in similar_codes
            valid_ids = {entry.code_id for entry, _ in similar_codes}
            merge_codes = [id for id in merge_codes if id in valid_ids]

            return ReviewDecision(
                updated_code=updated_code,
                merge_codes=merge_codes,
                rationale=rationale
            )

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse reviewer response: {e}")
            return ReviewDecision(
                updated_code=new_code,
                merge_codes=[],
                rationale=f"Parse failed: {e}"
            )

    def review_batch(
        self,
        aggregated_codes: List[Dict[str, Any]],
        codebook_lookup_fn
    ) -> List[Tuple[Dict[str, Any], ReviewDecision]]:
        """Review a batch of aggregated codes.

        Args:
            aggregated_codes: List of codes from aggregator
            codebook_lookup_fn: Function to find similar codes (code_text) -> List[(entry, sim)]

        Returns:
            List of (aggregated_code, decision) tuples
        """
        results = []
        for agg_code in aggregated_codes:
            code_text = agg_code.get("code", "")
            quotes = agg_code.get("quotes", [])

            # Look up similar codes
            similar = codebook_lookup_fn(code_text)

            # Get review decision
            decision = self.review(code_text, quotes, similar)
            results.append((agg_code, decision))

        return results
