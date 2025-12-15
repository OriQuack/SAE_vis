"""Abstract base class for LLM providers."""

from abc import ABC, abstractmethod
from typing import Optional


class LLMProvider(ABC):
    """Abstract base class for LLM providers.

    Provides a unified interface for generating text from different LLM APIs.
    """

    @abstractmethod
    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate a response from the LLM.

        Args:
            prompt: The user prompt to send to the model
            system: Optional system message to set context

        Returns:
            The model's text response
        """
        pass

    @abstractmethod
    def generate_json(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate a JSON response from the LLM.

        Args:
            prompt: The user prompt to send to the model
            system: Optional system message to set context

        Returns:
            The model's JSON response as a string
        """
        pass
