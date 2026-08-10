from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class CheckoutSession:
    redirect_url: str
    provider_ref: str


@dataclass
class WebhookEvent:
    provider_event_id: str
    org_id: str
    plan_code: str
    event_type: str          # "payment_succeeded" | "payment_failed"
    period_end: str | None   # ISO 8601, présent sur payment_succeeded
    raw: dict


class PaymentProvider(ABC):
    """Contrat commun à tout moyen de paiement. Implémente le pattern Strategy,
    même forme que `AbstractLLMProvider` dans `app/providers/base.py` : le reste
    de l'application ne dépend que de cette abstraction, jamais d'une
    implémentation concrète (CMI, manuel, ou un futur provider).
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @abstractmethod
    async def create_checkout(self, org_id: str, plan_code: str) -> CheckoutSession:
        """Initie un paiement. Lève une exception claire si le provider n'est
        pas configuré ou si le plan n'est pas éligible au self-serve."""
        ...

    @abstractmethod
    def parse_webhook(self, headers: dict, raw_body: bytes) -> WebhookEvent | None:
        """Vérifie la signature du callback et retourne l'événement normalisé.
        Retourne None si la signature est invalide ou l'événement non reconnu
        (jamais d'exception ici, le routeur webhook doit répondre 400 proprement)."""
        ...
