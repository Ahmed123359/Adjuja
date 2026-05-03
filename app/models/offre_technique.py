from pydantic import BaseModel, Field


class CPSContext(BaseModel):
    scope:      str = ""
    acheteur:   str = ""
    reference:  str = ""
    delais:     str = ""
    plan_rc:    str = ""
    criteres:   list[dict] = Field(default_factory=list)
    lots:       list[str]  = Field(default_factory=list)


class StrategyAngle(BaseModel):
    angle:           str
    narrative:       str
    differentiators: list[str]


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
