"""
Configuration settings for RechnungsWerk
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings"""

    # API Settings
    app_name: str = "RechnungsWerk"
    app_version: str = "1.0.0"
    debug: bool = False

    # Database
    database_url: str = "sqlite:///./data/rechnungswerk.db"

    # CORS — akzeptiert komma-getrennte Liste ODER JSON-Array
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]

    # OCR Settings
    tesseract_lang: str = "deu"  # German language
    ocr_dpi: int = 300

    # XRechnung Settings
    xrechnung_version: str = "3.0.2"
    zugferd_profile: str = "EXTENDED"

    # KoSIT Validator
    kosit_validator_url: str = "http://localhost:8081/validate"
    kosit_health_check_interval: int = 300  # 5 minutes

    # Auth
    require_api_key: bool = False  # True für Produktion, False für lokale Entwicklung

    # Upload Settings
    max_upload_size_mb: int = 10
    allowed_extensions: List[str] = [".pdf", ".xml"]

    # Deployment mode
    cloud_mode: bool = False  # False for self-hosted (default), True for SaaS

    # AI API Keys
    anthropic_api_key: str = ""
    mistral_api_key: str = ""
    ollama_model: str = "qwen2.5:14b"
    ai_provider: str = "auto"  # auto, anthropic, mistral, ollama

    # Brevo (Newsletter)
    brevo_api_key: str = ""

    # Redis / ARQ task queue
    redis_url: str = "redis://localhost:6379"

    # Storage backend
    storage_backend: str = "local"  # "local" or "s3"
    aws_bucket: str = ""
    aws_region: str = "eu-central-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # Stripe (placeholders for Task 12)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_starter_price_id: str = ""
    stripe_starter_yearly_price_id: str = ""
    stripe_pro_price_id: str = ""
    stripe_pro_yearly_price_id: str = ""

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
