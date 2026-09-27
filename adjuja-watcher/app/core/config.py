from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str = "redis://redis:6379/3"

    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "offria"
    minio_secure: bool = False

    watcher_api_port: int = 8001
    main_app_host: str = "host.docker.internal"
    main_app_port: int = 8000
    scrape_interval_hours: int = 6
    mistral_api_key: str = ""

    # Role IA de l'analyse : `fournisseur:modele` (spec fournisseurs-ia).
    # Defaut = comportement d'avant ; DeepSeek : LLM_ANALYSIS=deepseek:deepseek-chat.
    llm_analysis: str = "mistral:mistral-large-latest"
    deepseek_api_key: str = ""
    openai_api_key: str = ""
    mistral_base_url: str = "https://api.mistral.ai/v1"
    deepseek_base_url: str = "https://api.deepseek.com"
    openai_base_url: str = "https://api.openai.com/v1"

    notification_service_url: str = "http://notification-api:8002"
    notification_admin_secret: str = "dev-admin-secret"


settings = Settings()
