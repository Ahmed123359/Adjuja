import anthropic
from app.providers.base import AbstractLLMProvider
from app.models.generation import GenerationRequest, GenerationResult, ModeleDisponible


ANTHROPIC_MODELS = [
    ModeleDisponible(provider="anthropic", model_id="claude-opus-4-6",          description="Modèle le plus puissant", defaut=True),
    ModeleDisponible(provider="anthropic", model_id="claude-sonnet-4-6",        description="Équilibre performance / coût"),
    ModeleDisponible(provider="anthropic", model_id="claude-haiku-4-5-20251001", description="Rapide et économique"),
]


class AnthropicProvider(AbstractLLMProvider):
    """
    Provider Anthropic — famille de modèles Claude.

    Utilise le SDK officiel `anthropic` (API Messages).
    Le paramètre `system` est passé au niveau racine (pas dans messages[])
    conformément à la convention Anthropic.
    """

    def __init__(self, api_key: str, model_name: str = ""):
        super().__init__(api_key, model_name)
        self._client = anthropic.Anthropic(api_key=api_key)

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def default_model(self) -> str:
        return "claude-opus-4-6"

    def get_available_models(self) -> list[ModeleDisponible]:
        return ANTHROPIC_MODELS

    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> tuple[str, int]:
        """Appel brut à l'API Anthropic Messages. Lève une exception en cas d'erreur."""
        message = self._client.messages.create(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        texte = message.content[0].text
        tokens = message.usage.input_tokens + message.usage.output_tokens
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
        except anthropic.AuthenticationError:
            return self._build_error_result("Clé API Anthropic invalide.")
        except anthropic.RateLimitError:
            return self._build_error_result("Quota API Anthropic dépassé.")
        except Exception as e:
            return self._build_error_result(f"Erreur Anthropic: {e}")
