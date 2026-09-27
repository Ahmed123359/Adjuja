"""
Reconstruction des index RAG (Qdrant) par organisation -- 2026-09-27.

A lancer apres un changement de modele d'embeddings (role `EMBEDDINGS`, spec
context/feature-spec/fournisseurs-ia/) : les vecteurs de l'ancien modele ne
sont pas comparables aux nouveaux. Sert aussi a rattraper les documents
envoyes avant le 2026-09-27, qui n'ont jamais ete indexes (bug de l'import
`get_rag_service`, voir bugs-connus.md) ou l'ont ete avec un type faux.

Sources, les memes que l'indexation courante :
  - documents d'entreprise en PDF      (doc_id `cdoc_<id>`)
  - CV en PDF de l'equipe              (doc_id `cv_<id>`)
  - notes methodologiques finales      (doc_id `ao_<ao_id>_note_metho`)
Le texte passe par `ocr_service.texte_document` : un document scanne est lu par
OCR (et mis en cache) au lieu d'etre ignore.

Usage (depuis adjuja-infra/) :
    docker compose exec api python -m app.scripts.reindex_rag --dry-run
    docker compose exec api python -m app.scripts.reindex_rag
    docker compose exec api python -m app.scripts.reindex_rag --org <org_id>
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from collections import defaultdict

from sqlalchemy import select

from app.db.base import AsyncSessionLocal
from app.db.models import AoDocument, AppelOffre, CompanyDocument, StaffCv
from app.services.ocr_service import texte_document
from app.services.rag_service import get_rag_service
from app.storage import minio_client as mc

logger = logging.getLogger("reindex_rag")


async def _sources(org_filtre: str | None) -> dict[str, list[tuple[str, str, dict, int]]]:
    """org_id -> [(doc_id, minio_key, metadata, limite_caracteres)]"""
    par_org: dict[str, list[tuple[str, str, dict, int]]] = defaultdict(list)
    async with AsyncSessionLocal() as db:
        docs = (await db.execute(select(CompanyDocument).where(CompanyDocument.minio_key.is_not(None)))).scalars().all()
        for d in docs:
            if not (d.nom_fichier or "").lower().endswith(".pdf"):
                continue
            par_org[d.org_id].append((
                f"cdoc_{d.id}", d.minio_key,
                {"type": "company_document", "doc_type": d.doc_type, "nom_fichier": d.nom_fichier, "company_doc_id": d.id},
                10000,
            ))
        cvs = (await db.execute(select(StaffCv).where(StaffCv.cv_minio_key.is_not(None)))).scalars().all()
        for cv in cvs:
            par_org[cv.org_id].append((
                f"cv_{cv.id}", cv.cv_minio_key,
                {"type": "cv", "staff_cv_id": cv.id, "nom": cv.nom, "prenom": cv.prenom, "poste": cv.poste,
                 "specialite": cv.specialite, "annees_experience": cv.annees_experience},
                8000,
            ))
        notes = (await db.execute(
            select(AoDocument, AppelOffre)
            .join(AppelOffre, AppelOffre.id == AoDocument.ao_id)
            .where(
                AoDocument.doc_type == "note_metho",
                AoDocument.statut == "traite",
                AoDocument.minio_key.is_not(None),
                AoDocument.nom_fichier.like("%.pdf"),
            )
        )).all()
        for doc, ao in notes:
            analyse = ao.analyse_json or {}
            par_org[ao.org_id].append((
                f"ao_{ao.id}_note_metho", doc.minio_key,
                {"ao_id": ao.id, "source": "note_metho", "acheteur": ao.acheteur, "objet": ao.objet,
                 "strategie": str(analyse.get("strategie_offre_technique", "")),
                 "criteres": str(analyse.get("criteres_ponderation", ""))},
                0,
            ))
    if org_filtre:
        return {org_filtre: par_org.get(org_filtre, [])}
    return dict(par_org)


async def main(org: str | None, dry_run: bool) -> int:
    sources = await _sources(org)
    total = sum(len(v) for v in sources.values())
    print(f"{len(sources)} organisation(s), {total} document(s) a indexer.")
    if dry_run:
        for org_id, docs in sources.items():
            print(f"  {org_id} : {len(docs)} document(s) ({', '.join(d[0] for d in docs[:6])}{'...' if len(docs) > 6 else ''})")
        return 0

    rag = get_rag_service()
    if not rag.is_ready:
        print("RAG indisponible : Qdrant injoignable ou cle du fournisseur d'embeddings absente (role EMBEDDINGS). Rien n'a ete modifie.")
        return 1

    # Sonde AVANT toute suppression : une cle refusee ou un service injoignable
    # effacerait sinon les index existants sans pouvoir les reconstruire.
    try:
        await rag.embed("test de disponibilite des embeddings")
    except Exception as exc:
        print(f"Embeddings indisponibles ({exc.__class__.__name__}) : rien n'a ete supprime ni modifie.")
        return 1

    ok = echecs = 0
    for org_id, docs in sources.items():
        collection = f"offria_kb_{org_id}"
        try:
            await rag._client.delete_collection(collection)  # type: ignore[union-attr]
        except Exception:
            pass  # collection absente : rien a supprimer
        for doc_id, key, metadata, limite in docs:
            try:
                texte = texte_document(key, mc.get_file_bytes(key))
                if limite:
                    texte = texte[:limite]
                if not texte.strip():
                    continue
                n = await rag.index_document(org_id=org_id, text=texte, metadata=metadata, doc_id=doc_id)
                ok += 1 if n else 0
                echecs += 0 if n else 1
            except Exception as exc:
                echecs += 1
                logger.warning("echec %s (%s) : %s", doc_id, key, exc)
        print(f"  {collection} : reconstruite ({len(docs)} document(s))")
    print(f"Termine : {ok} document(s) indexe(s), {echecs} echec(s).")
    return 0 if not echecs else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reconstruit les index RAG (Qdrant) par organisation.")
    parser.add_argument("--org", help="Limiter a une organisation")
    parser.add_argument("--dry-run", action="store_true", help="Lister sans rien modifier")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.org, args.dry_run)))
