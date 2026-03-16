from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from app.api.dependencies import get_current_user
from app.models.user import UserPublic
from app.services.signing_service import sign_pdf

router = APIRouter(prefix="/sign", tags=["sign"])


@router.post("/pdf")
async def sign_pdf_endpoint(
    pdf: UploadFile = File(...),
    signature: Optional[UploadFile] = File(None),
    cachet: Optional[UploadFile] = File(None),
    sig_w:       int = Form(120),
    sig_h:       int = Form(50),
    sig_mx:      int = Form(50),
    sig_my:      int = Form(40),
    cac_w:       int = Form(100),
    cac_h:       int = Form(100),
    cac_mx:      int = Form(50),
    cac_my:      int = Form(40),
    fait_a_lieu: str = Form(""),
    fait_a_date: str = Form(""),
    current_user: UserPublic = Depends(get_current_user),
) -> Response:
    """
    Signe un PDF :
    - signature en bas à droite sur toutes les pages
    - cachet en bas à gauche sur la dernière page (optionnel)
    Retourne le PDF signé.
    """
    pdf_bytes = await pdf.read()
    sig_bytes = await signature.read() if signature else None
    cac_bytes = await cachet.read() if cachet else None

    signed_bytes = sign_pdf(
        pdf_bytes, sig_bytes, cac_bytes,
        sig_w, sig_h, sig_mx, sig_my,
        cac_w, cac_h, cac_mx, cac_my,
        fait_a_lieu, fait_a_date,
    )

    filename = (pdf.filename or "document").replace(".pdf", "_signe.pdf")
    return Response(
        content=signed_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
