"""Schémas des tâches d'équipe (tableau de bord collaboratif).

Voir `context/feature-spec/dashboard-collaboratif/api.md`. Les horodatages sont
des chaînes ISO 8601, convention de tout le domaine AO.
"""
from typing import Literal

from pydantic import BaseModel, Field

TaskStatut = Literal["a_faire", "en_cours", "faite"]


class TaskCreate(BaseModel):
    titre: str = Field(min_length=1, max_length=255)
    description: str | None = None
    ao_id: str | None = None
    assignee_id: str | None = None
    echeance: str | None = None
    statut: TaskStatut = "a_faire"


class TaskUpdate(BaseModel):
    """Modification partielle : seuls les champs fournis sont écrits."""
    titre: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    ao_id: str | None = None
    assignee_id: str | None = None
    echeance: str | None = None
    statut: TaskStatut | None = None


class TaskOut(BaseModel):
    id: str
    org_id: str
    ao_id: str | None
    titre: str
    description: str | None
    assignee_id: str | None
    created_by: str
    statut: TaskStatut
    echeance: str | None
    created_at: str
    updated_at: str
    completed_at: str | None
    # Repris de l'AO lié, pour éviter un second appel côté écran.
    ao_reference: str | None = None
    ao_objet: str | None = None


class TaskListOut(BaseModel):
    items: list[TaskOut]
    total: int
    page: int
    limit: int
