"""Comptes, organisations, abonnements et accès, vus par l'administration.

Voir `context/feature-spec/admin-panel/api.md`, section 2 bis.

Unité : l'organisation **effective**. Un utilisateur seul n'a pas de ligne
`organizations`, son organisation est son id (`org_id or id`, patron de tout
le code) : les utilisateurs sont regroupés par `COALESCE(users.org_id,
users.id)`.

Règle de sûreté : un administrateur (adresse de ADMIN_EMAILS) ne peut être ni
suspendu ni supprimé depuis le panneau, et personne ne peut se suspendre
soi-même. Sinon un clic verrouille l'administration dehors.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text, update

from app.billing.plans import PLANS, get_plan
from app.config.settings import Settings
from app.db.base import AsyncSessionLocal
from app.db.models import User
from app.models.admin import (
    AbonnementDetail,
    AbonnementLigne,
    AccesAdmin,
    AccesOut,
    Consommation,
    DossierResume,
    Membre,
    OrganisationDetail,
    OrganisationLigne,
    OrganisationsPage,
)
from app.models.user import UserPublic
from app.services.admin.acces import adresse_admin
from app.services.admin.actions import ActionErreur, journaliser
from app.services.subscription_service import SubscriptionService

logger = logging.getLogger(__name__)

PAR_PAGE = 25
JOURS_ACTIVITE = 30
ETATS = ("actif", "inactif", "suspendu")


def _maintenant() -> datetime:
    return datetime.now(timezone.utc)


def debut_du_mois(maintenant: datetime) -> str:
    return maintenant.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


# Organisations effectives : une ligne par clé COALESCE(org_id, id), avec son
# propriétaire (celui de `organizations`, ou l'utilisateur seul lui-même).
_ORGANISATIONS = """
    WITH membres AS (
        SELECT COALESCE(u.org_id, u.id)          AS org_key,
               COUNT(*)                          AS membres,
               MAX(u.last_login_at)              AS derniere_connexion,
               BOOL_AND(u.disabled_at IS NOT NULL) AS suspendue,
               STRING_AGG(LOWER(u.email), ' ')   AS emails
        FROM users u
        GROUP BY 1
    ), dossiers AS (
        SELECT org_id,
               COUNT(*)                                      AS total,
               COUNT(*) FILTER (WHERE created_at >= :debut_mois) AS mois
        FROM appels_offres
        GROUP BY org_id
    )
    SELECT m.org_key                                          AS org_id,
           COALESCE(NULLIF(o.name, ''), NULLIF(p.entreprise, ''),
                    TRIM(p.prenom || ' ' || p.nom))           AS nom,
           p.email                                            AS proprietaire_email,
           m.membres, m.derniere_connexion, m.suspendue, m.emails,
           COALESCE(s.plan_code, 'free')                      AS offre,
           s.status                                           AS statut_abonnement,
           s.current_period_end                               AS echeance,
           COALESCE(d.mois, 0)                                AS dossiers_mois,
           COALESCE(d.total, 0)                               AS dossiers_total,
           COALESCE(o.created_at, p.created_at)               AS creee_le
    FROM membres m
    LEFT JOIN organizations o ON o.id = m.org_key
    JOIN users p              ON p.id = COALESCE(o.owner_id, m.org_key)
    LEFT JOIN subscriptions s ON s.org_id = m.org_key
    LEFT JOIN dossiers d      ON d.org_id = m.org_key
"""


def filtres_organisations(
    recherche: str | None, offre: str | None, etat: str | None, depuis_activite: str,
) -> tuple[str, dict[str, Any]]:
    """Clause WHERE et paramètres. Les fragments sont des constantes ; toute
    saisie passe par des paramètres liés."""
    conditions: list[str] = []
    params: dict[str, Any] = {}
    if recherche and recherche.strip():
        conditions.append("(LOWER(nom) LIKE :recherche OR emails LIKE :recherche)")
        params["recherche"] = f"%{recherche.strip().lower()}%"
    if offre:
        conditions.append("offre = :offre")
        params["offre"] = offre
    if etat == "suspendu":
        conditions.append("suspendue")
    elif etat == "actif":
        conditions.append("NOT suspendue AND derniere_connexion >= :depuis")
        params["depuis"] = depuis_activite
    elif etat == "inactif":
        conditions.append("NOT suspendue AND (derniere_connexion IS NULL OR derniere_connexion < :depuis)")
        params["depuis"] = depuis_activite
    return ("WHERE " + " AND ".join(conditions)) if conditions else "", params


async def liste_organisations(
    recherche: str | None, offre: str | None, etat: str | None, page: int,
) -> OrganisationsPage:
    maintenant = _maintenant()
    where, params = filtres_organisations(
        recherche, offre, etat, (maintenant - timedelta(days=JOURS_ACTIVITE)).isoformat(),
    )
    params["debut_mois"] = debut_du_mois(maintenant)
    base = f"SELECT * FROM ({_ORGANISATIONS}) org {where}"
    async with AsyncSessionLocal() as db:
        total = (await db.execute(text(f"SELECT COUNT(*) FROM ({base}) t"), params)).scalar_one()
        lignes = (await db.execute(
            text(f"{base} ORDER BY creee_le DESC LIMIT :limite OFFSET :decalage"),
            {**params, "limite": PAR_PAGE, "decalage": (page - 1) * PAR_PAGE},
        )).mappings().all()
    return OrganisationsPage(total=total, page=page, par_page=PAR_PAGE, items=[
        OrganisationLigne(**{k: v for k, v in l.items() if k != "emails"}) for l in lignes
    ])


async def detail_organisation(org_id: str, settings: Settings) -> OrganisationDetail:
    maintenant = _maintenant()
    async with AsyncSessionLocal() as db:
        ligne = (await db.execute(
            text(f"SELECT * FROM ({_ORGANISATIONS}) org WHERE org_id = :org_id"),
            {"org_id": org_id, "debut_mois": debut_du_mois(maintenant)},
        )).mappings().first()
        if ligne is None:
            raise ActionErreur(404, "Organisation introuvable.")
        proprietaire = ligne["proprietaire_email"]
        membres = (await db.execute(
            select(User).where(text("COALESCE(users.org_id, users.id) = :org_id")).params(org_id=org_id)
            .order_by(User.created_at)
        )).scalars().all()
        subs = SubscriptionService(db)
        abo = await subs.get_row(org_id)
        usage = await subs.get_usage_summary(org_id)
        par_statut = dict((await db.execute(
            text("SELECT statut, COUNT(*) FROM appels_offres WHERE org_id = :o GROUP BY statut"), {"o": org_id}
        )).all())
        derniers = (await db.execute(text(
            "SELECT id, reference, objet, statut, created_at FROM appels_offres "
            "WHERE org_id = :o ORDER BY created_at DESC LIMIT 5"
        ), {"o": org_id})).mappings().all()
        generations = (await db.execute(text(
            "SELECT COUNT(*) FROM launches WHERE created_at >= :depuis AND (org_id = :o OR user_id IN "
            "(SELECT id FROM users WHERE COALESCE(org_id, id) = :o))"
        ), {"o": org_id, "depuis": (maintenant - timedelta(days=30)).isoformat()})).scalar_one()

    plan = get_plan(abo.plan_code if abo else "free")
    return OrganisationDetail(
        org_id=org_id, nom=ligne["nom"], creee_le=ligne["creee_le"],
        membres=[
            Membre(
                id=u.id, nom=f"{u.prenom} {u.nom}".strip(), email=u.email, email_verifie=u.email_verified,
                cree_le=u.created_at, derniere_connexion=u.last_login_at, suspendu_le=u.disabled_at,
                admin=adresse_admin(u.email, settings), proprietaire=u.email == proprietaire,
            )
            for u in membres
        ],
        abonnement=AbonnementDetail(
            offre=plan.code, libelle=plan.label, prix_mensuel_mad=plan.price_mad,
            statut=abo.status if abo else None, echeance=abo.current_period_end if abo else None,
            fin_de_grace=abo.grace_until if abo else None, fournisseur=abo.provider if abo else None,
        ),
        dossiers_mois=Consommation(utilise=usage["ao_per_month"]["used"], limite=usage["ao_per_month"]["limit"]),
        documents=Consommation(utilise=usage["documents"]["used"], limite=usage["documents"]["limit"]),
        membres_limite=plan.max_users,
        dossiers_par_statut=par_statut,
        derniers_dossiers=[
            DossierResume(id=d["id"], reference=d["reference"] or "", objet=d["objet"] or "",
                          statut=d["statut"], cree_le=d["created_at"])
            for d in derniers
        ],
        generations_30j=generations,
    )


def echeance_apres(maintenant: datetime, duree_mois: int) -> str:
    """Fin de période : `duree_mois` périodes de 30 jours, la durée d'une
    période payée par CMI (billing_routes, webhook)."""
    return (maintenant + timedelta(days=30 * duree_mois)).isoformat()


async def changer_offre(
    admin: UserPublic, org_id: str, plan_code: str, duree_mois: int, settings: Settings,
) -> OrganisationDetail:
    if plan_code not in PLANS:
        raise ActionErreur(400, "Offre inconnue.")
    async with AsyncSessionLocal() as db:
        existe = (await db.execute(
            text("SELECT 1 FROM users WHERE COALESCE(org_id, id) = :o LIMIT 1"), {"o": org_id}
        )).first()
        if existe is None:
            raise ActionErreur(404, "Organisation introuvable.")
        subs = SubscriptionService(db)
        if plan_code == "free":
            await subs.downgrade_to_free(org_id)
            echeance = None
        else:
            echeance = echeance_apres(_maintenant(), duree_mois)
            await subs.activate(org_id, plan_code, provider="manual", provider_ref=None, period_end=echeance)
    await journaliser(
        admin, "changer-offre", {"org_id": org_id, "plan_code": plan_code, "duree_mois": duree_mois},
        "termine", resultat={"echeance": echeance}, module="abonnements",
    )
    logger.info("Offre changée par l'administration  admin=%s org=%s plan=%s", admin.email, org_id, plan_code)
    return await detail_organisation(org_id, settings)


async def _cible_modifiable(admin: UserPublic, user_id: str, settings: Settings) -> User:
    async with AsyncSessionLocal() as db:
        cible = await db.get(User, user_id)
    if cible is None:
        raise ActionErreur(404, "Compte introuvable.")
    if cible.id == admin.id:
        raise ActionErreur(400, "Vous ne pouvez pas modifier votre propre compte depuis le panneau.")
    if adresse_admin(cible.email, settings):
        raise ActionErreur(400, "Un compte administrateur ne se suspend pas depuis le panneau : retirez-le d'abord de ADMIN_EMAILS.")
    return cible


async def suspendre(admin: UserPublic, user_id: str, raison: str, settings: Settings) -> None:
    cible = await _cible_modifiable(admin, user_id, settings)
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(User).where(User.id == user_id, User.disabled_at.is_(None))
            .values(disabled_at=_maintenant().isoformat())
        )
        await db.commit()
    await journaliser(
        admin, "suspendre", {"user_id": user_id, "email": cible.email, "raison": raison},
        "termine", module="comptes",
    )
    logger.warning("Compte suspendu par l'administration  admin=%s cible=%s", admin.email, cible.email)


async def reactiver(admin: UserPublic, user_id: str, settings: Settings) -> None:
    cible = await _cible_modifiable(admin, user_id, settings)
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == user_id).values(disabled_at=None))
        await db.commit()
    await journaliser(admin, "reactiver", {"user_id": user_id, "email": cible.email}, "termine", module="comptes")
    logger.info("Compte réactivé par l'administration  admin=%s cible=%s", admin.email, cible.email)


async def liste_abonnements(statut: str | None) -> list[AbonnementLigne]:
    filtre = "WHERE s.status = :statut" if statut else ""
    async with AsyncSessionLocal() as db:
        lignes = (await db.execute(text(f"""
            SELECT s.org_id, s.plan_code, s.status, s.current_period_end, s.grace_until,
                   s.provider, s.updated_at,
                   COALESCE(NULLIF(o.name, ''), NULLIF(p.entreprise, ''), TRIM(p.prenom || ' ' || p.nom), s.org_id) AS nom
            FROM subscriptions s
            LEFT JOIN organizations o ON o.id = s.org_id
            LEFT JOIN users p ON p.id = COALESCE(o.owner_id, s.org_id)
            {filtre}
            ORDER BY s.current_period_end ASC NULLS LAST
        """), {"statut": statut})).mappings().all()
    return [
        AbonnementLigne(
            org_id=l["org_id"], nom=l["nom"], offre=l["plan_code"], statut=l["status"],
            echeance=l["current_period_end"], fin_de_grace=l["grace_until"],
            fournisseur=l["provider"], mis_a_jour=l["updated_at"],
        )
        for l in lignes
    ]


async def acces(settings: Settings) -> AccesOut:
    emails = sorted({e.strip().lower() for e in settings.admin_emails if e.strip()})
    async with AsyncSessionLocal() as db:
        comptes = {
            u.email.lower(): u for u in (await db.execute(
                select(User).where(text("LOWER(users.email) = ANY(:emails)")).params(emails=emails)
            )).scalars().all()
        } if emails else {}
    administrateurs = []
    for email in emails:
        u = comptes.get(email)
        administrateurs.append(AccesAdmin(
            email=email, compte_existe=u is not None,
            email_verifie=bool(u and u.email_verified),
            derniere_connexion=u.last_login_at if u else None,
            actif=bool(u and u.email_verified and u.disabled_at is None),
        ))
    autorisees = sorted({e.strip().lower() for e in settings.allowed_emails if e.strip()})
    return AccesOut(
        administrateurs=administrateurs,
        inscription_sur_invitation=bool(autorisees),
        adresses_autorisees=autorisees,
    )
