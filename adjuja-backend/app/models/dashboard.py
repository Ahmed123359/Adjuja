"""Schémas du tableau de bord : résumé, calendrier, risque d'échéance et
validations en attente.

Voir `context/feature-spec/dashboard-collaboratif/api.md` pour le résumé et le
calendrier, `context/feature-spec/dashboard-risque-validations/00-overview.md`
pour le risque et les validations.
"""
from typing import Literal

from pydantic import BaseModel

EventType = Literal["ao_deadline", "task"]


class CalendarEvent(BaseModel):
    date: str          # AAAA-MM-JJ
    type: EventType
    titre: str
    statut: str
    ao_id: str | None = None
    task_id: str | None = None


class NextDeadline(BaseModel):
    date: str
    titre: str
    type: EventType
    ao_id: str | None = None
    task_id: str | None = None


class DashboardSummary(BaseModel):
    # Nombre d'AO par statut : brouillon, en_analyse, en_traitement, termine...
    ao_par_statut: dict[str, int]
    ao_total: int
    taches_ouvertes: int
    mes_taches_ouvertes: int
    taches_en_retard: int
    prochaine_echeance: NextDeadline | None = None


# --------------------------------------------------------------------------- #
#  Risque d'échéance                                                           #
# --------------------------------------------------------------------------- #

# `ok` n'est jamais renvoyé : un AO qui va bien n'a rien à faire dans une liste
# de ce qui va mal. Le niveau est calculé côté serveur pour que l'écran n'ait
# pas à réinventer les seuils.
RiskLevel = Literal["en_retard", "critique", "tendu"]


class AtRiskItem(BaseModel):
    ao_id:     str
    reference: str
    objet:     str
    acheteur:  str
    date_limite: str                 # AAAA-MM-JJ
    # Négatif si la date est dépassée : c'est la lecture directe « en retard de 3 jours ».
    jours_restants: int
    # 0 à 100, calculée selon le mode de l'AO (voir dashboard_service.progression).
    progression: int
    # avance - temps consommé, de -1 à 1. Négatif = en retard sur le rythme.
    marge:     float
    mode:      str
    statut:    str
    niveau:    RiskLevel
    # L'étape qui bloque, en mode accompagné uniquement.
    etape_courante: str | None = None


class AtRiskOut(BaseModel):
    items: list[AtRiskItem]
    # AO actifs sans date limite : leur risque n'est pas calculable, et c'est en
    # soi une anomalie à corriger (la date était perdue à l'import avant la
    # migration 014). Les taire les rendrait invisibles.
    sans_echeance: int


# --------------------------------------------------------------------------- #
#  Validations en attente                                                      #
# --------------------------------------------------------------------------- #

class PendingValidationItem(BaseModel):
    ao_id:      str
    reference:  str
    objet:      str
    step_key:   str
    step_order: int
    # Depuis quand l'étape attend. None si `started_at` n'a pas été posé.
    depuis:     str | None = None
    jours_attente: int
    # Date limite de l'AO : une validation qui traîne sur un dossier à rendre
    # demain n'a pas le même poids qu'une autre.
    date_limite: str | None = None


class PendingValidationsOut(BaseModel):
    items: list[PendingValidationItem]
    total: int
