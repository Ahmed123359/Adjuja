from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import download_progress
from app.core.database import get_db
from app.core.mode_passation import MODES_PASSATION
from app.core.taxonomie import SECTEURS
from app.modules.ao_scraper.analysis import AnalysisError, OcrRequise, analyze_ao
from app.modules.ao_scraper.repository import AoRepository
from app.modules.ao_scraper.schemas import AoListOut, AoOut, ImportResult, ModePassationOut, SecteurOut, StatusUpdate, VerdictOut

router = APIRouter(prefix="/aos", tags=["ao-watcher"])
secteurs_router = APIRouter(prefix="/secteurs", tags=["taxonomie"])


@secteurs_router.get("", response_model=list[SecteurOut])
async def list_secteurs():
    """Nomenclature complete des secteurs d'activite (reference statique,
    voir app.core.taxonomie). Pas d'auth : donnee de reference publique."""
    return [
        SecteurOut(code=s.code, label=s.label, activites=list(s.activites), categorie=s.categorie)
        for s in SECTEURS
    ]


@router.get("/mode-passation", response_model=list[ModePassationOut])
async def list_modes_passation():
    """Nomenclature complete des modes de passation (reference statique,
    voir app.core.mode_passation). Pas d'auth : donnee de reference publique."""
    return [ModePassationOut(code=m.code, label=m.label) for m in MODES_PASSATION]

VALID_STATUSES = {"new", "seen", "favorited", "imported"}


def _require_auth_header(request: Request) -> str:
    """Le watcher ne valide pas le JWT lui-même : il le relaie vers l'app principale,
    qui fait la vérification habituelle et résout l'org_id."""
    auth = request.headers.get("authorization")
    if not auth:
        raise HTTPException(status_code=401, detail="Authentification requise.")
    return auth


@router.get("", response_model=AoListOut)
async def list_aos(
    status: str | None = Query(None),
    region: str | None = Query(None),
    categorie: str | None = Query(None),
    mode_passation: str | None = Query(None),
    search: str | None = Query(None),
    date_limite_from: str | None = Query(None),
    secteur_codes: list[str] | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(_require_auth_header),
):
    repo = AoRepository(db)
    items, total = await repo.list_aos(
        status=status,
        region=region,
        categorie=categorie,
        mode_passation=mode_passation,
        search=search,
        date_limite_from=date_limite_from,
        secteur_codes=secteur_codes,
        page=page,
        limit=limit,
    )
    return AoListOut(items=items, total=total, page=page, limit=limit)


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db), _auth: str = Depends(_require_auth_header)):
    repo = AoRepository(db)
    return await repo.get_stats()


@router.get("/{ao_id}", response_model=AoOut)
async def get_ao(ao_id: int, db: AsyncSession = Depends(get_db), _auth: str = Depends(_require_auth_header)):
    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")
    out = AoOut.model_validate(ao)
    out.download_progress = await download_progress.read("ao", ao_id)
    return out


@router.patch("/{ao_id}/status", response_model=AoOut)
async def update_status(
    ao_id: int,
    body: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(_require_auth_header),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {VALID_STATUSES}")

    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")

    will_download = body.status == "favorited" and not ao.zip_downloaded_at
    # Une erreur laissee par un telechargement precedent ferait afficher « erreur »
    # pendant le nouveau, et l'ecran cesserait de le suivre : on l'efface au depart.
    updated = await repo.update_status(ao_id, body.status, clear_zip_error=will_download)

    # Trigger lazy ZIP download when user favorites
    if will_download:
        await download_progress.mark_queued("ao", ao_id)
        if ao.zip_url:
            from app.workers.tasks.download_tasks import download_ao_zip
            download_ao_zip.delay(ao_id)
        else:
            # zip_url peut manquer simplement parce que le DCE a ete mis en
            # ligne par l'acheteur apres notre scrape initial -- on re-verifie
            # avant d'afficher "aucun lien" a l'utilisateur.
            from app.workers.tasks.download_tasks import refresh_and_download_ao_zip
            refresh_and_download_ao_zip.delay(ao_id)

    return updated


@router.post("/{ao_id}/import", response_model=ImportResult)
async def import_to_pipeline(
    ao_id: int,
    db: AsyncSession = Depends(get_db),
    auth: str = Depends(_require_auth_header),
):
    """
    Copy a favorited AO into the main app pipeline.
    Creates appels_offres + ao_documents from classified_docs.
    Returns the ao_id from the main app for frontend redirect.
    """
    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")
    if not ao.classified_docs:
        raise HTTPException(
            status_code=400,
            detail="Documents not yet downloaded. Favorite the AO first and wait for download to complete.",
        )

    # Bridge: call the main app's import endpoint, relaying the caller's JWT
    # so the main app can resolve org_id via its own auth (get_current_user).
    import httpx
    from app.core.config import settings

    main_app_url = f"http://{settings.main_app_host}:{settings.main_app_port}/api/v1/ao/from-watcher"
    payload = {
        "scraped_ao_id": ao_id,
        "titre": ao.titre,
        "acheteur": ao.acheteur,
        "date_limite": ao.date_limite.isoformat() if ao.date_limite else None,
        "categorie": ao.categorie,
        "region": ao.region,
        "classified_docs": ao.classified_docs,
        "analyse_json": ao.analyse_json,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(main_app_url, json=payload, headers={"Authorization": auth})
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        # Relaie le vrai statut (ex: 402 plafond de plan atteint) + le message
        # propre du detail, plutot que d'envelopper le JSON brut dans une string
        # sous un 502 generique -- illisible cote frontend.
        try:
            main_detail = e.response.json().get("detail", e.response.text)
        except Exception:
            main_detail = e.response.text
        raise HTTPException(status_code=e.response.status_code, detail=main_detail)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Main app unreachable: {e}")

    await repo.update_status(ao_id, "imported")
    return ImportResult(ao_id=data["id"], message="AO imported successfully")


@router.get("/{ao_id}/download")
async def download_zip(
    ao_id: int,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(_require_auth_header),
):
    """Rassemble les documents classifies d'une AO (stockes individuellement sur
    MinIO, jamais comme un seul zip) en un zip unique genere a la volee, pour
    telechargement direct sans passer par l'import dans le pipeline."""
    import io
    import zipfile

    from fastapi.responses import StreamingResponse

    from app.workers.tasks.download_tasks import _minio_client
    from app.core.config import settings

    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")
    if not ao.classified_docs:
        raise HTTPException(status_code=400, detail="Aucun document disponible pour cette AO.")

    minio = _minio_client()
    buffer = io.BytesIO()
    missing = []
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for label, minio_key in ao.classified_docs.items():
            resp = None
            try:
                resp = minio.get_object(settings.minio_bucket, minio_key)
                zf.writestr(minio_key.rsplit("/", 1)[-1], resp.read())
            except Exception:
                # Objet manquant sur MinIO (ex: volume perdu depuis) -- ne bloque pas
                # tout le zip pour un fichier, on liste juste ce qui a echoue.
                missing.append(label)
            finally:
                if resp is not None:
                    resp.close()
                    resp.release_conn()

    if missing and len(missing) == len(ao.classified_docs):
        raise HTTPException(
            status_code=404,
            detail="Les documents de cette AO ne sont plus disponibles sur le stockage.",
        )

    buffer.seek(0)
    filename = f"AO-{ao_id}-documents.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{ao_id}/documents/{label}")
async def get_document(
    ao_id: int,
    label: str,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(_require_auth_header),
):
    """Un document classifie de l'AO (CPS, RC, avis...), pour l'apercu dans le
    panneau de veille (2026-09-27). `label` est une cle de `classified_docs` ;
    aucune cle MinIO n'est acceptee telle quelle depuis le client."""
    from fastapi.responses import Response

    from app.workers.tasks.download_tasks import _minio_client
    from app.core.config import settings

    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")
    minio_key = (ao.classified_docs or {}).get(label)
    if not minio_key:
        raise HTTPException(status_code=404, detail="Document introuvable pour cette AO.")

    resp = None
    try:
        resp = _minio_client().get_object(settings.minio_bucket, minio_key)
        data = resp.read()
    except Exception:
        raise HTTPException(status_code=404, detail="Ce document n'est plus disponible sur le stockage.")
    finally:
        if resp is not None:
            resp.close()
            resp.release_conn()

    filename = minio_key.rsplit("/", 1)[-1]
    media = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{ao_id}/verdict", response_model=VerdictOut)
async def get_verdict(
    ao_id: int,
    db: AsyncSession = Depends(get_db),
    auth: str = Depends(_require_auth_header),
):
    """
    Analyse CPS/RC (cache : un seul appel Mistral par AO, jamais repete) puis
    demande a l'app principale de calculer le verdict Go/No-Go pour l'org de
    l'appelant (resolu via le JWT relaye, ao-watcher ne le decode pas).
    """
    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")

    if ao.analyse_json:
        analyse_json = ao.analyse_json
    else:
        # OCR en cours ou en file : on rend sa progression sans relancer
        # l'analyse. Sinon, des que le CPS etait lu, l'analyse partait sans
        # attendre le RC -- et chaque rappel relisait les PDF depuis MinIO.
        en_cours = await download_progress.read("ocr", ao_id)
        if en_cours is not None and en_cours.etape != "erreur":
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=202, content={"ocr": en_cours.model_dump()})

        try:
            analyse_json = await analyze_ao(ao)
        except OcrRequise:
            # Documents scannes : l'OCR tourne en tache de fond (plusieurs
            # secondes par page). 202 + progression ; le panneau rappelle cette
            # route jusqu'a obtenir le verdict. Une seule tache a la fois par AO.
            from fastapi.responses import JSONResponse

            prog = await download_progress.read("ocr", ao_id)
            if prog is not None and prog.etape == "erreur":
                download_progress.clear("ocr", ao_id)
                raise HTTPException(
                    status_code=400,
                    detail="La lecture des pages scannees a echoue. Relancez l'analyse pour reessayer.",
                )
            if prog is None:
                from app.workers.tasks.ocr_tasks import ocr_ao_documents

                await download_progress.mark_queued("ocr", ao_id)
                ocr_ao_documents.delay(ao_id)
                prog = await download_progress.read("ocr", ao_id)
            return JSONResponse(
                status_code=202,
                content={"ocr": prog.model_dump() if prog else {"etape": "en_file", "elapsed_s": 0}},
            )
        except AnalysisError as e:
            raise HTTPException(status_code=400, detail=str(e))
        await repo.update_analyse_json(ao_id, analyse_json)

    import httpx
    from app.core.config import settings

    main_app_url = f"http://{settings.main_app_host}:{settings.main_app_port}/api/v1/ao/eligibility-check"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                main_app_url,
                json={
                    "analyse_json": analyse_json,
                    "date_limite": ao.date_limite.isoformat() if ao.date_limite else None,
                    # Contexte du fit score : objet (titre scrape), lieu d'execution.
                    "objet": ao.titre,
                    "region": ao.region,
                    "ville": ao.ville,
                },
                headers={"Authorization": auth},
            )
            resp.raise_for_status()
            verdict_data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Main app rejected eligibility check: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Main app unreachable: {e}")

    return VerdictOut(
        analyse_json=analyse_json,
        verdict=verdict_data["verdict"],
        raisons=verdict_data["raisons"],
        details=verdict_data["details"],
        fit_score=verdict_data.get("fit_score"),
    )
