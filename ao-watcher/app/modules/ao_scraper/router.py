from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.ao_scraper.repository import AoRepository
from app.modules.ao_scraper.schemas import AoListOut, AoOut, ImportResult, StatusUpdate

router = APIRouter(prefix="/aos", tags=["ao-watcher"])

VALID_STATUSES = {"new", "seen", "favorited", "imported"}


@router.get("", response_model=AoListOut)
async def list_aos(
    status: str | None = Query(None),
    region: str | None = Query(None),
    categorie: str | None = Query(None),
    search: str | None = Query(None),
    date_limite_from: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    repo = AoRepository(db)
    items, total = await repo.list_aos(
        status=status,
        region=region,
        categorie=categorie,
        search=search,
        date_limite_from=date_limite_from,
        page=page,
        limit=limit,
    )
    return AoListOut(items=items, total=total, page=page, limit=limit)


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    repo = AoRepository(db)
    return await repo.get_stats()


@router.get("/{ao_id}", response_model=AoOut)
async def get_ao(ao_id: int, db: AsyncSession = Depends(get_db)):
    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")
    return ao


@router.patch("/{ao_id}/status", response_model=AoOut)
async def update_status(
    ao_id: int,
    body: StatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {VALID_STATUSES}")

    repo = AoRepository(db)
    ao = await repo.get_by_id(ao_id)
    if not ao:
        raise HTTPException(status_code=404, detail="AO not found")

    updated = await repo.update_status(ao_id, body.status)

    # Trigger lazy ZIP download when user favorites
    if body.status == "favorited" and ao.zip_url and not ao.zip_downloaded_at:
        from app.workers.tasks.download_tasks import download_ao_zip
        download_ao_zip.delay(ao_id)

    return updated


@router.post("/{ao_id}/import", response_model=ImportResult)
async def import_to_pipeline(ao_id: int, db: AsyncSession = Depends(get_db)):
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

    # Bridge: call the main app's import endpoint
    import httpx
    from app.core.config import settings

    main_app_url = f"http://app:{settings.main_app_port}/api/v1/pipeline/from-watcher"
    payload = {
        "scraped_ao_id": ao_id,
        "titre": ao.titre,
        "acheteur": ao.acheteur,
        "date_limite": ao.date_limite.isoformat() if ao.date_limite else None,
        "categorie": ao.categorie,
        "region": ao.region,
        "classified_docs": ao.classified_docs,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(main_app_url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Main app unreachable: {e}")

    await repo.update_status(ao_id, "imported")
    return ImportResult(ao_id=data["ao_id"], message="AO imported successfully")
