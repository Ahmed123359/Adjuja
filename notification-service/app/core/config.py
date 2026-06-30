from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str = "redis://redis:6379/4"

    resend_api_key: str = ""
    notification_channel: str = "email_resend"
    notification_from_email: str = "noreply@adjuja.ma"
    notification_from_name: str = "ADJUJA Veille"

    admin_secret: str = "dev-admin-secret"

    notification_hour: int = 8    # 08:00 Africa/Casablanca
    notification_minute: int = 0

    @field_validator("resend_api_key")
    @classmethod
    def warn_missing_api_key(cls, v: str) -> str:
        if not v:
            import warnings
            warnings.warn("RESEND_API_KEY is not set  emails will not be sent.", stacklevel=2)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
