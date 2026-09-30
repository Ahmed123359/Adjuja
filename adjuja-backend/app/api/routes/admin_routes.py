"""Panneau d'administration de la plateforme.

Voir `context/feature-spec/admin-panel/api.md`. La protection est posée sur le
routeur entier (`require_platform_admin`) : aucune route de ce fichier ne doit
en déclarer une autre, et une route ajoutée plus tard est protégée d'office.
`tests/unit/test_admin_acces.py` le vérifie route par route.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.dependencies import require_platform_admin
from app.config.settings import Settings, get_settings
from app.models.admin import (
    AbonnementLigne,
    AccesOut,
    ActionLancee,
    ActionVeilleIn,
    ChangerOffreIn,
    DceEchecsOut,
    EtatAction,
    JournalAction,
    OrganisationDetail,
    OrganisationsPage,
    SuspensionIn,
    TableauDeBord,
    VeilleSourcesOut,
)
from app.models.user import UserPublic
from app.services.admin import actions, comptes, tableau_de_bord, veille

admin_router = APIRouter(
    prefix="/admin",
    tags=["Administration"],
    dependencies=[Depends(require_platform_admin)],
)


@admin_router.get("/veille/sources", response_model=VeilleSourcesOut)
async def veille_sources(settings: Settings = Depends(get_settings)) -> VeilleSourcesOut:
    return await veille.sources_veille(settings.watcher_scrape_interval_hours)


@admin_router.get("/veille/dce-echecs", response_model=DceEchecsOut)
async def veille_dce_echecs(
    source: str | None = Query(None, max_length=50),
    limite: int = Query(50, ge=1, le=200),
) -> DceEchecsOut:
    return await veille.dce_echecs(source, limite)


@admin_router.post("/veille/actions/{action}", response_model=ActionLancee)
async def veille_lancer_action(
    action: str = Path(..., max_length=50),
    params: ActionVeilleIn | None = None,
    admin: UserPublic = Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> ActionLancee:
    try:
        return await actions.lancer_action_veille(admin, action, params or ActionVeilleIn(), settings)
    except actions.ActionErreur as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@admin_router.get("/veille/taches/{task_id}", response_model=EtatAction)
async def veille_etat_tache(
    task_id: str = Path(..., pattern=r"^[0-9a-f-]{36}$"),
    settings: Settings = Depends(get_settings),
) -> EtatAction:
    try:
        return await actions.etat_action(task_id, settings)
    except actions.ActionErreur as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@admin_router.get("/actions", response_model=list[JournalAction])
async def journal_actions(
    limite: int = Query(50, ge=1, le=200),
    settings: Settings = Depends(get_settings),
) -> list[JournalAction]:
    return await actions.journal(limite, settings)


# ── Tableau de bord, comptes, abonnements, accès ─────────────────────────────

def _http(e: actions.ActionErreur) -> HTTPException:
    return HTTPException(status_code=e.status_code, detail=e.detail)


@admin_router.get("/tableau-de-bord", response_model=TableauDeBord)
async def tableau(settings: Settings = Depends(get_settings)) -> TableauDeBord:
    return await tableau_de_bord.tableau_de_bord(settings.watcher_scrape_interval_hours)


@admin_router.get("/comptes", response_model=OrganisationsPage)
async def liste_comptes(
    recherche: str | None = Query(None, max_length=100),
    offre: str | None = Query(None, pattern=r"^(free|starter|pro|enterprise)$"),
    etat: str | None = Query(None, pattern=r"^(actif|inactif|suspendu)$"),
    page: int = Query(1, ge=1, le=1000),
) -> OrganisationsPage:
    return await comptes.liste_organisations(recherche, offre, etat, page)


@admin_router.get("/comptes/{org_id}", response_model=OrganisationDetail)
async def fiche_compte(
    org_id: str = Path(..., max_length=36),
    settings: Settings = Depends(get_settings),
) -> OrganisationDetail:
    try:
        return await comptes.detail_organisation(org_id, settings)
    except actions.ActionErreur as e:
        raise _http(e)


@admin_router.post("/comptes/{org_id}/offre", response_model=OrganisationDetail)
async def changer_offre(
    body: ChangerOffreIn,
    org_id: str = Path(..., max_length=36),
    admin: UserPublic = Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> OrganisationDetail:
    try:
        return await comptes.changer_offre(admin, org_id, body.plan_code, body.duree_mois, settings)
    except actions.ActionErreur as e:
        raise _http(e)


@admin_router.post("/utilisateurs/{user_id}/suspendre", status_code=204)
async def suspendre(
    body: SuspensionIn,
    user_id: str = Path(..., max_length=36),
    admin: UserPublic = Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> None:
    try:
        await comptes.suspendre(admin, user_id, body.raison, settings)
    except actions.ActionErreur as e:
        raise _http(e)


@admin_router.post("/utilisateurs/{user_id}/reactiver", status_code=204)
async def reactiver(
    user_id: str = Path(..., max_length=36),
    admin: UserPublic = Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> None:
    try:
        await comptes.reactiver(admin, user_id, settings)
    except actions.ActionErreur as e:
        raise _http(e)


@admin_router.get("/abonnements", response_model=list[AbonnementLigne])
async def abonnements(
    statut: str | None = Query(None, pattern=r"^(active|past_due|canceled|trialing)$"),
) -> list[AbonnementLigne]:
    return await comptes.liste_abonnements(statut)


@admin_router.get("/acces", response_model=AccesOut)
async def acces(settings: Settings = Depends(get_settings)) -> AccesOut:
    return await comptes.acces(settings)
