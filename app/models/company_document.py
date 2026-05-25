from pydantic import BaseModel

COMPANY_DOC_TYPES = [
    "pouvoir_gerance",
    "attestation_fiscale",
    "attestation_cnas",
    "attestation_casnos",
    "reference_realisation",
    "diplome",
    "autre",
]


class CompanyDocumentCreate(BaseModel):
    doc_type:      str
    description:   str | None = None
    date_validite: str | None = None


class CompanyDocumentResponse(CompanyDocumentCreate):
    id:          str
    org_id:      str
    created_at:  str
    updated_at:  str
    nom_fichier: str
    minio_key:   str | None = None
    file_url:    str | None = None
