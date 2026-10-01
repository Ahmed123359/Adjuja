"""Suivi d'un dossier après dépôt. Spec :
context/feature-spec/suivi-resultats/00-overview.md (phase 1)."""

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Nature = Literal["travaux", "fournitures", "services", "etudes", "gardiennage_nettoyage"]
StatutFinal = Literal["en_attente", "retenu", "non_retenu", "infructueux", "annule"]
StatutOffre = Literal["en_attente", "admis", "ecarte_administratif", "ecarte_technique"]

Montant = Decimal  # >= 0, deux décimales
_MONTANT = Field(None, ge=0, le=Decimal("9999999999999.99"), decimal_places=2)
_NOTE = Field(None, ge=0, le=100, decimal_places=2)


class SuiviIn(BaseModel):
    nature_marche: Nature = "travaux"
    estimation_mad: Decimal | None = _MONTANT
    # Règlement de consultation, études seulement (art. 144) : poids de la
    # note financière, entre 10 et 40 points sur 100 ; seuil technique.
    poids_financier: Decimal | None = Field(None, ge=10, le=40, decimal_places=2)
    seuil_technique: Decimal | None = _NOTE
    date_depot: str | None = Field(None, max_length=50)
    date_ouverture: str | None = Field(None, max_length=50)
    statut_final: StatutFinal = "en_attente"
    attributaire: str | None = Field(None, max_length=255)
    montant_attribue: Decimal | None = _MONTANT


class OffreIn(BaseModel):
    nom: str = Field(..., min_length=1, max_length=255)
    est_nous: bool = False
    montant_lu: Decimal | None = _MONTANT
    montant_corrige: Decimal | None = _MONTANT
    statut: StatutOffre = "en_attente"
    motif: str | None = Field(None, max_length=2000)
    note_technique: Decimal | None = _NOTE


class OffresIn(BaseModel):
    offres: list[OffreIn] = Field(..., max_length=80)

    @model_validator(mode="after")
    def _une_seule_offre_nous(self) -> "OffresIn":
        if sum(1 for o in self.offres if o.est_nous) > 1:
            raise ValueError("Une seule offre peut être la vôtre.")
        return self


class OffreOut(OffreIn):
    id: str
    # Issue du calcul : retenue | excessive | anormalement_basse |
    # ecarte_administratif | ecarte_technique | sous_seuil_technique | sans_montant
    issue: str | None = None
    rang: int | None = None
    ecart_reference_pct: Decimal | None = None
    taux_majoration_pct: Decimal | None = None
    note_financiere: Decimal | None = None
    note_globale: Decimal | None = None
    gagnante: bool = False


class ClassementOut(BaseModel):
    calculable: bool
    raison: str | None
    prix_reference: Decimal | None
    gagnante_id: str | None
    avertissements: list[str]
    notre_rang: int | None
    # Montant de notre offre moins celui de la gagnante (négatif : nous sommes
    # en dessous). None si nous gagnons ou si l'un des deux manque.
    ecart_avec_gagnante: Decimal | None


class SuiviOut(BaseModel):
    ouvert: bool                    # faux tant que le dossier n'est pas marqué déposé
    suivi: SuiviIn | None
    offres: list[OffreOut]
    classement: ClassementOut | None
    # Suggestions tirées de la veille pour un dossier qui en vient (jamais imposées).
    estimation_suggeree: Decimal | None = None
    nature_suggeree: Nature | None = None
    nom_entreprise: str = ""
