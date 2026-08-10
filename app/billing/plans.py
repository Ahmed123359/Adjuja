from dataclasses import dataclass


@dataclass(frozen=True)
class Plan:
    """Définition d'un plan tarifaire : limites et fonctionnalités activées.

    Config, pas une table DB -- les limites/tarifs changent plus souvent que
    le schéma ne devrait, et il n'y a pas encore de besoin produit d'éditer
    les plans sans déploiement.
    """

    code: str
    label: str
    max_users: int | None            # None = illimité
    max_ao_per_month: int | None
    max_documents: int | None
    providers_allowed: tuple[str, ...]
    has_chat: bool
    unlimited_signatures: bool
    has_sso: bool


PLANS: dict[str, Plan] = {
    "free": Plan(
        code="free", label="Free",
        max_users=1, max_ao_per_month=0, max_documents=5,
        providers_allowed=("mistral",),
        has_chat=False, unlimited_signatures=False, has_sso=False,
    ),
    "starter": Plan(
        code="starter", label="Starter",
        max_users=1, max_ao_per_month=50, max_documents=50,
        providers_allowed=("mistral",),
        has_chat=False, unlimited_signatures=False, has_sso=False,
    ),
    "pro": Plan(
        code="pro", label="Pro",
        # Marketé "génération illimitée" mais plafonné en interne (fair-use) : Pro est
        # self-serve (pas de conversation commerciale avant activation), et le plan combine
        # génération vraiment sans limite + providers premium (GPT-4o/Claude, plus chers au
        # token que Mistral) + signatures illimitées. Sans ce filtre, un usage très intensif
        # coûterait plus en appels LLM que le client ne paie. 300/mois = trèslarge marge
        # au-dessus d'un usage PME réel ("plusieurs AOs par semaine"), invisible en pratique.
        max_users=5, max_ao_per_month=300, max_documents=200,
        providers_allowed=("mistral", "openai", "anthropic"),
        has_chat=True, unlimited_signatures=True, has_sso=False,
    ),
    "enterprise": Plan(
        code="enterprise", label="Entreprise",
        max_users=None, max_ao_per_month=None, max_documents=None,
        providers_allowed=("mistral", "openai", "anthropic"),
        has_chat=True, unlimited_signatures=True, has_sso=True,
    ),
}

DEFAULT_PLAN_CODE = "free"
# Plans achetables via un checkout self-serve (CMI). Seul Enterprise reste "Sur devis"
# (déploiement on-premise, SSO, accompagnement dédié -- nécessite une conversation).
SELF_SERVE_PLAN_CODES = ("starter", "pro")


def get_plan(plan_code: str) -> Plan:
    return PLANS.get(plan_code, PLANS[DEFAULT_PLAN_CODE])
