from app.billing.provider.base import PaymentProvider
from app.billing.provider.cmi import CMIProvider
from app.billing.provider.manual import ManualProvider


class PaymentProviderFactory:
    """Même forme que `ProviderFactory` (LLM) dans `app/providers/provider_factory.py`.
    Ajouter un nouveau moyen de paiement = une classe + une entrée ici."""

    _registry: dict[str, type[PaymentProvider]] = {
        "manual": ManualProvider,
        "cmi": CMIProvider,
    }

    @classmethod
    def create(cls, provider_name: str) -> PaymentProvider:
        provider_name = provider_name.lower()
        if provider_name not in cls._registry:
            disponibles = ", ".join(cls._registry.keys())
            raise ValueError(f"Provider de paiement '{provider_name}' inconnu. Disponibles : {disponibles}")
        return cls._registry[provider_name]()
