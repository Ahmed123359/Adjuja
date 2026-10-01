"""Enregistrement des résultats publiés (watcher.award_results / award_bids)."""

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import AwardBid, AwardResult
from app.modules.ao_scraper.matching import match_secteurs
from app.modules.award_scraper.parsing import ResultatPublie, normaliser_nom


class AwardRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def cles_connues(self, source: str, type_resultat: str, cles: list[str]) -> set[str]:
        if not cles:
            return set()
        lignes = await self.db.execute(
            select(AwardResult.cle_externe).where(
                AwardResult.source == source, AwardResult.type_resultat == type_resultat,
                AwardResult.cle_externe.in_(cles),
            )
        )
        return {c for (c,) in lignes.all()}

    async def derniere_publication(self, source: str, type_resultat: str) -> datetime | None:
        return (await self.db.execute(
            select(func.max(AwardResult.date_publication)).where(
                AwardResult.source == source, AwardResult.type_resultat == type_resultat)
        )).scalar_one()

    async def enregistrer(self, resultats: list[ResultatPublie]) -> int:
        """Insère les nouveaux (`ON CONFLICT DO NOTHING` : un résultat publié ne
        change pas, et une ligne déjà lue par le lot B ne doit rien perdre)."""
        nouveaux = 0
        for r in resultats:
            res = await self.db.execute(
                pg_insert(AwardResult).values(
                    source=r.source, type_resultat=r.type_resultat, cle_externe=r.cle_externe,
                    org_acronyme=r.org_acronyme, reference=r.reference, objet=r.objet, acheteur=r.acheteur,
                    procedure=r.procedure, categorie=r.categorie, lieu_execution=r.lieu_execution,
                    date_publication=r.date_publication, nb_offres=r.nb_offres, est_infructueux=r.est_infructueux,
                    secteur_codes=match_secteurs(r.objet, None, None), url_source=r.url_source,
                    extraction_statut="non_applicable" if r.type_resultat == "bdc" else "en_attente",
                ).on_conflict_do_nothing(constraint="uq_award_result").returning(AwardResult.id)
            )
            nouvel_id = res.scalar_one_or_none()
            if nouvel_id is None:
                continue
            nouveaux += 1
            if r.attributaire:
                self.db.add(AwardBid(
                    result_id=nouvel_id, soumissionnaire=r.attributaire,
                    soumissionnaire_normalise=normaliser_nom(r.attributaire),
                    montant_ttc=r.montant_ttc, statut="retenu", origine="listing_bdc",
                ))
        await self.db.commit()
        return nouveaux

    async def sans_pieces_jointes(self, limite: int) -> list[AwardResult]:
        return list((await self.db.execute(
            select(AwardResult).where(AwardResult.type_resultat != "bdc", AwardResult.pieces_jointes.is_(None))
            .order_by(AwardResult.date_publication.desc().nulls_last()).limit(limite)
        )).scalars().all())

    async def poser_pieces_jointes(self, result_id: int, pieces: list[dict]) -> None:
        await self.db.execute(update(AwardResult).where(AwardResult.id == result_id).values(pieces_jointes=pieces))
        await self.db.commit()
