"""Schémas de la discussion d'équipe.

Voir `context/feature-spec/dashboard-risque-validations/00-overview.md`, section
« Ce qui manque en base » : rien ne portait de conversation jusqu'ici.
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

RefType = Literal["ao", "ao_document", "task"]


class MessageRef(BaseModel):
    """Pièce citée dans un message : un dossier, un document, une tâche.

    `label` est recopié à l'écriture plutôt que rejoint à la lecture : le nom
    d'un document peut changer ou le document disparaître, et un fil de
    discussion doit rester lisible tel qu'il a été écrit. C'est un
    enregistrement de ce qui a été dit, pas une vue sur l'état courant.
    """
    type:  RefType
    id:    str = Field(min_length=1, max_length=36)
    label: str = Field(min_length=1, max_length=255)


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    task_id: str | None = None
    ao_id: str | None = None
    # Identifiants des membres mentionnés. Le serveur les filtre sur
    # l'organisation : mentionner quelqu'un d'ailleurs ne veut rien dire.
    mentions: list[str] = Field(default_factory=list, max_length=20)
    refs: list[MessageRef] = Field(default_factory=list, max_length=10)

    @field_validator("body")
    @classmethod
    def corps_non_vide(cls, v: str) -> str:
        # Un message d'espaces passe `min_length` mais n'a rien à dire.
        nettoye = v.strip()
        if not nettoye:
            raise ValueError("Le message est vide.")
        return nettoye


class MessageOut(BaseModel):
    id:         str
    org_id:     str
    author_id:  str
    # Recopiés depuis l'utilisateur pour que l'écran n'ait pas à joindre la
    # liste des membres à chaque message.
    author_nom: str
    body:       str
    task_id:    str | None = None
    ao_id:      str | None = None
    mentions:   list[str] = Field(default_factory=list)
    refs:       list[MessageRef] = Field(default_factory=list)
    created_at: str


class MessageListOut(BaseModel):
    items: list[MessageOut]
    total: int
