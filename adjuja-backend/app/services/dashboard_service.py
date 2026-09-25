"""Tuiles de résumé et calendrier du tableau de bord.

Voir `context/feature-spec/dashboard-collaboratif/api.md`.

Le calendrier agrège deux sources et une seule requête par source : les dates
limites des AO de l'organisation et les échéances des tâches. Aucune table
d'événements n'existe en v1, les jalons personnalisés viendront plus tard.

Les dates sont des chaînes ISO, comparées sur leurs 10 premiers caractères : une
date limite vaut tantôt « 2026-10-06 », tantôt un horodatage complet selon la
source (veille ou saisie manuelle), et une comparaison brute de chaînes ferait
passer « 2026-10-06T09:00 » pour postérieur à « 2026-10-06 ».
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from app.db.base import AsyncSessionLocal
from app.db.models import AoPipelineStep, AppelOffre
from app.models.dashboard import (
    AtRiskItem,
    AtRiskOut,
    CalendarEvent,
    DashboardSummary,
    NextDeadline,
    PendingValidationItem,
    PendingValidationsOut,
)
from app.services import task_service

logger = logging.getLogger(__name__)

# Fenêtre maximale d'un appel calendrier. Sans borne, ouvrir le mois ramènerait
# tout l'historique de l'organisation.
MAX_WINDOW_DAYS = 92

# Un AO clos n'a plus d'échéance à tenir : l'afficher encombrerait le calendrier.
STATUTS_ACTIFS = ("brouillon", "en_attente", "en_analyse", "en_traitement")


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


class CalendarError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _parse_window(date_from: str, date_to: str) -> tuple[str, str]:
    try:
        debut = date.fromisoformat(date_from[:10])
        fin = date.fromisoformat(date_to[:10])
    except ValueError:
        raise CalendarError(400, "Dates attendues au format AAAA-MM-JJ.")
    if fin < debut:
        raise CalendarError(400, "La date de fin précède la date de début.")
    if fin - debut > timedelta(days=MAX_WINDOW_DAYS):
        raise CalendarError(400, f"Fenêtre limitée à {MAX_WINDOW_DAYS} jours.")
    return debut.isoformat(), fin.isoformat()


async def calendar(org_id: str, date_from: str, date_to: str) -> list[CalendarEvent]:
    debut, fin = _parse_window(date_from, date_to)
    evenements: list[CalendarEvent] = []

    async with AsyncSessionLocal() as session:
        aos = (await session.execute(
            select(AppelOffre).where(
                AppelOffre.org_id == org_id,
                AppelOffre.date_limite.is_not(None),
                func.substr(AppelOffre.date_limite, 1, 10) >= debut,
                func.substr(AppelOffre.date_limite, 1, 10) <= fin,
            )
        )).scalars().all()

        for ao in aos:
            evenements.append(CalendarEvent(
                date=(ao.date_limite or "")[:10],
                type="ao_deadline",
                titre=ao.objet or ao.reference or "Appel d'offres",
                statut=ao.statut,
                ao_id=ao.id,
            ))

        for tache in await task_service.list_between(session, org_id, debut, fin):
            evenements.append(CalendarEvent(
                date=(tache.echeance or "")[:10],
                type="task",
                titre=tache.titre,
                statut=tache.statut,
                ao_id=tache.ao_id,
                task_id=tache.id,
            ))

    evenements.sort(key=lambda e: (e.date, e.type))
    return evenements


async def summary(org_id: str, user_id: str) -> DashboardSummary:
    aujourdhui = _today()

    async with AsyncSessionLocal() as session:
        lignes = (await session.execute(
            select(AppelOffre.statut, func.count())
            .where(AppelOffre.org_id == org_id)
            .group_by(AppelOffre.statut)
        )).all()
        par_statut = {statut: nombre for statut, nombre in lignes}

        ouvertes = await task_service.count_open(session, org_id)
        miennes = await task_service.count_open(session, org_id, user_id)
        en_retard = await task_service.count_overdue(session, org_id, aujourdhui)

        prochaine = await _next_deadline(session, org_id, aujourdhui)

    return DashboardSummary(
        ao_par_statut=par_statut,
        ao_total=sum(par_statut.values()),
        taches_ouvertes=ouvertes,
        mes_taches_ouvertes=miennes,
        taches_en_retard=en_retard,
        prochaine_echeance=prochaine,
    )


async def _next_deadline(session, org_id: str, aujourdhui: str) -> NextDeadline | None:
    """La première échéance à venir, AO ou tâche confondus. Deux requêtes bornées
    à une ligne chacune plutôt qu'un chargement complet trié en Python."""
    ao = (await session.execute(
        select(AppelOffre).where(
            AppelOffre.org_id == org_id,
            AppelOffre.statut.in_(STATUTS_ACTIFS),
            AppelOffre.date_limite.is_not(None),
            func.substr(AppelOffre.date_limite, 1, 10) >= aujourdhui,
        ).order_by(func.substr(AppelOffre.date_limite, 1, 10).asc()).limit(1)
    )).scalar_one_or_none()

    taches = await task_service.list_between(session, org_id, aujourdhui, "9999-12-31")
    tache = next((t for t in taches if t.statut in task_service.OPEN_STATUTS), None)

    candidats: list[NextDeadline] = []
    if ao:
        candidats.append(NextDeadline(
            date=(ao.date_limite or "")[:10],
            titre=ao.objet or ao.reference or "Appel d'offres",
            type="ao_deadline",
            ao_id=ao.id,
        ))
    if tache:
        candidats.append(NextDeadline(
            date=(tache.echeance or "")[:10],
            titre=tache.titre,
            type="task",
            ao_id=tache.ao_id,
            task_id=tache.id,
        ))

    return min(candidats, key=lambda c: c.date) if candidats else None


# --------------------------------------------------------------------------- #
#  Risque d'échéance                                                           #
# --------------------------------------------------------------------------- #
#
# Voir `context/feature-spec/dashboard-risque-validations/00-overview.md`.
#
# Le risque n'est pas la date limite seule : un AO à rendre dans deux jours et
# terminé à 95 % va bien, le même à 20 % est perdu. Ce qui compte est l'écart
# entre le temps consommé et le travail fait.

# Sous ce seuil de progression, un AO proche de sa date limite est signalé même
# si sa marge reste bonne : un dossier créé très en avance garde une marge
# flatteuse jusqu'au dernier moment, parce que sa fenêtre est large.
PRESQUE_FINI = 0.9

JOURS_CRITIQUE = 2
JOURS_TENDU = 7
MARGE_CRITIQUE = -0.35
MARGE_TENDUE = -0.15

# Étapes déjà acquises : elles comptent dans la progression d'un AO accompagné.
STEPS_ACQUISES = ("validee", "non_applicable")

# Ordre d'affichage. Le tri secondaire est le nombre de jours restants.
ORDRE_NIVEAU = {"en_retard": 0, "critique": 1, "tendu": 2}


def _jour(valeur: str | None) -> str:
    """Les dates arrivent tantôt en AAAA-MM-JJ, tantôt en horodatage complet
    selon la source (veille ou saisie manuelle)."""
    return (valeur or "")[:10]


def progression(ao: AppelOffre, etapes: list[AoPipelineStep]) -> float:
    """Avancement réel de 0 à 1, calculé selon le mode.

    `pipeline_pct` est fidèle en mode express : c'est l'avancement de la chaîne
    Celery. En mode accompagné il ne l'est pas -- les tâches de fond peuvent
    avoir tourné pendant que le dossier attend depuis six jours qu'un humain
    valide une étape. Prendre `pipeline_pct` pour les deux ferait passer pour
    sain exactement le cas qu'on cherche à détecter.

    Une étape dont `applicable` vaut None (redaction/remplissage avant
    l'analyse) compte au dénominateur : tant qu'on ne sait pas, on ne retire pas
    de travail du total.
    """
    if ao.mode != "accompagne":
        return min(max((ao.pipeline_pct or 0) / 100, 0.0), 1.0)

    retenues = [e for e in etapes if e.applicable is not False]
    if not retenues:
        # Les lignes d'étapes ne sont pas encore créées : le seul signal
        # disponible reste pipeline_pct.
        return min(max((ao.pipeline_pct or 0) / 100, 0.0), 1.0)

    faites = sum(1 for e in retenues if e.statut in STEPS_ACQUISES)
    return faites / len(retenues)


def _marge(cree_le: str, echeance: str, avance: float, aujourdhui: date) -> float:
    """Avance acquise moins temps consommé. Négatif = en retard sur le rythme.

    Une fenêtre nulle ou négative (AO créé après sa propre date limite, ce que
    l'import de la veille peut produire) vaut temps consommé maximal : il n'y a
    jamais eu de marge.
    """
    try:
        debut = date.fromisoformat(_jour(cree_le))
    except ValueError:
        return 0.0

    fin = date.fromisoformat(echeance)
    fenetre = (fin - debut).days
    if fenetre <= 0:
        return round(avance - 1.0, 2)

    temps = (aujourdhui - debut).days / fenetre
    return round(avance - min(max(temps, 0.0), 1.0), 2)


def _niveau(jours: int, avance: float, marge: float) -> str | None:
    """Le niveau affiché, ou None quand l'AO va bien -- il n'a alors rien à faire
    dans une liste de ce qui va mal."""
    if jours < 0:
        return "en_retard"
    if (jours <= JOURS_CRITIQUE and avance < PRESQUE_FINI) or marge <= MARGE_CRITIQUE:
        return "critique"
    if (jours <= JOURS_TENDU and avance < PRESQUE_FINI) or marge <= MARGE_TENDUE:
        return "tendu"
    return None


async def at_risk(org_id: str, limit: int = 10) -> AtRiskOut:
    """Les AO dont l'échéance approche plus vite que le dossier n'avance.

    Deux requêtes : les AO actifs de l'organisation, puis leurs étapes en un
    seul IN. Charger les étapes AO par AO ferait N+1 requêtes pour un écran
    d'accueil.
    """
    aujourdhui = date.fromisoformat(_today())

    async with AsyncSessionLocal() as session:
        aos = (await session.execute(
            select(AppelOffre).where(
                AppelOffre.org_id == org_id,
                AppelOffre.statut.in_(STATUTS_ACTIFS),
            )
        )).scalars().all()

        avec_echeance = [ao for ao in aos if _jour(ao.date_limite)]
        sans_echeance = len(aos) - len(avec_echeance)

        # Seul le mode accompagné a besoin de ses étapes.
        ids_accompagnes = [ao.id for ao in avec_echeance if ao.mode == "accompagne"]
        etapes_par_ao: dict[str, list[AoPipelineStep]] = {}
        if ids_accompagnes:
            lignes = (await session.execute(
                select(AoPipelineStep).where(AoPipelineStep.ao_id.in_(ids_accompagnes))
            )).scalars().all()
            for etape in lignes:
                etapes_par_ao.setdefault(etape.ao_id, []).append(etape)

    items: list[AtRiskItem] = []
    for ao in avec_echeance:
        echeance = _jour(ao.date_limite)
        try:
            jours = (date.fromisoformat(echeance) - aujourdhui).days
        except ValueError:
            # Date illisible en base : on ne peut rien en conclure, et inventer
            # un risque serait pire que de l'ignorer.
            logger.warning("AO %s : date_limite illisible (%r)", ao.id, ao.date_limite)
            continue

        etapes = sorted(etapes_par_ao.get(ao.id, []), key=lambda e: e.step_order)
        avance = progression(ao, etapes)
        marge = _marge(ao.created_at, echeance, avance, aujourdhui)
        niveau = _niveau(jours, avance, marge)
        if niveau is None:
            continue

        bloquante = next(
            (e.step_key for e in etapes if e.statut not in STEPS_ACQUISES), None
        ) if ao.mode == "accompagne" else None

        items.append(AtRiskItem(
            ao_id=ao.id,
            reference=ao.reference or "",
            objet=ao.objet or "",
            acheteur=ao.acheteur or "",
            date_limite=echeance,
            jours_restants=jours,
            progression=round(avance * 100),
            marge=marge,
            mode=ao.mode,
            statut=ao.statut,
            niveau=niveau,
            etape_courante=bloquante,
        ))

    items.sort(key=lambda i: (ORDRE_NIVEAU[i.niveau], i.jours_restants))
    return AtRiskOut(items=items[:limit], sans_echeance=sans_echeance)


# --------------------------------------------------------------------------- #
#  Validations en attente                                                      #
# --------------------------------------------------------------------------- #

async def pending_validations(org_id: str, limit: int = 10) -> PendingValidationsOut:
    """Les étapes du mode accompagné qui attendent une validation humaine.

    Triées par ancienneté d'attente : la plus ancienne d'abord, parce que c'est
    elle qui bloque son dossier depuis le plus longtemps.

    Une étape n'a pas d'assigné et l'organisation n'a pas de rôles : on peut dire
    « en attente », jamais « en attente de toi ». Voir la spec.
    """
    aujourdhui = date.fromisoformat(_today())

    async with AsyncSessionLocal() as session:
        lignes = (await session.execute(
            select(AoPipelineStep, AppelOffre)
            .join(AppelOffre, AppelOffre.id == AoPipelineStep.ao_id)
            .where(
                AppelOffre.org_id == org_id,
                AoPipelineStep.statut == "attente_validation",
            )
        )).all()

    items: list[PendingValidationItem] = []
    for etape, ao in lignes:
        depuis = etape.started_at
        attente = 0
        if depuis:
            try:
                attente = max((aujourdhui - date.fromisoformat(_jour(depuis))).days, 0)
            except ValueError:
                logger.warning("Etape %s : started_at illisible (%r)", etape.id, depuis)

        items.append(PendingValidationItem(
            ao_id=ao.id,
            reference=ao.reference or "",
            objet=ao.objet or "",
            step_key=etape.step_key,
            step_order=etape.step_order,
            depuis=depuis,
            jours_attente=attente,
            date_limite=_jour(ao.date_limite) or None,
        ))

    # Le plus longtemps en attente d'abord ; à égalité, l'étape la plus amont.
    items.sort(key=lambda i: (-i.jours_attente, i.step_order))
    return PendingValidationsOut(items=items[:limit], total=len(items))
