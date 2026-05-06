import json
from pydantic import BaseModel, Field, field_validator


def _to_str(v: object) -> str:
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return ", ".join(f"{k}: {val}" for k, val in v.items())
    if isinstance(v, list):
        return ", ".join(str(i) for i in v)
    return str(v) if v is not None else ""


class CPSContext(BaseModel):
    scope:                str = ""
    acheteur:             str = ""
    reference:            str = ""
    delais:               str = ""
    plan_rc:              str = ""
    criteres:             list[dict] = Field(default_factory=list)
    lots:                 list[str]  = Field(default_factory=list)
    nb_sessions:          str = ""
    horaire:              str = ""
    livrables:            list[str]  = Field(default_factory=list)
    exigences_formateurs: str = ""
    planning_note:        str = ""
    sous_traitance:       str = ""

    @field_validator("scope", "acheteur", "reference", "delais", "plan_rc",
                     "nb_sessions", "horaire", "exigences_formateurs",
                     "planning_note", "sous_traitance", mode="before")
    @classmethod
    def coerce_to_str(cls, v: object) -> str:
        return _to_str(v)


class StrategyAngle(BaseModel):
    angle:           str
    narrative:       str
    differentiators: list[str] = Field(default_factory=list)

    @field_validator("angle", "narrative", mode="before")
    @classmethod
    def coerce_to_str(cls, v: object) -> str:
        return _to_str(v)


class SectionScore(BaseModel):
    score:  float
    issues: list[str] = Field(default_factory=list)


class QualityReport(BaseModel):
    conformite:      SectionScore
    coherence:       SectionScore
    differentiation: SectionScore
    global_score:    float
    approved:        bool


class OffreTechniqueOutputFile(BaseModel):
    filename:     str
    format:       str
    download_url: str


class OffreTechniqueResult(BaseModel):
    job_id:        str
    succes:        bool
    fichiers:      list[OffreTechniqueOutputFile] = Field(default_factory=list)
    quality:       QualityReport | None = None
    erreurs:       list[str]           = Field(default_factory=list)
    message:       str = ""
