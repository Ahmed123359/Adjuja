from pydantic import BaseModel
from typing import Any


class StaffCvCreate(BaseModel):
    nom:               str = ""
    prenom:            str = ""
    poste:             str = ""
    specialite:        str = ""
    diplome:           str = ""
    annees_experience: int = 0
    actif:             bool = True
    details:           dict[str, Any] | None = None


class StaffCvUpdate(StaffCvCreate):
    pass


class StaffCvResponse(StaffCvCreate):
    id:           str
    org_id:       str
    created_at:   str
    updated_at:   str
    cv_minio_key: str | None = None
    cv_url:       str | None = None


class AoTeamMemberResponse(BaseModel):
    id:                str
    ao_id:             str
    staff_cv_id:       str | None
    created_at:        str
    role_dans_offre:   str
    profil_requis_ref: str | None
    warning:           bool
    cv:                StaffCvResponse | None = None
