from pydantic import BaseModel, Field


class MarcheCreate(BaseModel):
    reference: str = Field(..., description="Référence AO (ex: AO N°18/ANEF)")
    acheteur: str  = Field(..., description="Nom de l'acheteur public")
    objet: str     = Field(default="", description="Objet du marché")


class JobSummary(BaseModel):
    id: str
    job_id: str
    created_at: str
    statut: str


class MarcheResponse(BaseModel):
    id: str
    reference: str
    acheteur: str
    objet: str
    statut: str
    created_at: str
    cps_uploaded: bool
    rc_uploaded: bool
    offre_technique_jobs: list[JobSummary] = []
    filler_jobs: list[JobSummary] = []
    signing_jobs: list[JobSummary] = []


class MarcheSummary(BaseModel):
    id: str
    reference: str
    acheteur: str
    objet: str
    statut: str
    created_at: str
    cps_uploaded: bool
    rc_uploaded: bool
