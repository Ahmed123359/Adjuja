from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.dependencies import get_current_user
from app.models.user import UserPublic
from app.services.bordereau_service import bordereau_to_excel, detect_and_extract_bordereau

router = APIRouter(prefix="/bordereau", tags=["bordereau"])


@router.post("/excel")
async def extract_bordereau_excel_endpoint(
    pdf: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
) -> Response:
    """
    Détecte et extrait le bordereau de prix d'un PDF d'appel d'offres,
    puis génère un fichier Excel (.xlsx) prêt à remplir.
    Étape 1 (gratuit) : détection par mots-clés avec pymupdf.
    Étape 2 (GPT-4o)  : extraction du tableau sur la meilleure page.
    """
    pdf_bytes = await pdf.read()

    bordereau = await detect_and_extract_bordereau(pdf_bytes)
    if bordereau is None:
        raise HTTPException(
            status_code=404,
            detail="Aucun bordereau de prix détecté dans ce document. Vérifiez que le PDF contient bien un tableau de prix.",
        )

    excel_bytes = bordereau_to_excel(bordereau)
    filename = (pdf.filename or "document").replace(".pdf", "_bordereau.xlsx")
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
