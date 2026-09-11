from app.billing.provider.base import CheckoutSession, PaymentProvider, WebhookEvent


class ManualProvider(PaymentProvider):
    """Pas d'appel externe. Utilisé pour Pro/Enterprise (sales-assisted,
    "Sur devis" sur la page pricing) -- l'activation passe par
    `POST /billing/admin/activate`, jamais par un checkout.

    Existe comme deuxième implémentation réelle de `PaymentProvider` dès le
    départ (à côté de `CMIProvider`) pour que l'abstraction corresponde à un
    vrai axe de variation (self-serve vs sales-assisted), pas une interface
    autour d'une seule implémentation.
    """

    @property
    def provider_name(self) -> str:
        return "manual"

    async def create_checkout(self, org_id: str, plan_code: str) -> CheckoutSession:
        raise NotImplementedError(
            "Le plan '%s' est activé manuellement par un admin (bank transfer + "
            "facture), pas via un checkout self-serve." % plan_code
        )

    def parse_webhook(self, headers: dict, raw_body: bytes) -> WebhookEvent | None:
        return None
