from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from app.api.dependencies import get_current_user
from app.models.user import UserPublic
from app.services.acte_engagement_service import fill_acte_engagement

router = APIRouter(prefix="/acte-engagement", tags=["acte-engagement"])


@router.post("/fill")
async def fill_acte_engagement_endpoint(
    pdf:                  UploadFile       = File(...),
    signature:            Optional[UploadFile] = File(None),
    cachet:               Optional[UploadFile] = File(None),
    type_soumissionnaire: str = Form("morale"),
    signataire_nom:       str = Form(""),
    adresse_domicile:     str = Form(""),
    telephone:            str = Form(""),
    fax:                  str = Form(""),
    email:                str = Form(""),
    rib:                  str = Form(""),
    cnss:                 str = Form(""),
    rc_localite:          str = Form(""),
    rc_numero:            str = Form(""),
    taxe_pro:             str = Form(""),
    ice:                  str = Form(""),
    raison_sociale:       str = Form(""),
    forme_juridique:      str = Form(""),
    capital_social:       str = Form(""),
    adresse_siege:        str = Form(""),
    membres_groupement:   str = Form(""),
    fait_a_lieu:          str = Form(""),
    fait_a_date:          str = Form(""),
    current_user: UserPublic = Depends(get_current_user),
) -> Response:
    """
    Remplit les champs d'un Acte d'Engagement PDF et y appose signature + cachet.
    Retourne le PDF complété.
    """
    pdf_bytes = await pdf.read()
    sig_bytes = await signature.read() if signature else None
    cac_bytes = await cachet.read()    if cachet    else None

    filled_bytes = fill_acte_engagement(
        pdf_bytes=pdf_bytes,
        type_soumissionnaire=type_soumissionnaire,
        signataire_nom=signataire_nom,
        adresse_domicile=adresse_domicile,
        telephone=telephone,
        fax=fax,
        email=email,
        rib=rib,
        cnss=cnss,
        rc_localite=rc_localite,
        rc_numero=rc_numero,
        taxe_pro=taxe_pro,
        ice=ice,
        raison_sociale=raison_sociale,
        forme_juridique=forme_juridique,
        capital_social=capital_social,
        adresse_siege=adresse_siege,
        membres_groupement=membres_groupement,
        fait_a_lieu=fait_a_lieu,
        fait_a_date=fait_a_date,
        signature_bytes=sig_bytes,
        cachet_bytes=cac_bytes,
    )

    filename = (pdf.filename or "acte_engagement").replace(".pdf", "_rempli.pdf")
    return Response(
        content=filled_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )