# -*- coding: utf-8 -*-
"""
Analyse CPS/RC d'un AO scrape via Mistral. Calculee UNE SEULE FOIS par AO
(cf. router.py : si scraped_aos.analyse_json existe deja, ce module n'est
jamais rappele) -- le resultat est partage entre toutes les orgs qui
consultent cet AO.

Port du prompt de app/tasks/ao_tasks.py::_build_analyze_prompt (app principale),
etendu avec les champs d'eligibilite necessaires au verdict Go/No-Go calcule
cote app principale (app/services/eligibility_service.py).
"""

import json
import re

import fitz
import structlog
from minio import Minio
from mistralai import Mistral

from app.core.config import settings
from app.core.models import ScrapedAo

log = structlog.get_logger(__name__)


class AnalysisError(Exception):
    pass


def _minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def _extract_pdf_text(minio_key: str, max_chars: int) -> str:
    minio = _minio_client()
    response = minio.get_object(settings.minio_bucket, minio_key)
    try:
        pdf_bytes = response.read()
    finally:
        response.close()
        response.release_conn()
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
        text = "".join(page.get_text() for page in pdf)
    return text[:max_chars]


def _build_analyze_prompt(cps_text: str, rc_text: str) -> str:
    rc_section = f"\n\n=== REGLEMENT DE CONSULTATION (RC) ===\n{rc_text}" if rc_text else "\n(RC non disponible)"
    return f"""Tu es un expert en marches publics marocains. Analyse ce dossier d'appel d'offres et retourne un JSON structure.

=== CAHIER DES PRESCRIPTIONS SPECIALES (CPS) ===
{cps_text}{rc_section}

Retourne UNIQUEMENT un JSON valide (sans markdown) avec cette structure :
{{
  "contexte": {{
    "intitule": "...",
    "acheteur": "...",
    "objet": "...",
    "date_limite": "...",
    "budget_estime": null,
    "lots": []
  }},
  "documents_requis": [
    {{"nom": "note_metho", "obligatoire": true, "source": "generer"}},
    {{"nom": "acte_engagement", "obligatoire": true, "source": "remplir"}},
    {{"nom": "bordereau", "obligatoire": true, "source": "remplir"}},
    {{"nom": "declaration_honneur", "obligatoire": true, "source": "remplir"}}
  ],
  "criteres_ponderation": [
    {{"nom": "offre technique", "poids": 60}},
    {{"nom": "offre financiere", "poids": 40}}
  ],
  "profils_requis": [
    {{
      "poste": "Chef de projet",
      "specialite": "genie civil",
      "diplome_min": "Ingenieur d'etat",
      "annees_experience_min": 10,
      "description": "texte exact du CPS"
    }}
  ],
  "qualification_requise": "texte exact de la qualification/classification exigee, ou null si non precisee",
  "certifications_requises": ["ISO 9001:2015", "..."],
  "chiffre_affaires_minimum_exige": null,
  "nombre_references_similaires_exige": null,
  "montant_caution": null
}}

REGLES :
- documents_requis : liste les docs EXIGES par le RC
- profils_requis : TOUS les profils humains exiges. Si aucun, retourner []
- qualification_requise : la classification/qualification BTP ou la specialite exigee (texte tel qu'ecrit dans le CPS/RC), null si non mentionnee
- certifications_requises : liste des certifications/agrements explicitement exiges (ISO, agrements specifiques...), [] si aucun
- chiffre_affaires_minimum_exige : montant numerique en MAD si un seuil de chiffre d'affaires est exige, sinon null
- nombre_references_similaires_exige : nombre entier de references similaires exigees, sinon null
- montant_caution : montant numerique du cautionnement provisoire si precise, sinon null
- Si RC absent : deduis depuis le CPS, marque date_limite="non_disponible"
"""


async def analyze_ao(ao: ScrapedAo) -> dict:
    """Extrait le texte du CPS/RC (deja sur MinIO via classified_docs) et
    appelle Mistral. Leve AnalysisError si aucun cps/rc n'est disponible."""
    docs = ao.classified_docs or {}
    cps_key = docs.get("cps")
    rc_key = docs.get("rc")

    if not cps_key and not rc_key:
        raise AnalysisError(
            "Aucun CPS ni RC disponible pour cet AO. Favorisez l'AO et "
            "attendez le telechargement des documents avant d'analyser."
        )

    cps_text = _extract_pdf_text(cps_key, 60000) if cps_key else ""
    rc_text = _extract_pdf_text(rc_key, 40000) if rc_key else ""

    client = Mistral(api_key=settings.mistral_api_key)
    response = client.chat.complete(
        model="mistral-large-latest",
        messages=[{"role": "user", "content": _build_analyze_prompt(cps_text, rc_text)}],
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise AnalysisError("Reponse Mistral non interpretable en JSON.")
        return json.loads(match.group())
