"""Operations de maintenance de la veille, lancees depuis le panneau
d'administration (taches Celery de app/workers/tasks/admin_tasks.py) ou a la
main (scripts rattraper_details.py et enrichir_analyses.py, reduits a leur
ligne de commande).

Chaque operation renvoie un compte rendu au lieu de l'imprimer, et signale sa
progression par un rappel `progression(fait, total)`. Par defaut : simulation
(compte et estime, ne lit aucune page, n'appelle aucun modele).
"""

import asyncio
from collections.abc import Callable
from datetime import date
from urllib.parse import parse_qs, urlparse

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.models import ScrapedAo
from app.core.schema import assurer_colonnes

Progression = Callable[[int, int], None]

SOURCES_AO = ("marchespublics", "safakat_cdg", "achats_cimr")

# Ordre de grandeur d'une analyse : jusqu'a 100 000 caracteres de CPS + RC
# (~25 000 jetons en entree) et ~3 000 jetons en sortie.
JETONS_ENTREE, JETONS_SORTIE = 25_000, 3_000


def _rien(_fait: int, _total: int) -> None:
    pass


def _org(url: str) -> str:
    return parse_qs(urlparse(url).query).get("orgAcronyme", [""])[0]


def _session():
    moteur = create_async_engine(settings.database_url, poolclass=NullPool)
    return moteur, sessionmaker(moteur, expire_on_commit=False, class_=AsyncSession)


async def rattraper_details(
    reel: bool = False,
    limite: int | None = None,
    pause: float = 1.5,
    sources: tuple[str, ...] = SOURCES_AO,
    progression: Progression = _rien,
) -> dict:
    """Relit la page detail des AO ouverts a qui il manque l'estimation, la
    caution, le secteur, la reference ou le lien du DCE ; restaure ces champs
    et recalcule les codes de secteur. Ne remplace jamais une valeur existante
    par une vide.

    Origine : jusqu'au 2026-09-29, chaque re-scrape de liste effacait ces
    champs (bug corrige dans repository.upsert_many) ; la reference n'etait pas
    enregistree avant le 2026-09-30 ; le lien du DCE avait ete efface de la
    meme facon le 2026-09-13 (500 AO en dev, jamais restaures : releve par le
    panneau d'administration le 2026-09-30).
    """
    # Import differe : le scraper charge Playwright, inutile en simulation.
    from app.modules.ao_scraper.matching import match_secteurs
    from app.modules.ao_scraper.mpe import MPEPlatformScraper

    await assurer_colonnes()
    moteur, Session = _session()
    try:
        async with Session() as session:
            aos = (await session.execute(
                select(ScrapedAo.id, ScrapedAo.source, ScrapedAo.external_id, ScrapedAo.url_source,
                       ScrapedAo.titre, ScrapedAo.description, ScrapedAo.secteur)
                .where(ScrapedAo.source.in_(sources))
                .where(ScrapedAo.date_limite >= date.today())
                .where(or_(ScrapedAo.budget_estime.is_(None), ScrapedAo.caution.is_(None),
                           ScrapedAo.secteur.is_(None), ScrapedAo.reference.is_(None),
                           ScrapedAo.zip_url.is_(None)))
                .order_by(ScrapedAo.date_limite.asc())
            )).all()
        if limite:
            aos = aos[:limite]

        par_source: dict[str, int] = {}
        for ao in aos:
            par_source[ao.source] = par_source.get(ao.source, 0) + 1
        rapport: dict = {
            "reel": reel,
            "a_completer": len(aos),
            "par_source": par_source,
            "duree_estimee_min": int(len(aos) * (pause + 1.5) / 60) + 1 if aos else 0,
        }
        if not reel:
            return rapport

        scrapers = {s: MPEPlatformScraper(s) for s in {ao.source for ao in aos}}
        completes, sans_page, inchanges = 0, 0, 0
        progression(0, len(aos))
        try:
            for i, ao in enumerate(aos, start=1):
                detail = await scrapers[ao.source].fetch_detail(ao.external_id, _org(ao.url_source))
                if not detail:
                    sans_page += 1
                    progression(i, len(aos))
                    continue
                valeurs = {}
                if detail.budget_estime is not None:
                    valeurs["budget_estime"] = detail.budget_estime
                if detail.caution is not None:
                    valeurs["caution"] = detail.caution
                secteur = detail.secteur or ao.secteur
                if detail.secteur:
                    valeurs["secteur"] = detail.secteur
                if detail.mode_passation:
                    valeurs["mode_passation"] = detail.mode_passation
                if detail.reference:
                    valeurs["reference"] = detail.reference
                if detail.zip_url:
                    valeurs["zip_url"] = detail.zip_url
                valeurs["secteur_codes"] = match_secteurs(ao.titre, secteur, ao.description)
                # Le portail ne publie parfois ni estimation ni caution : rien a restaurer.
                if detail.budget_estime is None and detail.caution is None:
                    inchanges += 1
                async with Session() as session:
                    await session.execute(update(ScrapedAo).where(ScrapedAo.id == ao.id).values(**valeurs))
                    await session.commit()
                completes += 1
                progression(i, len(aos))
                await asyncio.sleep(pause)
        finally:
            for s in scrapers.values():
                await s._close()

        rapport.update(completes=completes, pages_illisibles=sans_page, sans_estimation_ni_caution=inchanges)
        return rapport
    finally:
        await moteur.dispose()


async def enrichir_analyses(
    reel: bool = False,
    limite: int | None = None,
    pause: float = 3.0,
    progression: Progression = _rien,
) -> dict:
    """Re-analyse une fois les AO ouverts dont l'analyse date d'avant
    l'analyse enrichie (pas de cle `risques`). Les cinq nouvelles cles sont
    AJOUTEES a l'analyse existante, jamais a sa place. Spec :
    context/feature-spec/analyse-ao-enrichie/api.md, section 4.
    """
    from app.modules.ao_scraper.analysis import AnalysisError, analyze_ao
    from app.modules.ao_scraper.enrichissement import a_enrichir, fusionner_enrichissement

    moteur, Session = _session()
    try:
        async with Session() as session:
            candidats = (await session.execute(
                select(ScrapedAo)
                .where(ScrapedAo.analyse_json.isnot(None))
                .where(or_(ScrapedAo.date_limite.is_(None), ScrapedAo.date_limite >= date.today()))
                .order_by(ScrapedAo.date_limite.asc().nulls_last())
            )).scalars().all()
        a_faire = [ao for ao in candidats if a_enrichir(ao.analyse_json)]
        if limite:
            a_faire = a_faire[:limite]

        rapport: dict = {
            "reel": reel,
            "deja_analyses": len(candidats),
            "a_enrichir": len(a_faire),
            "jetons_entree_estimes": len(a_faire) * JETONS_ENTREE,
            "jetons_sortie_estimes": len(a_faire) * JETONS_SORTIE,
            "modele": settings.llm_analysis,
        }
        if not reel:
            return rapport

        faits, echecs = 0, []
        progression(0, len(a_faire))
        for i, ao in enumerate(a_faire, start=1):
            try:
                nouvelle = await analyze_ao(ao)
            except AnalysisError as exc:  # OcrRequise comprise : documents scannes non lus
                echecs.append({"ao_id": ao.id, "raison": f"{type(exc).__name__}: {str(exc)[:120]}"})
                progression(i, len(a_faire))
                continue
            fusion = fusionner_enrichissement(ao.analyse_json, nouvelle)
            async with Session() as session:
                await session.execute(update(ScrapedAo).where(ScrapedAo.id == ao.id).values(analyse_json=fusion))
                await session.commit()
            faits += 1
            progression(i, len(a_faire))
            if i < len(a_faire):
                await asyncio.sleep(pause)  # limite de debit du fournisseur

        rapport.update(enrichis=faits, ignores=echecs)
        return rapport
    finally:
        await moteur.dispose()
