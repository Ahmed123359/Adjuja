from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.api.dependencies import get_current_user
from app.config.settings import get_settings
from app.models.user import UserPublic
from app.services.acte_engagement_service import fill_acte_engagement

router = APIRouter(prefix="/acte-engagement", tags=["acte-engagement"])

_MAX_PDF_MB = 10


@router.post(
    "/fill",
    summary="Remplir un Acte d'Engagement PDF",
    response_description="PDF rempli (application/pdf)",
)
async def fill_acte_engagement_endpoint(
    # ── Fichiers ─────────────────────────────────────────────────────────────
    pdf:       UploadFile            = File(...,  description="PDF vierge de l'acte d'engagement"),
    signature: Optional[UploadFile]  = File(None, description="Image de signature (PNG/JPEG)"),
    cachet:    Optional[UploadFile]  = File(None, description="Image du cachet (PNG/JPEG)"),
    # ── Champs communs ────────────────────────────────────────────────────────
    type_soumissionnaire: str = Form("morale",   description="physique | morale | groupement"),
    signataire_nom:       str = Form("",         description="Prénom, Nom et qualité du signataire"),
    adresse_domicile:     str = Form("",         description="Adresse du domicile élu"),
    telephone:            str = Form("",         description="Numéro de téléphone"),
    fax:                  str = Form("",         description="Numéro de fax"),
    email:                str = Form("",         description="Adresse électronique"),
    rib:                  str = Form("",         description="Relevé d'identité bancaire (24 positions)"),
    cnss:                 str = Form("",         description="Numéro d'affiliation CNSS"),
    rc_localite:          str = Form("",         description="Localité du registre du commerce"),
    rc_numero:            str = Form("",         description="Numéro du registre du commerce"),
    taxe_pro:             str = Form("",         description="Numéro de taxe professionnelle"),
    ice:                  str = Form("",         description="Identifiant Commun de l'Entreprise (15 chiffres)"),
    # ── Personne morale ───────────────────────────────────────────────────────
    raison_sociale:       str = Form("",         description="Raison sociale (personne morale)"),
    forme_juridique:      str = Form("",         description="Forme juridique ex: SARL AU, SA..."),
    capital_social:       str = Form("",         description="Capital social ex: 100.000 MAD"),
    adresse_siege:        str = Form("",         description="Adresse du siège social"),
    # ── Groupement ────────────────────────────────────────────────────────────
    membres_groupement:   str = Form("",         description="Membres du groupement (1 par ligne)"),
    # ── Lieu et date ──────────────────────────────────────────────────────────
    fait_a_lieu:          str = Form("",         description="Lieu ex: Casablanca"),
    fait_a_date:          str = Form("",         description="Date ex: 16/03/2026"),
    # ── Auth ──────────────────────────────────────────────────────────────────
    current_user: UserPublic = Depends(get_current_user),
) -> Response:
    """
    Remplit les champs d'un Acte d'Engagement / Déclaration sur l'Honneur PDF.

    Si OPENAI_API_KEY est configurée dans les settings, utilise GPT-4o vision
    pour identifier précisément les zones à remplir (recommandé).
    Sinon, utilise la recherche par mots-clés (mode fallback).

    Retourne le PDF complété en bytes (Content-Disposition: attachment).

    Codes d'erreur :
        400  fichier non PDF ou trop volumineux (> 10 MB)
        500  erreur de traitement (PDF corrompu, erreur GPT-4o...)
    """
    # Validation du fichier PDF
    if not pdf.filename or not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les fichiers PDF sont acceptés.",
        )

    pdf_bytes = await pdf.read()
    size_mb   = len(pdf_bytes) / (1024 * 1024)
    if size_mb > _MAX_PDF_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fichier trop volumineux ({size_mb:.1f} MB). Maximum : {_MAX_PDF_MB} MB.",
        )

    sig_bytes = await signature.read() if signature else None
    cac_bytes = await cachet.read()    if cachet    else None

    settings = get_settings()

    try:
        filled_bytes = await fill_acte_engagement(
            pdf_bytes            = pdf_bytes,
            openai_api_key       = settings.openai_api_key or "",
            type_soumissionnaire = type_soumissionnaire,
            signataire_nom       = signataire_nom,
            adresse_domicile     = adresse_domicile,
            telephone            = telephone,
            fax                  = fax,
            email                = email,
            rib                  = rib,
            cnss                 = cnss,
            rc_localite          = rc_localite,
            rc_numero            = rc_numero,
            taxe_pro             = taxe_pro,
            ice                  = ice,
            raison_sociale       = raison_sociale,
            forme_juridique      = forme_juridique,
            capital_social       = capital_social,
            adresse_siege        = adresse_siege,
            membres_groupement   = membres_groupement,
            fait_a_lieu          = fait_a_lieu,
            fait_a_date          = fait_a_date,
            signature_bytes      = sig_bytes,
            cachet_bytes         = cac_bytes,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors du remplissage : {e}",
        )

    filename = (pdf.filename or "acte_engagement").replace(".pdf", "_rempli.pdf")
    return Response(
        content=filled_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )