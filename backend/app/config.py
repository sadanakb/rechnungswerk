"""
Configuration settings for RechnungsWerk
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    
    # API Settings
    app_name: str = "RechnungsWerk"
    app_version: str = "1.0.0"
    debug: bool = True
    
    # Database
    database_url: str = "sqlite:///./data/rechnungswerk.db"
    
    # CORS
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
    
    class Config:
        env_file = ".env"


settings = Settings()
