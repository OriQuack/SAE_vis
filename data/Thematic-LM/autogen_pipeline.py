"""AutoGen-based Thematic-LM Pipeline for SAE feature explanation coding.

Implements the coding stage from:
Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for Large-scale
Thematic Analysis" (WWW '25)

Architecture (following paper Section 3.1):
    Text → [Coder₁ + Coder₂ + ...] → Aggregator → Reviewer → Codebook

Key paper-compliant behaviors:
- ALL codes go through reviewer (no threshold-based skipping)
- Reviewer merge_codes empty → add as new code
- Reviewer merge_codes non-empty (code NAMES) → merge with existing
- Top-k=10 similar codes retrieved for reviewer
"""

import json
import logging
import os
import random
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any

from autogen_agents import (
    create_coder_agent,
    create_aggregator_agent,
    create_reviewer_agent,
)
from codebook_manager import CodebookManager, CodebookEntry

logger = logging.getLogger(__name__)

# Shorten model names for LLM prompts (saves tokens)
MODEL_SHORT_NAMES = {
    "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4": "llama",
    "google/gemini-flash-2.5": "gemini",
    "openai/gpt-4o-mini": "gpt",
}


def shorten_quote_id(quote_id: str) -> str:
    """Shorten quote_id for LLM display (e.g., f0_llama instead of full model name)."""
    for full_name, short_name in MODEL_SHORT_NAMES.items():
        if full_name in quote_id:
            return quote_id.replace(full_name, short_name)
    return quote_id


@dataclass
class CodeResult:
    """Result of coding a single code entry."""
    code_id: int
    code_text: str
    category: str  # "linguistic" | "contextual" | "unknown"
    quotes: List[Dict[str, Any]]
    is_new: bool
    merged_with: List[str] = field(default_factory=list)  # Code NAMES, not IDs


@dataclass
class ExplanationResult:
    """Result of coding a single explanation."""
    feature_id: int
    llm_explainer: str
    explanation_text: str
    codes: List[CodeResult]
    coder_ids: List[str]


class ThematicLMPipeline:
    """AutoGen-based Thematic-LM pipeline following paper Section 3.1.

    Flow: Coders → Aggregator → Reviewer → Codebook

    The key difference from previous implementation is that ALL codes
    go through the reviewer. The reviewer decides merge/new based on
    semantic judgment, not threshold values.
    """

    def __init__(
        self,
        config: Dict,
        codebook: CodebookManager,
        api_key: Optional[str] = None
    ):
        """Initialize the pipeline.

        Args:
            config: Configuration dict with llm_config, processing_config, etc.
            codebook: CodebookManager instance for storing codes
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.config = config
        self.codebook = codebook

        # Get API key
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key required. Set OPENAI_API_KEY env var.")

        # LLM config with API key
        self.llm_config = {
            **config.get("llm_config", {}),
            "api_key": self.api_key
        }

        # Processing config
        self.processing_config = config.get("processing_config", {})
        self.codebook_config = config.get("codebook_config", {})

        # Create agents
        self._create_agents()

        # Statistics
        self.stats = {
            "total_processed": 0,
            "new_codes": 0,
            "merged_codes": 0,
            "reviewed_codes": 0,
        }

    def _create_agents(self):
        """Create AutoGen agents based on configuration."""
        coder_config = self.config.get("coder_config", {})
        coders_list = coder_config.get("coders", [{"id": "default"}])

        # Create coders
        self.coders = []
        for coder_cfg in coders_list:
            coder = create_coder_agent(
                llm_config=self.llm_config,
                # Note: create_coder_agent prefixes with "coder_", so just pass the id
                coder_id=coder_cfg.get("id", str(len(self.coders))),
                identity=coder_cfg.get("identity"),
                custom_identity=coder_cfg.get("custom_identity"),
            )
            self.coders.append(coder)
            logger.info(f"Created coder: {coder.name}")

        # Create aggregator
        self.aggregator = create_aggregator_agent(
            llm_config=self.llm_config,
            max_quotes_per_code=self.processing_config.get("max_quotes_per_code", 20)
        )
        logger.info("Created aggregator agent")

        # Create reviewer
        self.reviewer = create_reviewer_agent(llm_config=self.llm_config)
        logger.info("Created reviewer agent")

    def _extract_json_from_response(self, response: str) -> Optional[Dict]:
        """Extract JSON from agent response.

        AutoGen agents may include extra text around the JSON.
        This extracts the JSON object from the response.
        """
        if not response:
            return None

        # Try to parse as direct JSON first
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        json_patterns = [
            r'```json\s*([\s\S]*?)\s*```',
            r'```\s*([\s\S]*?)\s*```',
            r'\{[\s\S]*\}',
        ]

        for pattern in json_patterns:
            matches = re.findall(pattern, response)
            for match in matches:
                try:
                    return json.loads(match)
                except json.JSONDecodeError:
                    continue

        logger.warning(f"Could not extract JSON from response: {response[:200]}...")
        return None

    def _call_agent(self, agent, message: str, max_retries: int = 3) -> Optional[Dict]:
        """Call an agent and extract JSON response with retry logic.

        Uses generate_reply() for single-shot prompt-response pattern,
        which is the proper approach for the paper's sequential pipeline
        (Coders → Aggregator → Reviewer → Codebook).

        Args:
            agent: AutoGen ConversableAgent to call
            message: Message to send to the agent
            max_retries: Number of retry attempts (default: 3)

        Returns:
            Parsed JSON response or None if failed
        """
        messages = [{"role": "user", "content": message}]

        for attempt in range(max_retries):
            try:
                response = agent.generate_reply(messages=messages)

                if response:
                    content = response if isinstance(response, str) else response.get("content", "")
                    result = self._extract_json_from_response(content)
                    if result:
                        return result

                # Response was empty or invalid JSON, retry
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue

            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Agent call failed (attempt {attempt + 1}/{max_retries}): {e}")
                    time.sleep(1)
                else:
                    logger.error(f"Agent call failed after {max_retries} attempts: {e}")

        return None

    def _find_code_id_by_name(self, code_name: str) -> Optional[int]:
        """Find a code ID by its name (case-insensitive).

        Args:
            code_name: The code name to search for

        Returns:
            Code ID if found, None otherwise
        """
        code_name_lower = code_name.lower().strip()
        for code_id, entry in self.codebook.entries.items():
            if entry.code_text.lower().strip() == code_name_lower:
                return code_id
            # Also check variants
            for variant in entry.variants:
                if variant.lower().strip() == code_name_lower:
                    return code_id
        return None

    def process_explanation(
        self,
        explanation_text: str,
        quote_id: str,
        feature_id: int,
        llm_explainer: str
    ) -> ExplanationResult:
        """Process a single explanation through the full pipeline.

        Flow: Coders → Aggregator → Reviewer → Codebook

        Args:
            explanation_text: The SAE feature explanation to code
            quote_id: Identifier for the explanation (data_id)
            feature_id: Feature ID for tracking
            llm_explainer: LLM explainer name for tracking

        Returns:
            ExplanationResult with all coded information
        """
        top_k = self.codebook_config.get("top_k_retrieval", 10)
        min_similarity = self.codebook_config.get("min_similarity", 0.0)

        # Step 1: Coders generate codes independently
        coder_outputs = []
        short_id = shorten_quote_id(quote_id)
        for coder in self.coders:
            message = f"""Data ID: {short_id}
Text: {explanation_text}

Generate 1-3 codes for this SAE feature explanation. Output in JSON format."""

            response = self._call_agent(coder, message)
            if response and "codes" in response:
                coder_outputs.append({
                    "coder_id": coder.name,
                    "codes": [
                        {
                            "code": c.get("code", ""),
                            "category": c.get("category", "unknown"),  # NEW: extract category
                            "quote": c.get("quote", ""),
                            "quote_id": c.get("quote_id", quote_id),
                        }
                        for c in response.get("codes", [])
                    ]
                })
            else:
                logger.warning(f"Coder {coder.name} returned no valid codes")

        if not coder_outputs:
            logger.error(f"No codes generated for {quote_id}")
            return ExplanationResult(
                feature_id=feature_id,
                llm_explainer=llm_explainer,
                explanation_text=explanation_text,
                codes=[],
                coder_ids=[c.name for c in self.coders],
            )

        # Step 2: Aggregator merges codes from multiple coders
        # Skip aggregator if only 1 coder (no cross-coder merging needed)
        if len(self.coders) > 1:
            agg_message = f"""Aggregate these codes from coders:

{json.dumps(coder_outputs, indent=2)}

Merge similar codes, retain different ones. Output in JSON format."""

            agg_response = self._call_agent(self.aggregator, agg_message)
            if agg_response and "codes" in agg_response:
                aggregated_codes = agg_response["codes"]
            else:
                logger.warning("Aggregator failed, using fallback")
                aggregated_codes = []
                for co in coder_outputs:
                    for code in co.get("codes", []):
                        aggregated_codes.append({
                            "code": code["code"],
                            "category": code.get("category", "unknown"),  # Preserve category
                            "quotes": [{
                                "quote": code["quote"],
                                "quote_id": code["quote_id"],
                            }]
                        })
        else:
            # Single coder: skip aggregator, format directly for reviewer
            aggregated_codes = [
                {
                    "code": c["code"],
                    "category": c.get("category", "unknown"),  # NEW: preserve category
                    "quotes": [{
                        "quote": c["quote"],
                        "quote_id": c["quote_id"],
                    }]
                }
                for c in coder_outputs[0].get("codes", [])
            ]

        # Step 3: Reviewer processes EACH aggregated code against codebook
        final_codes = []
        for agg_code in aggregated_codes:
            code_text = agg_code.get("code", "")
            code_category = agg_code.get("category", "unknown")  # NEW: extract category
            quotes = agg_code.get("quotes", [])

            if not code_text:
                continue

            # Pre-check: exact code name match should auto-merge (timing fix)
            # This handles cases where identical code names aren't merged due to
            # LLM reviewer judgment based on quote content differences
            exact_match_id = self._find_code_id_by_name(code_text)
            if exact_match_id is not None:
                # Only auto-merge if categories match
                existing_category = self.codebook.entries[exact_match_id].category
                if existing_category == code_category or existing_category == "unknown" or code_category == "unknown":
                    # Auto-merge with exact name match - no reviewer needed
                    code_id = self.codebook.merge_code(
                        code_text,
                        quotes,
                        exact_match_id,
                        update_code_text=False,  # Keep existing name
                        category=code_category  # Pass category
                    )
                    self.stats["merged_codes"] += 1
                    final_codes.append(CodeResult(
                        code_id=code_id,
                        code_text=self.codebook.entries[code_id].code_text,
                        category=code_category,  # Pass category
                        quotes=quotes,
                        is_new=False,
                        merged_with=[self.codebook.entries[code_id].code_text],
                    ))
                    logger.debug(f"Auto-merged exact match: '{code_text}' → code_id {code_id}")
                    continue
                else:
                    # Same name but different category - skip auto-merge, let reviewer decide
                    logger.debug(f"Skipping auto-merge for '{code_text}': category mismatch ({code_category} vs {existing_category})")

            # Find top-k similar codes in codebook (filtered by same category)
            similar = self.codebook.find_similar(code_text, top_k=top_k, min_similarity=min_similarity, category=code_category)

            # Build reviewer prompt (shows code NAMES, not IDs)
            reviewer_message = self._build_reviewer_prompt(code_text, quotes, similar, explanation_text)

            # Get reviewer decision (ALWAYS called - no threshold skipping!)
            decision = self._call_agent(self.reviewer, reviewer_message)
            self.stats["reviewed_codes"] += 1

            # Process reviewer decision
            # New format: decision has "codes" array with "code", "merge_codes" (names), "quotes"
            if decision and "codes" in decision:
                for code_item in decision.get("codes", []):
                    updated_code = code_item.get("code", code_text)
                    merge_code_names = code_item.get("merge_codes", [])
                    item_quotes = code_item.get("quotes", quotes)

                    # Inner loop pre-check: exact match should auto-merge
                    # This catches duplicates from reviewer returning a code name that exists
                    inner_match_id = self._find_code_id_by_name(updated_code)
                    if inner_match_id is not None and not merge_code_names:
                        # Only auto-merge if categories match
                        inner_existing_cat = self.codebook.entries[inner_match_id].category
                        if inner_existing_cat == code_category or inner_existing_cat == "unknown" or code_category == "unknown":
                            # Auto-merge - exact name match with compatible category
                            code_id = self.codebook.merge_code(
                                updated_code, item_quotes, inner_match_id,
                                update_code_text=False, category=code_category
                            )
                            self.stats["merged_codes"] += 1
                            final_codes.append(CodeResult(
                                code_id=code_id,
                                code_text=self.codebook.entries[code_id].code_text,
                                category=code_category,  # Pass category
                                quotes=item_quotes,
                                is_new=False,
                                merged_with=[self.codebook.entries[code_id].code_text],
                            ))
                            logger.debug(f"Inner auto-merged: '{updated_code}' → code_id {code_id}")
                            continue

                    # Paper: merge_codes empty = new code, non-empty = merge
                    if merge_code_names:
                        # Merge with existing code(s) - lookup by NAME
                        # Per plan (lines 724-743): iterate through ALL merge targets
                        # Only merge with codes of the same category
                        merged_ids = []
                        for code_name in merge_code_names:
                            found_id = self._find_code_id_by_name(code_name)
                            if found_id is not None:
                                target_cat = self.codebook.entries[found_id].category
                                # Only allow merge if categories are compatible
                                if target_cat == code_category or target_cat == "unknown" or code_category == "unknown":
                                    merged_ids.append(found_id)
                                else:
                                    logger.debug(f"Skipping merge target '{code_name}': category mismatch ({code_category} vs {target_cat})")

                        if merged_ids:
                            # Use first target as the canonical entry
                            primary_target_id = merged_ids[0]

                            # Merge new code into primary target with ALL quotes
                            # Per paper Section 4: store up to 20 quotes per code
                            code_id = self.codebook.merge_code(
                                updated_code,
                                item_quotes,  # Pass ALL quotes, not just first
                                primary_target_id,
                                update_code_text=True,  # Per plan lines 729-732
                                category=code_category  # Pass category
                            )

                            # If multiple merge targets, consolidate others into primary
                            # Per plan: each merge target gets processed
                            for other_id in merged_ids[1:]:
                                self.codebook.consolidate_codes(other_id, primary_target_id)

                            self.stats["merged_codes"] += 1
                            final_codes.append(CodeResult(
                                code_id=code_id,
                                code_text=self.codebook.entries[code_id].code_text,
                                category=code_category,  # Pass category
                                quotes=item_quotes,
                                is_new=False,
                                merged_with=merge_code_names,
                            ))
                        else:
                            # Code names not found - add as new with ALL quotes
                            code_id, _ = self.codebook.add_code(
                                updated_code,
                                item_quotes,  # Pass ALL quotes
                                category=code_category  # Pass category
                            )
                            self.stats["new_codes"] += 1
                            final_codes.append(CodeResult(
                                code_id=code_id,
                                code_text=updated_code,
                                category=code_category,  # Pass category
                                quotes=item_quotes,
                                is_new=True,
                            ))
                    else:
                        # merge_codes empty - add as new code with ALL quotes
                        code_id, _ = self.codebook.add_code(
                            updated_code,
                            item_quotes,  # Pass ALL quotes
                            category=code_category  # Pass category
                        )
                        self.stats["new_codes"] += 1
                        final_codes.append(CodeResult(
                            code_id=code_id,
                            code_text=updated_code,
                            category=code_category,  # Pass category
                            quotes=item_quotes,
                            is_new=True,
                        ))
            else:
                # Reviewer failed or old format - add as new code with ALL quotes
                code_id, _ = self.codebook.add_code(
                    code_text,
                    quotes,  # Pass ALL quotes
                    category=code_category  # Pass category
                )
                self.stats["new_codes"] += 1
                final_codes.append(CodeResult(
                    code_id=code_id,
                    code_text=code_text,
                    category=code_category,  # Pass category
                    quotes=quotes,
                    is_new=True,
                ))

        self.stats["total_processed"] += 1

        return ExplanationResult(
            feature_id=feature_id,
            llm_explainer=llm_explainer,
            explanation_text=explanation_text,
            codes=final_codes,
            coder_ids=[c.name for c in self.coders],
        )

    def _build_reviewer_prompt(
        self,
        new_code: str,
        quotes: List[Dict[str, Any]],
        similar_codes: List[Tuple[CodebookEntry, float]],
        explanation_text: str = ""
    ) -> str:
        """Build the prompt for the reviewer agent.

        Following paper: Shows code NAMES (not IDs) for merge_codes output.
        Added: original explanation for context.
        """
        # Format quotes (random sample for representative view)
        sampled_quotes = random.sample(quotes, min(5, len(quotes)))
        quotes_str = "\n".join([
            f"  - \"{q.get('quote', '')}\" (ID: {shorten_quote_id(q.get('quote_id', 'N/A'))})"
            for q in sampled_quotes
        ])

        new_code_section = f"""Item 1 - NEW CODE:
Original explanation: "{explanation_text}"
Code: "{new_code}"
Quotes:
{quotes_str}"""

        # Format similar codes from codebook (similarity used for filtering, not shown)
        if similar_codes:
            similar_section = "Item 2 - SIMILAR EXISTING CODES FROM CODEBOOK:\n"
            for entry, _ in similar_codes:
                sampled_entry_quotes = random.sample(entry.example_quotes, min(5, len(entry.example_quotes)))
                entry_quotes = "\n".join([
                    f"    - \"{q.get('quote', q) if isinstance(q, dict) else q}\" (ID: {shorten_quote_id(q.get('quote_id', 'N/A')) if isinstance(q, dict) else 'N/A'})"
                    for q in sampled_entry_quotes
                ])
                similar_section += f"""
Code: "{entry.code_text}"
  Example quotes:
{entry_quotes}
"""
        else:
            similar_section = "Item 2 - SIMILAR EXISTING CODES FROM CODEBOOK:\nNo similar codes found in codebook."

        return f"""{new_code_section}

{similar_section}

Decide if the new code can be merged with any existing codes.
If merging, include the EXACT CODE NAME in merge_codes (e.g., ["Financial Stress"]).
If adding as new, leave merge_codes empty [].
Output in JSON format."""

    def get_stats(self) -> Dict[str, int]:
        """Get processing statistics."""
        return self.stats.copy()

    def reset_stats(self):
        """Reset processing statistics."""
        self.stats = {
            "total_processed": 0,
            "new_codes": 0,
            "merged_codes": 0,
            "reviewed_codes": 0,
        }
