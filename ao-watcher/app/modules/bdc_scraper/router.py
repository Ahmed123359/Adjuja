from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.nature_prestation import NATURES_PRESTATION
from app.modules.bdc_scraper.repository import BdcRepository
from app.modules.bdc_scraper.schemas import BdcListOut, BdcOut, BdcStatusUpdate, NaturePrestationOut

router = APIRouter(prefix="/bdc", tags=["bdc-watcher"])

VALID_STATUSES = {"new", "seen", "favorited"}


def _require_auth_header(request: Request) -> str:
    """Meme principe que ao_scraper/router.py : le watcher relaie le JWT,
    il ne le valide pas lui-meme."""
    auth = request.headers.get("authorization")
    if not auth:
        raise HTTPException(status_code=401, detail="Authentification requise.")
    return auth


@router.get("", response_model=BdcListOut)
async def list_bdc(
    status: str | None = Query(None),
    region: str | None = Query(None),
    categorie: str | None = Query(None),
    nature_prestations: list[str] = Query(default=[]),
    search: str | None = Query(None),
    date_limite_from: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    repo = BdcRepository(db)
    items, total = await repo.list_bdc(
        status=status,
        region=region,
        categorie=categorie,
        nature_prestations=nature_prestations,
        search=search,
        date_limite_from=date_limite_from,
        page=page,
        limit=limit,
    )
    return BdcListOut(items=items, total=total, page=page, limit=limit)


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    repo = BdcRepository(db)
    return await repo.get_stats()


@router.get("/nature-prestation", response_model=list[NaturePrestationOut])
async def list_nature_prestation():
    """Nomenclature complete des natures de prestation BDC (reference statique,
    voir app.core.nature_prestation). Pas d'auth : donnee de reference publique."""
    return [
        NaturePrestationOut(code=n.code, label=n.label, categorie=n.categorie)
        for n in NATURES_PRESTATION
    ]


@router.get("/{bdc_id}", response_model=BdcOut)
async def get_bdc(bdc_id: int, db: AsyncSession = Depends(get_db)):
    repo = BdcRepository(db)
    bdc = await repo.get_by_id(bdc_id)
    if not bdc:
        raise HTTPException(status_code=404, detail="BDC not found")
    return bdc


@router.patch("/{bdc_id}/status", response_model=BdcOut)
async def update_status(
    bdc_id: int,
    body: BdcStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(_require_auth_header),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {VALID_STATUSES}")

    repo = BdcRepository(db)
    bdc = await repo.get_by_id(bdc_id)
    if not bdc:
        raise HTTPException(status_code=404, detail="BDC not found")

    updated = await repo.update_status(bdc_id, body.status)

    # Telechargement anonyme confirme (curl sans cookies -> 200) -- meme
    # declenchement lazy-on-favorite que les AOs.
    if body.status == "favorited" and bdc.document_url and not bdc.zip_downloaded_at:
        from app.workers.tasks.download_bdc_tasks import download_bdc_document
        download_bdc_document.delay(bdc_id)

    return updated
