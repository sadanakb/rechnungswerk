"""Hybrid AI service — routes between API providers and local Ollama."""
import json
import logging
from enum import Enum
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


class AiProvider(str, Enum):
    ANTHROPIC = "anthropic"
    MISTRAL = "mistral"
    OLLAMA = "ollama"
    AUTO = "auto"


CATEGORIZATION_PROMPT = """Kategorisiere diese Rechnung nach SKR03.
Verkäufer: {seller_name}
Beschreibung: {description}
Betrag: {amount} EUR

Antwort als JSON: {{"skr03_account": "XXXX", "category": "Kategoriename"}}"""


def categorize_invoice(
    seller_name: str,
    description: str,
    amount: float,
    provider: AiProvider = AiProvider.AUTO,
) -> dict:
    prompt = CATEGORIZATION_PROMPT.format(
        seller_name=seller_name,
        description=description,
        amount=amount,
    )

    if provider == AiProvider.AUTO:
        provider = _select_provider()

    try:
        if provider == AiProvider.ANTHROPIC:
            return _call_anthropic(prompt)
        elif provider == AiProvider.MISTRAL:
            return _call_mistral(prompt)
        else:
            return _call_ollama(prompt)
    except Exception as e:
        logger.warning("AI provider %s failed: %s, falling back to Ollama", provider, e)
        return _call_ollama(prompt)


def _select_provider() -> AiProvider:
    if settings.anthropic_api_key:
        return AiProvider.ANTHROPIC
    if settings.mistral_api_key:
        return AiProvider.MISTRAL
    return AiProvider.OLLAMA


def _call_anthropic(prompt: str) -> dict:
    from anthropic import Anthropic
    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.content[0].text)


def _call_mistral(prompt: str) -> dict:
    from mistralai import Mistral
    client = Mistral(api_key=settings.mistral_api_key)
    response = client.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.choices[0].message.content)


def _call_ollama(prompt: str) -> dict:
    import ollama
    response = ollama.chat(
        model=settings.ollama_model,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response["message"]["content"])
