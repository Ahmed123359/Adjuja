"""Suivi d'un dossier après dépôt : lecture, enregistrement, classement prévu.

Spec : context/feature-spec/suivi-resultats/00-overview.md (phase 1). Le calcul
lui-même est dans `attribution.py` (fonction pure) ; ce module lit et écrit
`ao_suivi` et `ao_offres_concurrentes`, et vérifie que le dossier appartient à
l'organisation de l'appelant.
"""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, select, text

from app.db.base import AsyncSessionLocal
from app.db.models import AoOffreConcurrente, AoSuivi, AppelOffre, CompanyProfile
from app.models.suivi import ClassementOut, OffreIn, OffreOut, SuiviIn, SuiviOut
from app.services import attribution

logger = logging.getLogger(__name__)

PREFIXE_VEILLE = "watcher-"

# Catégorie publiée par le portail -> nature du marché (suggestion seulement :
# un marché de services d'études se publie aussi en « Services »).
NATURE_PAR_CATEGORIE = {"travaux": "travaux", "fournitures": "fournitures", "services": "services"}


class SuiviIntrouvable(Exception):
    """Dossier absent ou d'une autre organisation : 404 dans les deux cas,
    pour ne pas révéler l'existence d'un dossier d'autrui."""


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


def montant_retenu(o: AoOffreConcurrente | OffreIn) -> Decimal | None:
    """Le montant corrigé par la commission prime sur le montant lu."""
    return o.montant_corrige if o.montant_corrige is not None else o.montant_lu


def nature_depuis_categorie(categorie: str | None) -> str | None:
    if not categorie:
        return None
    return NATURE_PAR_CATEGORIE.get(categorie.strip().lower())


def construire_classement(suivi: AoSuivi | None, lignes: list[AoOffreConcurrente]) -> tuple[ClassementOut | None, list[OffreOut]]:
    """Classement prévu et offres enrichies de leur issue de calcul."""
    offres_out = [
        OffreOut(
            id=l.id, nom=l.nom, est_nous=l.est_nous, montant_lu=l.montant_lu, montant_corrige=l.montant_corrige,
            statut=l.statut, motif=l.motif, note_technique=l.note_technique,
        )
        for l in lignes
    ]
    if suivi is None:
        return None, offres_out

    res = attribution.classer(
        suivi.nature_marche,
        suivi.estimation_mad,
        [attribution.Offre(l.id, l.nom, montant_retenu(l), l.statut, l.est_nous, l.note_technique) for l in lignes],
        poids_financier=suivi.poids_financier,
        seuil_technique=suivi.seuil_technique,
    )
    par_id = {e.id: e for e in res.offres}
    for o in offres_out:
        e = par_id[o.id]
        o.issue = e.issue if res.calculable or e.issue != "retenue" else None
        o.rang, o.gagnante = e.rang, e.gagnante
        o.ecart_reference_pct, o.taux_majoration_pct = e.ecart_reference_pct, e.taux_majoration_pct
        o.note_financiere, o.note_globale = e.note_financiere, e.note_globale

    nous = next((o for o in offres_out if o.est_nous), None)
    gagnante = next((o for o in offres_out if o.gagnante), None)
    ecart = None
    if nous and gagnante and nous.id != gagnante.id:
        m_nous, m_gagnante = montant_retenu(nous), montant_retenu(gagnante)
        if m_nous is not None and m_gagnante is not None:
            ecart = m_nous - m_gagnante
    return ClassementOut(
        calculable=res.calculable, raison=res.raison, prix_reference=res.prix_reference,
        gagnante_id=res.gagnante_id, avertissements=res.avertissements,
        notre_rang=nous.rang if nous else None, ecart_avec_gagnante=ecart,
    ), offres_out


async def _dossier(db, ao_id: str, org_id: str) -> AppelOffre:
    ao = await db.get(AppelOffre, ao_id)
    if ao is None or ao.org_id != org_id:
        raise SuiviIntrouvable()
    return ao


async def _suggestions(db, ao: AppelOffre) -> tuple[Decimal | None, str | None]:
    """Estimation et nature depuis la veille, pour un dossier qui en vient.
    Même base, schéma `watcher` (lecture seule, comme le tableau de bord)."""
    if not (ao.reference or "").startswith(PREFIXE_VEILLE):
        return None, None
    try:
        scraped_id = int(ao.reference[len(PREFIXE_VEILLE):])
        ligne = (await db.execute(
            text("SELECT budget_estime, categorie FROM watcher.scraped_aos WHERE id = :id"), {"id": scraped_id}
        )).first()
    except Exception:  # identifiant illisible, ou schéma de la veille absent
        return None, None
    if ligne is None:
        return None, None
    return ligne[0], nature_depuis_categorie(ligne[1])


async def _nom_entreprise(db, org_id: str) -> str:
    profil = (await db.execute(select(CompanyProfile).where(CompanyProfile.org_id == org_id))).scalar_one_or_none()
    return (profil.nom_entreprise if profil else "") or ""


def _suivi_in(s: AoSuivi) -> SuiviIn:
    return SuiviIn(
        nature_marche=s.nature_marche, estimation_mad=s.estimation_mad, poids_financier=s.poids_financier,
        seuil_technique=s.seuil_technique, date_depot=s.date_depot, date_ouverture=s.date_ouverture,
        statut_final=s.statut_final, attributaire=s.attributaire, montant_attribue=s.montant_attribue,
    )


async def _lignes(db, ao_id: str) -> list[AoOffreConcurrente]:
    return list((await db.execute(
        select(AoOffreConcurrente).where(AoOffreConcurrente.ao_id == ao_id)
        .order_by(AoOffreConcurrente.ordre, AoOffreConcurrente.created_at)
    )).scalars().all())


async def lire(ao_id: str, org_id: str) -> SuiviOut:
    async with AsyncSessionLocal() as db:
        ao = await _dossier(db, ao_id, org_id)
        suivi = await db.get(AoSuivi, ao_id)
        lignes = await _lignes(db, ao_id)
        estimation, nature = await _suggestions(db, ao)
        nom = await _nom_entreprise(db, org_id)
    classement, offres = construire_classement(suivi, lignes)
    return SuiviOut(
        ouvert=suivi is not None, suivi=_suivi_in(suivi) if suivi else None, offres=offres,
        classement=classement, estimation_suggeree=estimation, nature_suggeree=nature, nom_entreprise=nom,
    )


async def enregistrer(ao_id: str, org_id: str, user_id: str, data: SuiviIn) -> SuiviOut:
    """Crée le suivi au premier enregistrement (« marquer comme déposé ») et y
    ajoute notre propre offre, au nom de l'entreprise ; ensuite, le remplace."""
    maintenant = _maintenant()
    async with AsyncSessionLocal() as db:
        ao = await _dossier(db, ao_id, org_id)
        suivi = await db.get(AoSuivi, ao_id)
        if suivi is None:
            suivi = AoSuivi(ao_id=ao_id, created_at=maintenant, updated_at=maintenant)
            db.add(suivi)
            if not await _lignes(db, ao_id):
                db.add(AoOffreConcurrente(
                    id=str(uuid.uuid4()), ao_id=ao_id, nom=await _nom_entreprise(db, org_id) or "Notre offre",
                    est_nous=True, statut="en_attente", ordre=0, created_at=maintenant,
                ))
            logger.info("Suivi ouvert  ao_id=%s org=%s", ao.id, org_id)
        for champ, valeur in data.model_dump().items():
            setattr(suivi, champ, valeur)
        if suivi.date_depot is None:
            suivi.date_depot = maintenant
        suivi.updated_at, suivi.updated_by = maintenant, user_id
        await db.commit()
    return await lire(ao_id, org_id)


async def enregistrer_offres(ao_id: str, org_id: str, offres: list[OffreIn]) -> SuiviOut:
    """Remplace le tableau des offres, dans l'ordre reçu. Le suivi doit être
    ouvert : on ne saisit des montants qu'une fois le dossier déposé."""
    maintenant = _maintenant()
    async with AsyncSessionLocal() as db:
        await _dossier(db, ao_id, org_id)
        if await db.get(AoSuivi, ao_id) is None:
            raise SuiviIntrouvable()
        await db.execute(delete(AoOffreConcurrente).where(AoOffreConcurrente.ao_id == ao_id))
        for i, o in enumerate(offres):
            db.add(AoOffreConcurrente(
                id=str(uuid.uuid4()), ao_id=ao_id, nom=o.nom.strip(), est_nous=o.est_nous,
                montant_lu=o.montant_lu, montant_corrige=o.montant_corrige, statut=o.statut,
                motif=o.motif, note_technique=o.note_technique, ordre=i, created_at=maintenant,
            ))
        await db.commit()
    return await lire(ao_id, org_id)
