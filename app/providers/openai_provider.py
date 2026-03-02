from openai import OpenAI, AuthenticationError, RateLimitError
from app.providers.base import AbstractLLMProvider
from app.models.generation import GenerationRequest, GenerationResult, ModeleDisponible


OPENAI_MODELS = [
    ModeleDisponible(provider="openai", model_id="gpt-4o",      description="Modèle flagship multimodal", defaut=True),
    ModeleDisponible(provider="openai", model_id="gpt-4o-mini", description="Version rapide et économique de GPT-4o"),
    ModeleDisponible(provider="openai", model_id="o1",          description="Modèle de raisonnement avancé"),
    ModeleDisponible(provider="openai", model_id="o1-mini",     description="Raisonnement rapide et économique"),
]


class OpenAIProvider(AbstractLLMProvider):
    """
    Provider OpenAI — famille de modèles GPT et o1.

    Utilise le SDK officiel `openai` via l'API Chat Completions.
    """

    def __init__(self, api_key: str, model_name: str = ""):
        super().__init__(api_key, model_name)
        self._client = OpenAI(api_key=api_key)

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def default_model(self) -> str:
        return "gpt-4o"

    def get_available_models(self) -> list[ModeleDisponible]:
        return OPENAI_MODELS

    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> tuple[str, int]:
        """Appel brut à l'API OpenAI Chat Completions. Lève une exception en cas d'erreur."""
        response = self._client.chat.completions.create(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
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
        except AuthenticationError:
            return self._build_error_result("Clé API OpenAI invalide.")
        except RateLimitError:
            return self._build_error_result("Quota API OpenAI dépassé.")
        except Exception as e:
            return self._build_error_result(f"Erreur OpenAI: {e}")
