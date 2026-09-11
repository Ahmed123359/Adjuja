import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/defaults", tags=["Défauts"])

# Chemin vers le fichier de configuration partagé (racine du projet)
_DEFAULTS_FILE = Path(__file__).parents[3] / "company_defaults.json"


class CompanyDefaults(BaseModel):
    nom:              str = ""
    forme_juridique:  str = ""
    date_creation:    str = ""
    site_web:         str = ""
    description:      str = ""
    secteurs:         str = ""
    expertises:       str = ""
    certifications:   str = ""
    effectif:         str = ""
    chiffre_affaires: str = ""
    adresse:          str = ""
    ville:            str = ""
    telephone:        str = ""
    rc:               str = ""
    ice:              str = ""
    cnss:             str = ""
    if_fiscal:        str = ""
    references:       str = ""


class AppDefaults(BaseModel):
    company:          CompanyDefaults
    instructions:     str   = ""
    temperature:      float = 0.7
    max_tokens:       int   = 4096
    max_tokens_cumul: int   = 100000
    max_appels:       int   = 50


def _load_defaults() -> AppDefaults:
    """Lit company_defaults.json une seule fois et met en cache."""
    if not _DEFAULTS_FILE.exists():
        return AppDefaults(company=CompanyDefaults())
    raw = json.loads(_DEFAULTS_FILE.read_text(encoding="utf-8"))
    return AppDefaults(**raw)


@router.get(
    "",
    response_model=AppDefaults,
    summary="Valeurs par défaut du formulaire",
    description=(
        "Retourne les valeurs pré-remplies lues depuis `company_defaults.json` "
        "à la racine du projet. Modifiez ce fichier pour changer les defaults "
        "sans toucher au code."
    ),
)
def get_defaults() -> AppDefaults:
    try:
        return _load_defaults()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Impossible de lire company_defaults.json : {exc}") from exc
