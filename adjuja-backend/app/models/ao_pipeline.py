from pydantic import BaseModel
from typing import Any


class AoCreate(BaseModel):
    reference: str = ""
    acheteur: str = ""
    objet: str = ""
    custom_instructions: str | None = None
    date_limite: str | None = None


class AoUpdate(BaseModel):
    """Modification partielle d'un AO. Volontairement limitee a ce que
    l'utilisateur saisit : statut, pipeline_pct et mode appartiennent au
    pipeline et ne doivent pas etre modifiables de l'exterieur."""
    reference: str | None = None
    acheteur: str | None = None
    objet: str | None = None
    date_limite: str | None = None
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
    date_limite: str | None = None
    # "express" (un clic, tout s'enchaîne) ou "accompagne" (7 étapes validées)
    mode: str = "express"


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


# ---------------------------------------------------------------------------
# Mode accompagné : parcours en 7 étapes avec porte de validation
# ---------------------------------------------------------------------------

class StartPipelinePayload(BaseModel):
    """Corps optionnel de start-pipeline. Le défaut "express" garantit que les
    appels existants, qui n'envoient pas de corps, ne changent pas de comportement."""
    mode: str = "express"


class AoStepOut(BaseModel):
    step_key: str
    step_order: int
    statut: str
    applicable: bool | None
    erreur_message: str | None
    started_at: str | None
    completed_at: str | None
    validated_at: str | None
    validated_by: str | None


class ValidateStepPayload(BaseModel):
    """Corrections apportées par l'utilisateur à l'étape avant de la valider.

    Elles sont appliquées avant de passer à l'étape suivante, pour qu'une
    correction soit réellement reprise et jamais écrasée par une regénération.
    """
    corrections: dict[str, Any] | None = None


class StepAssistPayload(BaseModel):
    """Question posee a l'assistant IA, dans le contexte d'une etape."""
    messages: list[dict[str, str]]
    provider: str = "mistral"
    model: str = ""


class StepAssistResponse(BaseModel):
    answer: str
    sources: list[str] = []
