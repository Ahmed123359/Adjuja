"""
Provider DeepSeek (2026-09-27, spec context/feature-spec/fournisseurs-ia/).

L'API DeepSeek est compatible OpenAI (Chat Completions, mode JSON par
`response_format`) : ce provider reutilise `OpenAIProvider` en changeant
seulement l'adresse du service, la cle et la liste de modeles. Si DeepSeek
s'ecarte un jour de ce format, c'est ici et nulle part ailleurs qu'il faudra
l'adapter.

Mode JSON : DeepSeek exige que le prompt contienne le mot « json » ; les
prompts d'analyse du projet decrivent tous la structure JSON attendue.
"""

from openai import OpenAI

from app.config.settings import get_settings
from app.models.generation import ModeleDisponible
from app.providers.openai_provider import OpenAIProvider

DEEPSEEK_MODELS = [
    ModeleDisponible(provider="deepseek", model_id="deepseek-chat", description="Modele general DeepSeek", defaut=True),
    ModeleDisponible(provider="deepseek", model_id="deepseek-reasoner", description="Raisonnement approfondi, plus lent"),
]


class DeepSeekProvider(OpenAIProvider):
    """Provider DeepSeek : `OpenAIProvider` pointe vers l'API DeepSeek."""

    def __init__(self, api_key: str, model_name: str = ""):
        super().__init__(api_key, model_name)
        self._client = OpenAI(api_key=api_key, base_url=get_settings().deepseek_base_url)

    @property
    def provider_name(self) -> str:
        return "deepseek"

    @property
    def default_model(self) -> str:
        return "deepseek-chat"

    def get_available_models(self) -> list[ModeleDisponible]:
        return DEEPSEEK_MODELS
