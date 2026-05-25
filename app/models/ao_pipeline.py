from pydantic import BaseModel
from typing import Any


class AoCreate(BaseModel):
    reference: str = ""
    acheteur: str = ""
    objet: str = ""
    custom_instructions: str | None = None


class AoDocumentOut(BaseModel):
    id: str
    dossier: str
    doc_type: str
    origine: str
    statut: str
    nom_fichier: str
    taille_octets: int
    minio_key: str | None


class AoSummary(BaseModel):
    id: str
    reference: str
    acheteur: str
    objet: str
    statut: str
    pipeline_pct: int
    created_at: str
    updated_at: str


class AoResponse(AoSummary):
    erreur_message: str | None
    analyse_json: dict[str, Any] | None
    custom_instructions: str | None
    documents: list[AoDocumentOut]


class AoStatus(BaseModel):
    id: str
    statut: str
    pipeline_pct: int
    erreur_message: str | None
