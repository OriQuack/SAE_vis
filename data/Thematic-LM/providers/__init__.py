"""LLM Provider implementations for Thematic-LM."""

from .base import LLMProvider
from .openai_provider import OpenAIProvider

__all__ = ["LLMProvider", "OpenAIProvider"]


def create_provider(config: dict) -> LLMProvider:
    """Factory function to create LLM provider from config.

    Args:
        config: LLM configuration dict with 'provider' and 'model' keys

    Returns:
        Configured LLMProvider instance
    """
    provider_name = config.get("provider", "openai").lower()

    if provider_name == "openai":
        return OpenAIProvider(
            model=config.get("model", "gpt-4o-mini"),
            temperature=config.get("temperature", 0.3),
            max_tokens=config.get("max_tokens", 512)
        )
    elif provider_name == "anthropic":
        # Import here to avoid requiring anthropic if not used
        from .anthropic_provider import AnthropicProvider
        return AnthropicProvider(
            model=config.get("model", "claude-3-haiku-20240307"),
            temperature=config.get("temperature", 0.3),
            max_tokens=config.get("max_tokens", 512)
        )
    else:
        raise ValueError(f"Unknown provider: {provider_name}")
