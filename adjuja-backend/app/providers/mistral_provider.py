from mistralai import Mistral
from app.providers.base import AbstractLLMProvider
from app.models.generation import GenerationRequest, GenerationResult, ModeleDisponible


MISTRAL_MODELS = [
    ModeleDisponible(provider="mistral", model_id="mistral-large-latest", description="Meilleur modèle Mistral", defaut=True),
    ModeleDisponible(provider="mistral", model_id="mistral-small-latest", description="Rapide et économique"),
    ModeleDisponible(provider="mistral", model_id="codestral-latest",     description="Spécialisé code"),
]


class MistralProvider(AbstractLLMProvider):
    """
    Provider Mistral AI.

    Utilise le SDK officiel `mistralai` via l'API Chat.
    Provider européen, hébergé en France  pertinent pour les marchés publics
    soumis à des contraintes de souveraineté des données.
    """

    def __init__(self, api_key: str, model_name: str = ""):
        super().__init__(api_key, model_name)
        self._client = Mistral(api_key=api_key)

    @property
    def provider_name(self) -> str:
        return "mistral"

    @property
    def default_model(self) -> str:
        return "mistral-large-latest"

    def get_available_models(self) -> list[ModeleDisponible]:
        return MISTRAL_MODELS

    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
        json_mode: bool = False,
    ) -> tuple[str, int]:
        """Appel brut à l'API Mistral Chat. Lève une exception en cas d'erreur."""
        extra = {"response_format": {"type": "json_object"}} if json_mode else {}
        response = self._client.chat.complete(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            **extra,
        )
        texte = response.choices[0].message.content or ""
        tokens = response.usage.total_tokens if response.usage else 0
        return texte, tokens

    async def generate(self, request: GenerationRequest, prompt: str) -> GenerationResult:
        """Génération complète legacy (appel unique)."""
        try:
            texte, tokens = await self.generate_text(
                "Tu es un expert en réponse aux appels d'offres publics et privés.",
                prompt,
                request.max_tokens,
                request.temperature,
            )
            return GenerationResult(
                succes=True,
                provider_utilise=self.provider_name,
                model_utilise=self._model_name,
                texte_complet=texte,
                sections=self._extraire_sections(texte),
                tokens_utilises=tokens,
            )
        except Exception as e:
            return self._build_error_result(f"Erreur Mistral: {e}")
