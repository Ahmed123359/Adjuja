"""
company_adapter.py
------------------
Construit le dictionnaire COMPANY_INFO attendu par les prompts LLM du filler.

Source prioritaire : CompanyProfile depuis la DB (pipeline AO).
Fallback : company_defaults.json (filler standalone legacy).

Les champs financiers (montants HT, TVA, TTC) sont laissés vides :
le LLM les extrait du document lui-même.
"""

import json
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.db.models import CompanyProfile

_DEFAULTS_PATH = Path(__file__).parent.parent.parent.parent / "company_defaults.json"

# Override injecté par filler_service lors du pipeline AO (thread-safe car Celery prefork)
_OVERRIDE: dict | None = None


def _load_defaults() -> dict:
    if not _DEFAULTS_PATH.exists():
        return {}
    with _DEFAULTS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def get_company_info(profile: "CompanyProfile | None" = None) -> dict[str, str]:
    """
    Retourne le dict COMPANY_INFO pour les prompts du filler.

    Si `profile` est fourni (CompanyProfile depuis DB) : utilise ces données.
    Sinon : fallback sur company_defaults.json (compatibilité filler standalone).
    """
    if _OVERRIDE is not None:
        return _OVERRIDE

    if profile is not None:
        address = f"{profile.adresse}, {profile.ville}".strip(", ") if (profile.adresse or profile.ville) else ""
        gerant  = f"{profile.gerant_prenom} {profile.gerant_nom}".strip()
        return {
            # Identité
            "company_name":    profile.nom_entreprise,
            "forme_juridique": getattr(profile, "forme_juridique", "") or "",
            "secteur":         profile.secteur,
            # Gérant
            "manager_name":    gerant,
            "manager_quality": getattr(profile, "forme_juridique", "Gérant") or "Gérant",
            "manager_cin":     profile.gerant_cin,
            # Contact
            "phone":           profile.telephone,
            "fax":             "",
            "email":           profile.email,
            "address":         address,
            "city":            profile.ville,
            # Identifiants légaux
            "ice":             profile.ice,
            "rc_number":       profile.rc,
            "tp_number":       profile.if_fiscal,
            "cnss":            profile.cnss,
            "capital_social":  getattr(profile, "capital_social", "") or "",
            # Bancaire
            "rib":             getattr(profile, "rib", "") or "",
            "bank_type":       "bancaire",
            # Financiers (extraits du document par le filler)
            "amount_ht":       "",
            "tva_rate":        "20%",
            "amount_tva":      "",
            "amount_ttc":      "",
            "estimated_ttc":   "",
            "discount_rate":   "",
        }

    # Fallback JSON legacy
    raw     = _load_defaults()
    company = raw.get("company", {})
    adresse = company.get("adresse", "")
    ville   = company.get("ville", "")
    address = f"{adresse}, {ville}".strip(", ") if adresse or ville else ""

    return {
        "company_name":    company.get("nom", ""),
        "manager_name":    company.get("nom", ""),
        "manager_quality": company.get("forme_juridique", "Gérant"),
        "phone":           company.get("telephone", ""),
        "fax":             "",
        "email":           "",
        "address":         address,
        "city":            ville,
        "cnss":            company.get("cnss", ""),
        "rc_number":       company.get("rc", ""),
        "tp_number":       company.get("if_fiscal", ""),
        "ice":             company.get("ice", ""),
        "rib":             "",
        "bank_type":       "bancaire",
        "amount_ht":       "",
        "tva_rate":        "20%",
        "amount_tva":      "",
        "amount_ttc":      "",
        "estimated_ttc":   "",
        "discount_rate":   "",
    }
