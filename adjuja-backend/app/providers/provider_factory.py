from app.providers.base import AbstractLLMProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.mistral_provider import MistralProvider
from app.providers.deepseek_provider import DeepSeekProvider
from app.models.generation import ModeleDisponible


class ProviderFactory:
    """
    Factory Pattern : instancie le bon provider LLM selon le nom demandé.

    Centralise la création des providers via un registre `_registry` qui associe
    un identifiant textuel à la classe concrète correspondante.

    Avantage principal : ajouter un nouveau provider ne nécessite aucune
    modification du reste de l'application  il suffit de l'enregistrer ici.

    Pour ajouter un nouveau provider :
    1. Créer ``app/providers/mon_provider.py`` avec une classe héritant de
       ``AbstractLLMProvider``
    2. Ajouter une entrée dans ``_registry`` : ``"mon_provider": MonProvider``

    Attributs de classe :
        _registry: Dictionnaire ``{nom_provider: classe_concrète}``.
    """

    _registry: dict[str, type[AbstractLLMProvider]] = {
        "openai":    OpenAIProvider,
        "anthropic": AnthropicProvider,
        "mistral":   MistralProvider,
        "deepseek":  DeepSeekProvider,
    }

    @classmethod
    def create(
        cls,
        provider_name: str,
        api_key: str,
        model_name: str = "",
    ) -> AbstractLLMProvider:
        """
        Crée et retourne une instance configurée du provider demandé.

        Args:
            provider_name: Identifiant du provider, insensible à la casse
                           (ex: ``'openai'``, ``'Anthropic'``).
            api_key:       Clé API à transmettre au provider.
            model_name:    Modèle spécifique à utiliser. Si vide, le provider
                           utilisera son ``default_model``.

        Returns:
            Instance concrète de ``AbstractLLMProvider`` prête à l'emploi.

        Raises:
            ValueError: Si ``provider_name`` ne correspond à aucun provider enregistré.
        """
        provider_name = provider_name.lower()
        if provider_name not in cls._registry:
            providers_dispos = ", ".join(cls._registry.keys())
            raise ValueError(
                f"Provider '{provider_name}' inconnu. "
                f"Providers disponibles : {providers_dispos}"
            )
        return cls._registry[provider_name](api_key=api_key, model_name=model_name)

    @classmethod
    def get_supported_providers(cls) -> list[str]:
        """
        Retourne la liste des identifiants de providers enregistrés.

        Returns:
            Liste de chaînes (ex: ``['openai', 'anthropic', 'mistral']``).
        """
        return list(cls._registry.keys())

    @classmethod
    def get_all_models(cls) -> list[ModeleDisponible]:
        """
        Retourne la liste consolidée de tous les modèles disponibles.

        Instancie chaque provider avec une clé vide (pas d'appel API) uniquement
        pour accéder à sa liste de modèles statique, puis agrège les résultats.

        Returns:
            Liste de `ModeleDisponible` tous providers confondus.
        """
        all_models: list[ModeleDisponible] = []
        for provider_class in cls._registry.values():
            # Instanciation factice pour récupérer les modèles (pas d'appel API)
            instance = provider_class(api_key="", model_name="")
            all_models.extend(instance.get_available_models())
        return all_models
