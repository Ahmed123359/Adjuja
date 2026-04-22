"""
company_adapter.py
------------------
Mappe les données de company_defaults.json vers le dictionnaire COMPANY_INFO
attendu par les prompts LLM du filler.

Raison de cette couche :
    - tache-01-02 utilisait un fichier company_info.py statique avec des valeurs
      mock codées en dur.
    - OffrIA stocke les données réelles de l'entreprise dans company_defaults.json
      (chargé au démarrage via defaults_routes.py).
    - Ce module fait le pont en lisant company_defaults.json à la demande et en
      construisant la structure attendue par les prompts Mistral/Pixtral.

Les champs financiers (montants HT, TVA, TTC) ne sont pas dans company_defaults.json —
ils sont inconnus à l'avance et seront remplis contextuellement par le LLM
à partir du document lui-même. On les laisse vides.
"""

import json
from functools import lru_cache
from pathlib import Path

_DEFAULTS_PATH = Path(__file__).parent.parent.parent.parent / "company_defaults.json"


def _load_defaults() -> dict:
    """Charge company_defaults.json depuis la racine du projet."""
    if not _DEFAULTS_PATH.exists():
        return {}
    with _DEFAULTS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def get_company_info() -> dict[str, str]:
    """
    Construit le dictionnaire COMPANY_INFO à partir de company_defaults.json.

    Retourne toujours un dict valide (valeurs vides si fichier absent).
    Les champs financiers sont intentionnellement laissés vides : le LLM
    les extrait du contexte du document lors du remplissage.
    """
    raw     = _load_defaults()
    company = raw.get("company", {})

    adresse = company.get("adresse", "")
    ville   = company.get("ville", "")
    address = f"{adresse}, {ville}".strip(", ") if adresse or ville else ""

    return {
        # Identité juridique
        "company_name":    company.get("nom", ""),
        "manager_name":    company.get("nom", ""),
        "manager_quality": company.get("forme_juridique", "Gérant"),

        # Coordonnées
        "phone":   company.get("telephone", ""),
        "fax":     "",
        "email":   "",
        "address": address,
        "city":    ville,

        # Immatriculation
        "cnss":      company.get("cnss", ""),
        "rc_number": company.get("rc", ""),
        "tp_number": company.get("if_fiscal", ""),
        "ice":       company.get("ice", ""),

        # Coordonnées bancaires
        "rib":       "",
        "bank_type": "bancaire",

        # Données financières — remplies par le LLM depuis le document
        "amount_ht":     "",
        "tva_rate":      "20%",
        "amount_tva":    "",
        "amount_ttc":    "",
        "estimated_ttc": "",
        "discount_rate": "",
    }
