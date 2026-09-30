"""Santé de la veille, lue directement dans le schéma `watcher` (même base).

Voir `context/feature-spec/admin-panel/api.md`, module Veille. Lecture seule :
les actions passeront par les routes d'administration de la veille elle-même.

Une requête agrégée par table (FILTER), pas une par champ : la page doit rester
rapide avec des milliers d'avis.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db.base import AsyncSessionLocal
from app.models.admin import (
    AnalysesSource,
    EssaiScrape,
    DceEchec,
    DceEchecsOut,
    Remplissage,
    SourceVeille,
    VeilleSourcesOut,
)

logger = logging.getLogger(__name__)

# Même règle que les scripts de rattrapage et l'email de veille.
OUVERT_AO = "(date_limite IS NULL OR date_limite >= CURRENT_DATE)"
# Un BDC annulé n'est plus à traiter : il ne compte pas parmi les ouverts.
OUVERT_BDC = "(date_limite IS NULL OR date_limite >= CURRENT_DATE) AND NOT est_annule"
_RECENT = "(scraped_at >= NOW() - INTERVAL '7 days')"

# Champ -> condition « rempli ». Constantes du code, jamais une saisie : les
# assembler dans le SQL ne crée aucune injection.
CHAMPS_AO: dict[str, str] = {
    "budget_estime": "budget_estime IS NOT NULL",
    "caution":       "caution IS NOT NULL",
    "secteur":       "NULLIF(TRIM(secteur), '') IS NOT NULL",
    "secteur_codes": "(jsonb_typeof(secteur_codes) = 'array' AND jsonb_array_length(secteur_codes) > 0)",
    "ville":         "NULLIF(TRIM(ville), '') IS NOT NULL",
    "zip_url":       "NULLIF(TRIM(zip_url), '') IS NOT NULL",
    "reference":     "NULLIF(TRIM(reference), '') IS NOT NULL",
}
CHAMPS_BDC: dict[str, str] = {
    "categorie":         "NULLIF(TRIM(categorie), '') IS NOT NULL",
    "nature_prestation": "NULLIF(TRIM(nature_prestation), '') IS NOT NULL",
    "ville":             "NULLIF(TRIM(ville), '') IS NOT NULL",
    "document_url":      "NULLIF(TRIM(document_url), '') IS NOT NULL",
}

# Analyse présente, et analyse antérieure à l'analyse enrichie (pas de clé
# `risques`) : même règle que analyse_enrichissement.a_enrichir.
_ANALYSE_PRESENTE = "(jsonb_typeof(analyse_json) = 'object' AND analyse_json <> '{}'::jsonb)"
_ANALYSES_AO = (
    f"COUNT(*) FILTER (WHERE {OUVERT_AO} AND {_ANALYSE_PRESENTE}) AS analyses_faites,\n"
    f"COUNT(*) FILTER (WHERE {OUVERT_AO} AND {_ANALYSE_PRESENTE} AND NOT analyse_json ? 'risques') AS a_enrichir,"
)

# En dessous, un écart de taux n'est que du bruit.
MIN_RECENTS_POUR_ALERTE = 10


def pourcentage(n: int, total: int) -> float | None:
    return round(100 * n / total, 1) if total else None


def alerte_remplissage(ouverts_pct: float | None, recents_pct: float | None, nb_recents: int) -> bool:
    """Les avis ouverts sont deux fois moins remplis que les avis récents.

    C'est la signature de l'effacement du 2026-09-29 : un avis neuf arrive
    complet (page détail lue à la découverte), puis se vide à chaque re-scrape
    de liste. Un seuil absolu ne marcherait pas : la caution est légitimement
    rare, un taux bas n'est pas en soi un défaut.
    """
    if ouverts_pct is None or recents_pct is None or nb_recents < MIN_RECENTS_POUR_ALERTE:
        return False
    return ouverts_pct < recents_pct / 2


def requete_sources(table: str, champs: dict[str, str], ouvert: str, extra: str = "") -> str:
    remplissage = ",\n".join(
        f"COUNT(*) FILTER (WHERE {ouvert} AND {cond}) AS o_{nom},\n"
        f"COUNT(*) FILTER (WHERE {ouvert} AND {_RECENT} AND {cond}) AS r_{nom}"
        for nom, cond in champs.items()
    )
    return f"""
        SELECT source,
               COUNT(*) FILTER (WHERE {ouvert}) AS ouverts,
               COUNT(*) FILTER (WHERE {ouvert} AND {_RECENT}) AS recents,
               COUNT(*) FILTER (WHERE scraped_at >= NOW() - INTERVAL '24 hours') AS nouveaux_24h,
               COUNT(*) FILTER (WHERE {_RECENT}) AS nouveaux_7j,
               COUNT(*) FILTER (WHERE {ouvert} AND zip_error IS NOT NULL) AS dce_en_echec,
               {extra}
               {remplissage}
        FROM watcher.{table}
        GROUP BY source
        ORDER BY source
    """


def source_depuis_ligne(ligne: dict, table: str, champs: dict[str, str]) -> SourceVeille:
    ouverts, recents = ligne["ouverts"], ligne["recents"]
    remplissage = []
    for nom in champs:
        o_pct = pourcentage(ligne[f"o_{nom}"], ouverts)
        r_pct = pourcentage(ligne[f"r_{nom}"], recents)
        remplissage.append(Remplissage(
            champ=nom, ouverts_pct=o_pct, recents_pct=r_pct,
            alerte=alerte_remplissage(o_pct, r_pct, recents),
        ))
    return SourceVeille(
        source=ligne["source"],
        table=table,
        ouverts=ouverts,
        nouveaux_24h=ligne["nouveaux_24h"],
        nouveaux_7j=ligne["nouveaux_7j"],
        remplissage=remplissage,
        dce_en_echec=ligne["dce_en_echec"],
        analyses=(
            AnalysesSource(faites=ligne["analyses_faites"], a_enrichir=ligne["a_enrichir"])
            if table == "ao" else None
        ),
    )


def fusionner_bdc(lignes: list[dict]) -> list[dict]:
    """La table des BDC n'a qu'une source ; l'écran en montre toujours une
    seule ligne « bdc », même si une deuxième source apparaissait."""
    if not lignes:
        return []
    total: dict = {"source": "bdc"}
    for ligne in lignes:
        for cle, valeur in ligne.items():
            if cle != "source":
                total[cle] = total.get(cle, 0) + valeur
    return [total]


def passage_en_retard(
    dernier_ok: datetime | None, a_deja_tourne: bool, maintenant: datetime, intervalle_heures: int,
) -> bool:
    """Aucun succès depuis deux intervalles planifiés.

    Une source jamais tracée n'est pas en retard : la table est neuve, on ne
    sait rien. Une source tracée sans aucun succès l'est.
    """
    if dernier_ok is None:
        return a_deja_tourne
    return maintenant - dernier_ok > timedelta(hours=2 * intervalle_heures)


_DERNIERS_ESSAIS = """
    SELECT DISTINCT ON (source) source, debut, statut, trouves, enregistres, erreur, declenchement
    FROM watcher.scrape_runs
    ORDER BY source, debut DESC
"""
_DERNIERS_SUCCES = "SELECT source, MAX(fin) AS fin FROM watcher.scrape_runs WHERE statut = 'ok' GROUP BY source"


async def _passages() -> tuple[dict[str, dict], dict[str, datetime]]:
    """Dernière tentative et dernier succès par source. Session à part : si la
    table n'existe pas encore (veille pas redémarrée depuis sa création), la
    requête échoue sans emporter le reste de la page."""
    try:
        async with AsyncSessionLocal() as db:
            essais = (await db.execute(text(_DERNIERS_ESSAIS))).mappings().all()
            succes = (await db.execute(text(_DERNIERS_SUCCES))).mappings().all()
    except Exception as exc:
        logger.warning("Passages de scrape illisibles  erreur=%s", exc)
        return {}, {}
    return {e["source"]: dict(e) for e in essais}, {l["source"]: l["fin"] for l in succes}


def completer_passages(
    source: SourceVeille, essais: dict[str, dict], succes: dict[str, datetime],
    maintenant: datetime, intervalle_heures: int,
) -> SourceVeille:
    essai = essais.get(source.source)
    dernier_ok = succes.get(source.source)
    source.dernier_passage = dernier_ok.isoformat() if dernier_ok else None
    source.dernier_essai = EssaiScrape(
        debut=essai["debut"].isoformat(), statut=essai["statut"], trouves=essai["trouves"],
        enregistres=essai["enregistres"], erreur=essai["erreur"], declenchement=essai["declenchement"],
    ) if essai else None
    source.passage_en_retard = passage_en_retard(dernier_ok, essai is not None, maintenant, intervalle_heures)
    return source


async def sources_veille(intervalle_heures: int = 6) -> VeilleSourcesOut:
    async with AsyncSessionLocal() as db:
        aos = (await db.execute(text(
            requete_sources("scraped_aos", CHAMPS_AO, OUVERT_AO, _ANALYSES_AO)
        ))).mappings().all()
        bdc = (await db.execute(text(
            requete_sources("scraped_bdc", CHAMPS_BDC, OUVERT_BDC)
        ))).mappings().all()
    sources = [source_depuis_ligne(dict(l), "ao", CHAMPS_AO) for l in aos]
    sources += [source_depuis_ligne(l, "bdc", CHAMPS_BDC) for l in fusionner_bdc([dict(l) for l in bdc])]
    essais, succes = await _passages()
    maintenant = datetime.now(timezone.utc)
    sources = [completer_passages(s, essais, succes, maintenant, intervalle_heures) for s in sources]
    return VeilleSourcesOut(genere_le=maintenant.isoformat(), sources=sources)


_ECHECS_DCE = f"""
    SELECT 'ao' AS nature, id, source, reference, titre, acheteur, date_limite, zip_error
    FROM watcher.scraped_aos WHERE zip_error IS NOT NULL AND {OUVERT_AO}
    UNION ALL
    SELECT 'bdc', id, 'bdc', NULL, titre, acheteur, date_limite, zip_error
    FROM watcher.scraped_bdc WHERE zip_error IS NOT NULL AND {OUVERT_BDC}
"""


async def dce_echecs(source: str | None, limite: int) -> DceEchecsOut:
    """Avis ouverts dont le téléchargement du dossier a échoué."""
    filtre = "WHERE source = :source" if source else ""
    params = {"source": source, "limite": limite}
    async with AsyncSessionLocal() as db:
        total = (await db.execute(
            text(f"SELECT COUNT(*) FROM ({_ECHECS_DCE}) e {filtre}"), params
        )).scalar_one()
        lignes = (await db.execute(
            text(f"SELECT * FROM ({_ECHECS_DCE}) e {filtre} ORDER BY date_limite ASC NULLS LAST LIMIT :limite"),
            params,
        )).mappings().all()
    return DceEchecsOut(total=total, items=[
        DceEchec(
            id=l["id"], table=l["nature"], source=l["source"], reference=l["reference"],
            titre=l["titre"], acheteur=l["acheteur"],
            date_limite=l["date_limite"].isoformat() if l["date_limite"] else None,
            erreur=l["zip_error"][:2000],
        )
        for l in lignes
    ])
