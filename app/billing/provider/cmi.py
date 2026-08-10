"""
CMI (Centre Monétique Interbancaire) est le rail de paiement carte standard au
Maroc -- une page de paiement hébergée (redirect flow) signée par HMAC, la
forme classique des passerelles bancaires MENA. C'est le choix retenu plutôt
que Stripe car Stripe ne règle pas en MAD vers un compte bancaire marocain.

IMPORTANT -- ce fichier n'invente pas de comportement CMI comme un fait établi.
Les noms de champs exacts, l'algorithme de hash précis et la forme du payload
de callback ci-dessous sont un squelette basé sur le pattern générique connu
des passerelles bancaires marocaines/MENA (page hébergée + requête signée +
callback signé), PAS une intégration confirmée contre la documentation
marchand CMI réelle. Tant qu'un compte marchand CMI n'existe pas, ce provider
lève une erreur claire au lieu d'échouer silencieusement. Voir
`context/feature-specs/01-billing-subscriptions/api.md` (Open
Questions) : à valider/corriger contre le vrai guide d'intégration CMI avant
mise en production.

Tout ce qui est spécifique à CMI est piloté par variables d'environnement
(CMI_*, voir app/config/settings.py) -- aucune valeur en dur, pas de code à
changer une fois les vrais identifiants marchand obtenus, seulement le .env.
"""
import hashlib
import hmac
import logging
import uuid

from app.billing.provider.base import CheckoutSession, PaymentProvider, WebhookEvent
from app.config.settings import get_settings

logger = logging.getLogger(__name__)


class CMINotConfiguredError(RuntimeError):
    pass


class CMIProvider(PaymentProvider):
    @property
    def provider_name(self) -> str:
        return "cmi"

    def _require_config(self) -> None:
        s = get_settings()
        if not s.cmi_merchant_id or not s.cmi_store_key or not s.cmi_api_url:
            raise CMINotConfiguredError(
                "CMI n'est pas configuré (CMI_MERCHANT_ID / CMI_STORE_KEY / CMI_API_URL "
                "manquants). Le checkout ne peut pas démarrer tant que le compte "
                "marchand CMI n'est pas mis en place."
            )

    async def create_checkout(self, org_id: str, plan_code: str) -> CheckoutSession:
        self._require_config()
        s = get_settings()

        # "__" comme séparateur (pas "-") : org_id est lui-même un UUID plein de tirets
        # internes, un split naïf sur "-" ne récupérerait qu'un fragment de l'org_id réel.
        order_id = f"sub__{plan_code}__{org_id}__{uuid.uuid4().hex[:12]}"

        # Placeholder : la forme exacte des champs signés (noms, ordre, montant
        # en centimes ou unités, devise) doit être confirmée contre le guide
        # d'intégration CMI réel. Le principe -- concaténer les champs de la
        # requête + une clé secrète marchand, hasher, joindre le hash à la
        # requête -- est le pattern standard de ce type de passerelle.
        fields = {
            "clientid": s.cmi_merchant_id,
            "oid": order_id,
            "okUrl": s.cmi_ok_url,
            "failUrl": s.cmi_fail_url,
            "callbackUrl": s.cmi_callback_url,
        }
        fields["hash"] = self._sign(fields, s.cmi_store_key)

        redirect_url = f"{s.cmi_api_url}?{'&'.join(f'{k}={v}' for k, v in fields.items())}"

        logger.info("CMI checkout créé org=%s plan=%s order_id=%s", org_id, plan_code, order_id)
        return CheckoutSession(redirect_url=redirect_url, provider_ref=order_id)

    def parse_webhook(self, headers: dict, raw_body: bytes) -> WebhookEvent | None:
        s = get_settings()
        if not s.cmi_store_key:
            return None

        try:
            import json
            payload = json.loads(raw_body)
        except ValueError:
            return None

        received_hash = payload.get("hash", "")
        expected_hash = self._sign(
            {k: v for k, v in payload.items() if k != "hash"}, s.cmi_store_key
        )
        if not hmac.compare_digest(received_hash, expected_hash):
            logger.warning("CMI webhook signature invalide, event ignoré")
            return None

        order_id = payload.get("oid", "")
        parts = order_id.split("__")
        if len(parts) != 4 or parts[0] != "sub":
            logger.warning("CMI webhook oid inattendu: %s", order_id)
            return None
        _, plan_code, org_id, _ = parts

        success = payload.get("procReturnCode") == "00" or payload.get("status") == "success"

        return WebhookEvent(
            provider_event_id=payload.get("transId", order_id),
            org_id=org_id,
            plan_code=plan_code,
            event_type="payment_succeeded" if success else "payment_failed",
            period_end=None,  # calculé par SubscriptionService.activate (plan mensuel)
            raw=payload,
        )

    @staticmethod
    def _sign(fields: dict, store_key: str) -> str:
        """Placeholder HMAC-SHA512 sur les champs triés + clé marchand. Algorithme
        exact (SHA1 vs SHA512, ordre des champs, encodage) à confirmer contre le
        guide d'intégration CMI réel avant tout paiement en production."""
        concatenated = "".join(str(fields[k]) for k in sorted(fields)) + store_key
        return hmac.new(store_key.encode(), concatenated.encode(), hashlib.sha512).hexdigest()
