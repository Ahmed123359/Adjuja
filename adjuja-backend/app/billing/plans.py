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
    price_mad: int                   # tarif mensuel affiché, 0 pour free
    price_mad_annual: int            # tarif mensuel si engagement annuel
    max_users: int | None            # None = illimité
    max_ao_per_month: int | None
    max_documents: int | None
    providers_allowed: tuple[str, ...]
    has_chat: bool
    unlimited_signatures: bool
    has_sso: bool


# Grille revue suite à l'audit du 12/08/2026 (hafid-taches-docs/audit-strategy/
# Adjuja_Audit_Site_Web.docx, constat B2) : l'ancienne grille (Starter 55 MAD, Pro 299
# MAD self-serve, Entreprise sur devis) était structurellement déficitaire sur le premier
# palier et dévalorisait le positionnement expert. Nouvelle grille ancrée sur le coût
# d'une journée de consultant : Essentiel 490, Pro 990, Cabinet 2900 MAD, les trois en
# self-serve. Les `code` internes restent `starter`/`pro`/`enterprise` pour ne pas
# invalider les `Subscription.plan_code` déjà en base, seuls `label` et les tarifs
# changent -- voir context/feature-specs/01-billing-subscriptions/api.md.
PLANS: dict[str, Plan] = {
    "free": Plan(
        code="free", label="Free",
        price_mad=0, price_mad_annual=0,
        max_users=1, max_ao_per_month=0, max_documents=5,
        providers_allowed=("mistral",),
        has_chat=False, unlimited_signatures=False, has_sso=False,
    ),
    "starter": Plan(
        code="starter", label="Essentiel",
        price_mad=490, price_mad_annual=392,
        max_users=1, max_ao_per_month=50, max_documents=50,
        providers_allowed=("mistral",),
        has_chat=False, unlimited_signatures=False, has_sso=False,
    ),
    "pro": Plan(
        code="pro", label="Pro",
        price_mad=990, price_mad_annual=792,
        # Marketé "génération illimitée" mais plafonné en interne (fair-use) : Pro est
        # self-serve (pas de conversation commerciale avant activation), et le plan combine
        # génération vraiment sans limite + providers premium (GPT-4o/Claude, plus chers au
        # token que Mistral) + signatures illimitées. Sans ce filtre, un usage très intensif
        # coûterait plus en appels LLM que le client ne paie. Le plafond de 300/mois a été
        # fixé quand Pro était à 299 MAD ; à 990 MAD la marge par appel est meilleure mais
        # le plafond reste un garde-fou raisonnable tant qu'aucune donnée d'usage réelle ne
        # justifie de le relever, aucun client normal ne devrait jamais l'atteindre.
        max_users=5, max_ao_per_month=300, max_documents=200,
        providers_allowed=("mistral", "openai", "anthropic"),
        has_chat=True, unlimited_signatures=True, has_sso=False,
    ),
    "enterprise": Plan(
        code="enterprise", label="Cabinet",
        price_mad=2900, price_mad_annual=2320,
        max_users=None, max_ao_per_month=None, max_documents=None,
        providers_allowed=("mistral", "openai", "anthropic"),
        has_chat=True, unlimited_signatures=True, has_sso=True,
    ),
}

DEFAULT_PLAN_CODE = "free"
# Les trois plans payants sont désormais tous en self-serve CMI (plus de "sur devis").
SELF_SERVE_PLAN_CODES = ("starter", "pro", "enterprise")


def get_plan(plan_code: str) -> Plan:
    return PLANS.get(plan_code, PLANS[DEFAULT_PLAN_CODE])
