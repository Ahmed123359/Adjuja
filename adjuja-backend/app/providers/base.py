from abc import ABC, abstractmethod
from app.models.generation import GenerationRequest, GenerationResult, ModeleDisponible, SectionReponse


class AbstractLLMProvider(ABC):
    """
    Classe abstraite définissant le contrat commun pour tous les providers LLM.

    Implémente le pattern **Strategy** : chaque provider concret encapsule
    la logique d'appel à une API LLM spécifique (OpenAI, Anthropic, Mistral…)
    derrière une interface uniforme. Le reste de l'application ne dépend que
    de cette abstraction, jamais des implémentations concrètes.

    Pour ajouter un nouveau provider :
    1. Créer une classe héritant de `AbstractLLMProvider`
    2. Implémenter les méthodes et propriétés abstraites
    3. Enregistrer la classe dans `ProviderFactory._registry`

    Attributs protégés :
        _api_key (str)    : clé API du provider, ne doit jamais être loguée
        _model_name (str) : modèle configuré pour cette instance
    """

    def __init__(self, api_key: str, model_name: str = ""):
        self._api_key = api_key
        self._model_name = model_name or self.default_model

    # ── Méthodes abstraites ────────────────────────────────────────────────

    @abstractmethod
    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
        json_mode: bool = False,
    ) -> tuple[str, int]:
        """
        Appel LLM brut : retourne (texte_généré, tokens_utilisés).

        Lève une exception en cas d'erreur API (auth, rate limit, réseau…).
        La gestion d'erreur est laissée à l'appelant.

        Args:
            system_prompt: Instructions système (rôle, comportement).
            user_prompt:   Prompt utilisateur (contexte AO + instructions section).
            max_tokens:    Limite de tokens en sortie pour cet appel.
            temperature:   Créativité du modèle (0 = déterministe, 1 = très créatif).
            json_mode:     Demande une réponse JSON valide (analyse, extraction).
                           Chaque fournisseur l'obtient à sa façon : paramètre
                           natif quand il existe, consigne sinon. Le prompt doit
                           de toute façon décrire la structure attendue.

        Returns:
            Tuple (texte, tokens) où texte est la réponse brute Markdown
            et tokens le nombre total de tokens consommés (entrée + sortie).
        """
        ...

    @abstractmethod
    async def generate(self, request: GenerationRequest, prompt: str) -> GenerationResult:
        """
        Génération complète legacy  conservé pour compatibilité.

        Les nouvelles implémentations appellent `generate_text()` en interne.
        """
        ...

    @abstractmethod
    def get_available_models(self) -> list[ModeleDisponible]:
        """Retourne la liste statique des modèles supportés par ce provider."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Identifiant textuel du provider (ex: ``'openai'``, ``'anthropic'``)."""
        ...

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Identifiant du modèle utilisé quand aucun modèle n'est spécifié."""
        ...

    @property
    def current_model(self) -> str:
        """Identifiant du modèle actuellement configuré sur cette instance."""
        return self._model_name

    # ── Utilitaires partagés ───────────────────────────────────────────────

    def _build_error_result(self, error_message: str) -> GenerationResult:
        """Construit un `GenerationResult` d'échec standardisé."""
        return GenerationResult(
            succes=False,
            provider_utilise=self.provider_name,
            model_utilise=self._model_name,
            erreur=error_message,
        )

    def _extraire_sections(self, texte: str) -> list[SectionReponse]:
        """Parse le texte généré en sections selon les titres Markdown (## ...)."""
        sections: list[SectionReponse] = []
        bloc_titre = ""
        bloc_lignes: list[str] = []
        ordre = 0

        for ligne in texte.splitlines():
            if ligne.startswith("## "):
                if bloc_titre:
                    sections.append(SectionReponse(
                        titre=bloc_titre,
                        contenu="\n".join(bloc_lignes).strip(),
                        ordre=ordre,
                    ))
                    ordre += 1
                bloc_titre = ligne[3:].strip()
                bloc_lignes = []
            else:
                bloc_lignes.append(ligne)

        if bloc_titre:
            sections.append(SectionReponse(
                titre=bloc_titre,
                contenu="\n".join(bloc_lignes).strip(),
                ordre=ordre,
            ))

        return sections
