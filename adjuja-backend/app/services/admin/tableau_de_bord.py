"""Tableau de bord de l'administration : l'état de la plateforme en un écran.

Voir `context/feature-spec/admin-panel/api.md`, section 2 bis. Rien d'inventé :
chaque chiffre vient d'une requête sur des données enregistrées. Le revenu est
une **estimation** (tarif affiché des abonnements actifs payants) parce
qu'aucun montant encaissé n'est enregistré.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

from app.billing.plans import get_plan
from app.db.base import AsyncSessionLocal
from app.models.admin import Periode, PointJour, TableauDeBord
from app.services.admin import veille

JOURS_SERIE = 30


def serie_complete(fin: date, jours: int, comptes: dict[str, int]) -> list[PointJour]:
    """Une valeur par jour, zéros compris : un jour sans inscription est une
    information, pas un trou dans le graphique."""
    debut = fin - timedelta(days=jours - 1)
    return [
        PointJour(jour=(j := (debut + timedelta(days=i)).isoformat()), valeur=comptes.get(j, 0))
        for i in range(jours)
    ]


def revenu_estime(abonnements: list[tuple[str, str]]) -> int:
    """(plan_code, statut) -> somme des tarifs mensuels des actifs payants."""
    return sum(get_plan(code).price_mad for code, statut in abonnements if statut == "active")


async def _compter(db, sql: str, **params) -> int:
    return (await db.execute(text(sql), params)).scalar_one()


async def _par_jour(db, table: str, depuis: str) -> dict[str, int]:
    lignes = (await db.execute(text(
        f"SELECT LEFT(created_at, 10) AS jour, COUNT(*) FROM {table} WHERE created_at >= :depuis GROUP BY 1"
    ), {"depuis": depuis})).all()
    return {j: n for j, n in lignes}


async def tableau_de_bord(intervalle_heures: int) -> TableauDeBord:
    maintenant = datetime.now(timezone.utc)
    il_y_a = {j: (maintenant - timedelta(days=j)).isoformat() for j in (7, 30)}
    debut_serie = (maintenant.date() - timedelta(days=JOURS_SERIE - 1)).isoformat()

    async with AsyncSessionLocal() as db:
        c = lambda sql, **p: _compter(db, sql, **p)  # noqa: E731
        comptes_total = await c("SELECT COUNT(*) FROM users")
        nouveaux = Periode(
            j7=await c("SELECT COUNT(*) FROM users WHERE created_at >= :d", d=il_y_a[7]),
            j30=await c("SELECT COUNT(*) FROM users WHERE created_at >= :d", d=il_y_a[30]),
        )
        actifs = Periode(
            j7=await c("SELECT COUNT(*) FROM users WHERE last_login_at >= :d", d=il_y_a[7]),
            j30=await c("SELECT COUNT(*) FROM users WHERE last_login_at >= :d", d=il_y_a[30]),
        )
        suspendus = await c("SELECT COUNT(*) FROM users WHERE disabled_at IS NOT NULL")
        par_offre = dict((await db.execute(text("""
            SELECT COALESCE(s.plan_code, 'free'), COUNT(*)
            FROM (SELECT DISTINCT COALESCE(org_id, id) AS org_key FROM users) o
            LEFT JOIN subscriptions s ON s.org_id = o.org_key
            GROUP BY 1
        """))).all())
        abonnements = [(p, s) for p, s in (await db.execute(text(
            "SELECT plan_code, status FROM subscriptions"
        ))).all()]
        dossiers = Periode(
            j7=await c("SELECT COUNT(*) FROM appels_offres WHERE created_at >= :d", d=il_y_a[7]),
            j30=await c("SELECT COUNT(*) FROM appels_offres WHERE created_at >= :d", d=il_y_a[30]),
        )
        generations = Periode(
            j7=await c("SELECT COUNT(*) FROM launches WHERE created_at >= :d", d=il_y_a[7]),
            j30=await c("SELECT COUNT(*) FROM launches WHERE created_at >= :d", d=il_y_a[30]),
        )
        echeances = await c(
            "SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND plan_code <> 'free' "
            "AND current_period_end IS NOT NULL AND current_period_end < :limite",
            limite=(maintenant + timedelta(days=7)).isoformat(),
        )
        inscriptions = await _par_jour(db, "users", debut_serie)
        dossiers_jour = await _par_jour(db, "appels_offres", debut_serie)

    statuts: dict[str, int] = {}
    for _, s in abonnements:
        statuts[s] = statuts.get(s, 0) + 1

    # Résumé de la veille : mêmes calculs que son écran, pas une seconde règle.
    try:
        v = await veille.sources_veille(intervalle_heures)
        en_retard = sum(1 for s in v.sources if s.passage_en_retard)
        en_alerte = sum(1 for s in v.sources for r in s.remplissage if r.alerte)
        dce = sum(s.dce_en_echec for s in v.sources)
    except Exception:  # schéma de la veille absent (base de test) : pas de résumé
        en_retard = en_alerte = dce = 0

    return TableauDeBord(
        genere_le=maintenant.isoformat(),
        comptes_total=comptes_total, comptes_nouveaux=nouveaux, comptes_actifs=actifs,
        comptes_suspendus=suspendus,
        organisations_total=sum(par_offre.values()), organisations_par_offre=par_offre,
        abonnements_par_statut=statuts, revenu_mensuel_estime_mad=revenu_estime(abonnements),
        dossiers_crees=dossiers, generations=generations,
        paiements_en_retard=statuts.get("past_due", 0), echeances_7j=echeances,
        veille_sources_en_retard=en_retard, veille_champs_en_alerte=en_alerte, veille_dce_en_echec=dce,
        inscriptions_30j=serie_complete(maintenant.date(), JOURS_SERIE, inscriptions),
        dossiers_30j=serie_complete(maintenant.date(), JOURS_SERIE, dossiers_jour),
    )
