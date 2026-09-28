from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class CompanyCase(str, Enum):
    """Variantes juridiques du soumissionnaire supportées par le filler."""
    SOCIETE           = "societe"
    PERSONNE_PHYSIQUE = "personne_physique"
    AUTO_ENTREPRENEUR = "auto_entrepreneur"
    GROUPEMENT        = "groupement"
    COOPERATIVE       = "cooperative"
    ETABLISSEMENT     = "etablissement_public"


class FillerRequest(BaseModel):
    """
    Paramètres de remplissage d'un dossier AO.

    Le PDF est reçu séparément via UploadFile (multipart/form-data).
    Ce modèle encode les métadonnées du traitement.
    """
    company_case: CompanyCase = Field(
        default=CompanyCase.SOCIETE,
        description="Variante juridique du soumissionnaire",
    )
    lots: list[int] = Field(
        default_factory=list,
        description="Numéros de lots à traiter (vide = tous les lots détectés)",
    )


class FillerOutputFile(BaseModel):
    """Fichier produit par le pipeline de remplissage."""
    doc_type:    str  = Field(..., description="Type de document (acte_engagement, bordereau_prix, ...)")
    filename:    str  = Field(..., description="Nom du fichier produit")
    format:      str  = Field(..., description="Format du fichier (pdf, docx, xlsx)")
    download_url: str = Field(..., description="URL de téléchargement")
    minio_key:   str  = Field(default="", description="Clé MinIO directe")


class FillerResult(BaseModel):
    """Résultat complet d'un traitement de remplissage."""
    job_id:    str               = Field(..., description="Identifiant unique du traitement")
    succes:    bool              = Field(..., description="True si au moins un fichier a été produit")
    fichiers:  list[FillerOutputFile] = Field(default_factory=list, description="Fichiers produits")
    erreurs:   list[str]         = Field(default_factory=list,  description="Erreurs non fatales")
    message:   str               = Field(default="",            description="Message de statut")
