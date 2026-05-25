"""
Export routes  génération de fichiers Word (.docx) natifs.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.dependencies import get_current_user
from app.models.generation import GenerationResult
from app.models.user import UserPublic
from app.services.export_service import build_docx
from pydantic import BaseModel

router = APIRouter(prefix="/export", tags=["Export"])


class DocxExportRequest(BaseModel):
    result:      GenerationResult
    company_nom: str = ""
    ao_text:     str = ""


@router.post("/docx")
def export_docx(
    body: DocxExportRequest,
    _: UserPublic = Depends(get_current_user),
) -> Response:
    """
    Génère un fichier .docx natif à partir d'un GenerationResult.
    Retourne le binaire directement en pièce jointe.
    """
    content  = build_docx(body.result, body.company_nom, body.ao_text)
    filename = f"{(body.company_nom or 'reponse').replace(' ', '_')}_ao.docx"

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
