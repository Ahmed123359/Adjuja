from functools import lru_cache
from fastapi import Depends
from app.config.settings import Settings, get_settings
from app.services.ao_parser_service import AOParserService
from app.services.prompt_builder_service import PromptBuilderService
from app.services.generation_service import GenerationService
from app.services.rag_service import RagService
from app.services.usage_service import UsageService

# Singletons — initialisés une seule fois au démarrage
_rag_instance:   RagService   | None = None
_usage_instance: UsageService | None = None


@lru_cache
def get_ao_parser() -> AOParserService:
    """Fournit l'instance singleton du service de parsing AO."""
    return AOParserService()


@lru_cache
def get_prompt_builder() -> PromptBuilderService:
    """Fournit l'instance singleton du service de construction de prompts."""
    return PromptBuilderService()


def get_rag_service(settings: Settings = Depends(get_settings)) -> RagService:
    """
    Fournit l'instance singleton du service RAG (lecture Qdrant).

    Initialise les clients Qdrant + OpenAI au premier appel.
    Aucune indexation n'est déclenchée ici — c'est le rôle du microservice rag-etl.
    Si QDRANT_URL n'est pas configuré, le service retourne des chaînes vides
    (dégradation gracieuse).
    """
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RagService(
            qdrant_url=settings.qdrant_url,
            openai_api_key=settings.openai_api_key,
        )
    return _rag_instance


def get_usage_service() -> UsageService:
    """Fournit l'instance singleton du compteur d'usage."""
    global _usage_instance
    if _usage_instance is None:
        _usage_instance = UsageService()
    return _usage_instance


def get_generation_service(
    parser: AOParserService = Depends(get_ao_parser),
    prompt_builder: PromptBuilderService = Depends(get_prompt_builder),
    settings: Settings = Depends(get_settings),
    rag: RagService = Depends(get_rag_service),
) -> GenerationService:
    """Fournit une instance de GenerationService avec toutes ses dépendances."""
    return GenerationService(
        parser=parser,
        prompt_builder=prompt_builder,
        settings=settings,
        rag_service=rag,
    )
