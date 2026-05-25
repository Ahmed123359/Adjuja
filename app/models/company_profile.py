from pydantic import BaseModel
from typing import Any


class CompanyProfileUpsert(BaseModel):
    nom_entreprise: str = ""
    ice:            str = ""
    rc:             str = ""
    if_fiscal:      str = ""
    cnss:           str = ""
    adresse:        str = ""
    ville:          str = ""
    telephone:      str = ""
    email:          str = ""
    gerant_nom:     str = ""
    gerant_prenom:  str = ""
    gerant_cin:     str = ""
    secteur:        str = ""
    extra:          dict[str, Any] | None = None


class CompanyProfileResponse(CompanyProfileUpsert):
    id:                  str
    org_id:              str
    created_at:          str
    updated_at:          str
    complet:             bool
    signature_minio_key: str | None = None
    cachet_minio_key:    str | None = None
    signature_url:       str | None = None
    cachet_url:          str | None = None


class ProfileCompletenessCheck(BaseModel):
    complet:          bool
    champs_manquants: list[str]
    message:          str | None
