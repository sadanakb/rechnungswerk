"""Central Azure OpenAI client for AI features.

Provides a unified factory that prefers Azure OpenAI (DSGVO-konform, EU data
residency) and falls back to the standard OpenAI client when only
``settings.openai_api_key`` is available.
"""
from typing import Union

from openai import AzureOpenAI, OpenAI

from app.config import settings


def get_ai_client() -> tuple[Union[AzureOpenAI, OpenAI, None], None]:
    """Return a configured OpenAI-compatible client.

    Resolution order:
    1. Azure OpenAI — if both ``azure_openai_api_key`` and
       ``azure_openai_endpoint`` are set.
    2. Direct OpenAI — if ``openai_api_key`` is set.
    3. ``(None, None)`` — AI not configured.

    Returns:
        A 2-tuple where the first element is the client instance (or ``None``)
        and the second element is always ``None`` (reserved for future use,
        e.g. async clients).
    """
    if settings.azure_openai_api_key and settings.azure_openai_endpoint:
        client = AzureOpenAI(
            api_key=settings.azure_openai_api_key,
            azure_endpoint=settings.azure_openai_endpoint,
            api_version=settings.azure_openai_api_version,
        )
        return client, None

    if settings.openai_api_key:
        client = OpenAI(api_key=settings.openai_api_key)
        return client, None

    return None, None


def get_model_name(size: str = "mini") -> str:
    """Return the appropriate model/deployment name for the given size.

    When Azure OpenAI is active the deployment names from settings are used.
    Otherwise the canonical OpenAI model names are returned.

    Args:
        size: ``"mini"`` for the cost-efficient model (GPT-4o Mini) or
              ``"vision"`` for the full model with vision capabilities (GPT-4o).

    Returns:
        Model or deployment name as a string.
    """
    use_azure = bool(settings.azure_openai_api_key and settings.azure_openai_endpoint)

    if size == "vision":
        return settings.azure_openai_deployment_vision if use_azure else "gpt-4o"

    # Default: "mini"
    return settings.azure_openai_deployment_mini if use_azure else "gpt-4o-mini"
