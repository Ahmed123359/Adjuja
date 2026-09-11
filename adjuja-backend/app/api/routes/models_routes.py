from fastapi import APIRouter
from app.models.generation import ModeleDisponible
from app.providers.provider_factory import ProviderFactory

router = APIRouter(prefix="/models", tags=["Modèles"])


@router.get(
    "",
    response_model=list[ModeleDisponible],
    summary="Lister tous les modèles disponibles",
    description="Retourne la liste de tous les modèles LLM disponibles, groupés par provider.",
)
def list_models() -> list[ModeleDisponible]:
    """
    Retourne tous les modèles disponibles, tous providers confondus.

    Utile pour peupler un sélecteur de modèle côté client.
    Les modèles par défaut de chaque provider ont ``defaut=True``.
    """
    return ProviderFactory.get_all_models()


@router.get(
    "/providers",
    response_model=list[str],
    summary="Lister les providers disponibles",
)
def list_providers() -> list[str]:
    """Retourne les identifiants des providers enregistrés (ex: ``['openai', 'anthropic', 'mistral']``)."""
    return ProviderFactory.get_supported_providers()


@router.get(
    "/{provider}",
    response_model=list[ModeleDisponible],
    summary="Lister les modèles d'un provider spécifique",
)
def list_models_by_provider(provider: str) -> list[ModeleDisponible]:
    """
    Retourne les modèles disponibles pour un provider donné.

    Args:
        provider: Identifiant du provider (ex: ``'anthropic'``). Insensible à la casse.

    Returns:
        Liste vide si le provider n'existe pas ou n'a pas de modèles déclarés.
    """
    all_models = ProviderFactory.get_all_models()
    provider_models = [m for m in all_models if m.provider == provider.lower()]
    return provider_models
