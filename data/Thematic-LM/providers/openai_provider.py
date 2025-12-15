"""OpenAI LLM provider implementation."""

import os
import time
import logging
from typing import Optional

from openai import OpenAI
from .base import LLMProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """OpenAI API provider for LLM generation.

    Uses the OpenAI Python SDK to generate text responses.
    Default model is gpt-4o-mini for cost efficiency.
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        temperature: float = 0.3,
        max_tokens: int = 512,
        api_key: Optional[str] = None,
        rate_limit_rpm: int = 500
    ):
        """Initialize OpenAI provider.

        Args:
            model: OpenAI model to use (default: gpt-4o-mini)
            temperature: Sampling temperature (default: 0.3 for consistency)
            max_tokens: Maximum tokens in response
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
            rate_limit_rpm: Rate limit in requests per minute
        """
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.rate_limit_rpm = rate_limit_rpm
        self._min_interval = 60.0 / rate_limit_rpm
        self._last_request_time = 0.0

        api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key not found. Set OPENAI_API_KEY env var.")

        self.client = OpenAI(api_key=api_key)

    def _rate_limit(self):
        """Apply rate limiting between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request_time = time.time()

    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate a text response from the LLM.

        Args:
            prompt: The user prompt
            system: Optional system message

        Returns:
            The model's text response
        """
        self._rate_limit()

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise

    def generate_json(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate a JSON response from the LLM.

        Uses OpenAI's JSON mode for structured output.

        Args:
            prompt: The user prompt
            system: Optional system message

        Returns:
            The model's JSON response as a string
        """
        self._rate_limit()

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"}
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise
