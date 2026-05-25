from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class RagSettings(BaseSettings):
    """Configuration du service RAG ETL."""

    # Mistral  pour la génération des embeddings
    mistral_api_key: str = ""
    embedding_model: str = "mistral-embed"
    embedding_dimensions: int = 1024

    # Qdrant  base de données vectorielle
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    collection_name: str = "offria_kb"

    # Base de connaissances
    knowledge_base_path: str = "/app/knowledge_base"

    # Chunking
    chunk_size: int = 600
    chunk_overlap: int = 100

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> RagSettings:
    return RagSettings()
