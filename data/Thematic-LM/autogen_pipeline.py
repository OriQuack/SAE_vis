"""Simplified Thematic-LM Pipeline for SAE feature explanation coding.

Simplified architecture (no merging):
    Text → Coder → Codes (stored per-explanation)

Each explanation is decomposed into 1-3 codes. No merging is performed,
allowing codes to be traced back to their source explanations and their
associated scores (Fuzz, Detection, etc.).

Based on: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for
Large-scale Thematic Analysis" (WWW '25) - Coding stage only, simplified.
"""

import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

from autogen_agents import (
    create_coder_agent,
    create_aggregator_agent,
    create_reviewer_agent,
)

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
    code_text: str
    category: str  # "token-level" | "context-level" | "unknown"
    quote: str  # Supporting quote from the explanation


@dataclass
class ExplanationResult:
    """Result of coding a single explanation."""
    feature_id: int
    llm_explainer: str
    explanation_text: str
    codes: List[CodeResult]
    coder_id: str


class ThematicLMPipeline:
    """Simplified Thematic-LM pipeline - Coder only, no merging.

    Flow: Text → Coder → Codes (stored per-explanation)

    Each explanation is decomposed into 1-3 codes. Codes are stored
    per-explanation without merging, allowing score attribution.
    """

    def __init__(
        self,
        config: Dict,
        api_key: Optional[str] = None
    ):
        """Initialize the pipeline.

        Args:
            config: Configuration dict with llm_config, coder_config, etc.
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.config = config

        # Get API key
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key required. Set OPENAI_API_KEY env var.")

        # LLM config with API key
        self.llm_config = {
            **config.get("llm_config", {}),
            "api_key": self.api_key
        }

        # Create coder agent
        self._create_coder()

        # Statistics
        self.stats = {
            "total_processed": 0,
            "total_codes": 0,
        }

    def _create_coder(self):
        """Create the Coder agent."""
        coder_config = self.config.get("coder_config", {})
        coders_list = coder_config.get("coders", [{"id": "default"}])

        # Use first coder config (simplified - single coder)
        coder_cfg = coders_list[0] if coders_list else {"id": "default"}

        self.coder = create_coder_agent(
            llm_config=self.llm_config,
            coder_id=coder_cfg.get("id", "default"),
            identity=coder_cfg.get("identity"),
            custom_identity=coder_cfg.get("custom_identity"),
        )
        logger.info(f"Created coder: {self.coder.name}")

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

    def _call_agent(self, agent, message: str, max_retries: int = 4) -> Optional[Dict]:
        """Call an agent and extract JSON response with retry logic.

        Uses generate_oai_reply() for direct LLM calls, bypassing the
        conversation loop and termination checks. This is the proper
        approach for single-shot prompt-response patterns.

        Args:
            agent: AutoGen ConversableAgent to call
            message: Message to send to the agent
            max_retries: Number of retry attempts (default: 3)

        Returns:
            Parsed JSON response or None if failed
        """
        messages = [{"role": "user", "content": message}]

        last_failure_reason = "unknown"
        last_response_preview = ""

        for attempt in range(max_retries):
            try:
                # Use generate_oai_reply for direct LLM call (bypasses termination checks)
                final, response = agent.generate_oai_reply(messages=messages)
                logger.debug(f"Agent {agent.name} raw response - final: {final}, response type: {type(response)}, response: {str(response)[:500] if response else 'None'}")

                # Log full API response metadata (finish_reason, usage, etc.)
                try:
                    if hasattr(agent, 'client') and agent.client:
                        last_response = getattr(agent.client, 'last_response', None)
                        if last_response:
                            # Extract finish_reason and usage from OpenAI response
                            if hasattr(last_response, 'choices') and last_response.choices:
                                finish_reason = last_response.choices[0].finish_reason
                                logger.debug(f"Agent {agent.name} API metadata - finish_reason: {finish_reason}")
                            if hasattr(last_response, 'usage'):
                                logger.debug(f"Agent {agent.name} API usage - {last_response.usage}")
                except Exception as meta_err:
                    logger.debug(f"Could not extract API metadata: {meta_err}")

                if response:
                    content = response if isinstance(response, str) else response.get("content", "")
                    result = self._extract_json_from_response(content)
                    if result:
                        return result
                    # Invalid JSON
                    last_failure_reason = "invalid_json"
                    last_response_preview = content[:200] if content else "(empty content)"
                else:
                    last_failure_reason = "empty_response"
                    last_response_preview = str(response)

                # Response was empty or invalid JSON, retry with exponential backoff
                if attempt < max_retries - 1:
                    backoff = 2 ** attempt  # 1, 2, 4, 8, 16 seconds
                    logger.debug(f"Agent {agent.name} attempt {attempt + 1}/{max_retries} failed: {last_failure_reason}. Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue

            except Exception as e:
                last_failure_reason = f"exception: {e}"
                last_response_preview = ""
                if attempt < max_retries - 1:
                    backoff = 2 ** attempt
                    logger.warning(f"Agent call failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {backoff}s...")
                    time.sleep(backoff)
                else:
                    logger.error(f"Agent call failed after {max_retries} attempts: {e}")

        # Log final failure with details
        logger.warning(f"Agent {agent.name} failed after {max_retries} attempts: {last_failure_reason}. Response: {last_response_preview}")
        return None

    def process_explanation(
        self,
        explanation_text: str,
        quote_id: str,
        feature_id: int,
        llm_explainer: str
    ) -> ExplanationResult:
        """Process a single explanation through the Coder.

        Flow: Text → Coder → Codes (no merging)

        Args:
            explanation_text: The SAE feature explanation to code
            quote_id: Identifier for the explanation
            feature_id: Feature ID for tracking
            llm_explainer: LLM explainer name for tracking

        Returns:
            ExplanationResult with decomposed codes
        """
        short_id = shorten_quote_id(quote_id)

        # Call Coder to decompose explanation into 1-3 codes
        message = f"""Data ID: {short_id}
Text: {explanation_text}

Generate 1-3 codes for this SAE feature explanation. Output in JSON format."""

        response = self._call_agent(self.coder, message)

        codes = []
        if response and "codes" in response:
            for c in response.get("codes", []):
                code_text = c.get("code", "").strip()
                if code_text:
                    codes.append(CodeResult(
                        code_text=code_text,
                        category=c.get("category", "unknown"),
                        quote=c.get("quote", ""),
                    ))
        else:
            logger.warning(f"Coder returned no valid codes for {quote_id}. Response: {response}")

        # Update stats
        self.stats["total_processed"] += 1
        self.stats["total_codes"] += len(codes)

        return ExplanationResult(
            feature_id=feature_id,
            llm_explainer=llm_explainer,
            explanation_text=explanation_text,
            codes=codes,
            coder_id=self.coder.name,
        )

    def get_stats(self) -> Dict[str, int]:
        """Get processing statistics."""
        return self.stats.copy()

    def reset_stats(self):
        """Reset processing statistics."""
        self.stats = {
            "total_processed": 0,
            "total_codes": 0,
        }
