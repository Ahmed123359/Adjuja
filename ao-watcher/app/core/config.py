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


settings = Settings()
