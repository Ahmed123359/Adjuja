# -*- coding: utf-8 -*-
"""
Analyse CPS/RC d'un AO scrape par le modele du role « analysis »
(LLM_ANALYSIS, app/core/llm.py). Calculee UNE SEULE FOIS par AO
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

from app.core.config import settings
from app.core.llm import get_chat
from app.core.models import ScrapedAo
from app.modules.ao_scraper import ocr

log = structlog.get_logger(__name__)


class AnalysisError(Exception):
    pass


class OcrRequise(AnalysisError):
    """Le CPS/RC n'a pas de couche texte et n'a pas encore ete lu par OCR :
    la route lance l'OCR en tache de fond au lieu de renvoyer une erreur."""


def _minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def _extract_pdf_text(minio_key: str, max_chars: int) -> tuple[str, int]:
    """Retourne (texte tronque, nombre de caracteres perdus).

    La troncature etait muette : sur un gros CPS le modele analysait un document
    ampute sans qu'aucun signal ne remonte. L'appelant sait desormais ce qui a
    ete coupe et le fait remonter dans l'analyse.
    """
    minio = _minio_client()
    response = minio.get_object(settings.minio_bucket, minio_key)
    try:
        pdf_bytes = response.read()
    finally:
        response.close()
        response.release_conn()
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
        text = "".join(page.get_text() for page in pdf)
    # Document scanne : le texte vient de l'OCR, s'il a deja ete fait
    # (cache MinIO ecrit par app/workers/tasks/ocr_tasks.py).
    if len(text.strip()) < ocr.SEUIL_TEXTE:
        text = ocr.lire_cache(minio, settings.minio_bucket, minio_key) or text
    perdu = max(0, len(text) - max_chars)
    if perdu:
        log.warning(
            "Texte tronque avant analyse",
            minio_key=minio_key, garde=max_chars, perdu=perdu, total=len(text),
        )
    return text[:max_chars], perdu


def _collect_docs(docs: dict, prefixe: str) -> list[tuple[str, str]]:
    """Toutes les cles d'un type de document, lot 1 compris.

    Un AO multi-lots stocke `cps`, `cps_2`, `cps_3`... depuis le correctif de
    collision de labels du 2026-08-17. `docs.get("cps")` n'en lisait qu'une :
    les lots 2 et suivants n'etaient jamais analyses, en silence.
    """
    trouves = []
    for cle, valeur in docs.items():
        if not valeur:
            continue
        if cle == prefixe or re.fullmatch(rf"{re.escape(prefixe)}_\d+", cle):
            trouves.append((cle, valeur))
    # `cps` d'abord, puis `cps_2`, `cps_3`... dans l'ordre des lots.
    def rang(item: tuple[str, str]) -> int:
        cle = item[0]
        return 1 if cle == prefixe else int(cle.rsplit("_", 1)[1])
    return sorted(trouves, key=rang)


def _lire_type(docs: dict, prefixe: str, budget: int) -> tuple[str, dict]:
    """Concatene tous les lots d'un type de document dans un budget donne.

    Le budget total est inchange par rapport a l'ancien comportement : il est
    simplement reparti entre les lots trouves, pour qu'un AO a trois lots n'en
    envoie pas trois fois plus au modele.
    """
    cles = _collect_docs(docs, prefixe)
    if not cles:
        return "", {"lots": 0}

    part = max(4000, budget // len(cles))
    morceaux, perdu_total, lu_total = [], 0, 0
    for cle, minio_key in cles:
        texte, perdu = _extract_pdf_text(minio_key, part)
        perdu_total += perdu
        lu_total += len(texte)
        entete = f"\n\n--- {cle.upper()} ---\n" if len(cles) > 1 else ""
        morceaux.append(entete + texte)

    return "".join(morceaux), {
        "lots": len(cles),
        "cles": [c for c, _ in cles],
        "caracteres_lus": lu_total,
        "caracteres_perdus": perdu_total,
    }


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
    appelle le modele d'analyse. Leve AnalysisError si aucun cps/rc n'est disponible."""
    docs = ao.classified_docs or {}

    cps_text, meta_cps = _lire_type(docs, "cps", 60000)
    rc_text, meta_rc = _lire_type(docs, "rc", 40000)

    if not meta_cps["lots"] and not meta_rc["lots"]:
        raise AnalysisError(
            "Aucun CPS ni RC disponible pour cet AO. Favorisez l'AO et "
            "attendez le telechargement des documents avant d'analyser."
        )
    # Documents presents mais sans couche texte : ce n'est PAS "aucun document".
    # L'ancien test `not cps_text and not rc_text` confondait les deux cas et
    # renvoyait a l'utilisateur un diagnostic faux (constate sur l'AO 599).
    # Meme seuil que la tache d'OCR : un scan avec une ligne d'en-tete tapee
    # (quelques dizaines de caracteres) reste un scan.
    if (meta_cps.get("caracteres_lus") or 0) < ocr.SEUIL_TEXTE and (meta_rc.get("caracteres_lus") or 0) < ocr.SEUIL_TEXTE:
        if ocr.ocr_disponible():
            raise OcrRequise("Documents scannes : lecture OCR necessaire.")
        raise AnalysisError(
            "Le CPS et le RC de cet AO ne contiennent aucun texte extractible "
            "(documents probablement scannes). L'analyse automatique necessite "
            "une reconnaissance de caracteres (OCR), non disponible pour la veille."
        )

    if meta_cps["lots"] > 1 or meta_rc["lots"] > 1:
        log.info(
            "AO multi-lots analyse",
            ao_id=ao.id, lots_cps=meta_cps["lots"], lots_rc=meta_rc["lots"],
        )

    # Role « analysis » (LLM_ANALYSIS) : le fournisseur se choisit dans .env.
    try:
        raw = await get_chat().complete(
            "Tu es un expert en marches publics marocains. Tu reponds en JSON.",
            _build_analyze_prompt(cps_text, rc_text),
            json_mode=True, max_tokens=8000, temperature=0.1,
        )
    except Exception as exc:
        # Une panne du fournisseur (cle refusee, quota, reseau) remontait en 500
        # brut ; l'ecran recoit maintenant une phrase qui dit quoi faire.
        log.error("Appel du modele d'analyse echoue", ao_id=ao.id, error=str(exc))
        raise AnalysisError(
            "Le service d'analyse IA n'a pas repondu (cle API refusee ou service "
            "indisponible). Le texte des documents est conserve : relancez "
            "l'analyse une fois le service retabli."
        ) from exc
    raw = raw or "{}"
    try:
        resultat = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise AnalysisError("Reponse du modele d'analyse non interpretable en JSON.")
        resultat = json.loads(match.group())

    # Metadonnees d'analyse, prefixees par `_` : elles disent sur quoi le modele
    # a reellement travaille. Sans elles, une analyse partielle (un lot manquant,
    # un CPS tronque) est indiscernable d'une analyse complete.
    # `.get` obligatoire : un type absent a pour meta {"lots": 0}. La premiere
    # version indexait directement et levait KeyError sur tout AO sans RC.
    resultat["_analyse_meta"] = {
        "cps": meta_cps,
        "rc": meta_rc,
        "partielle": bool(meta_cps.get("caracteres_perdus") or meta_rc.get("caracteres_perdus")),
        # Types presents dont aucun texte n'a pu etre extrait (scans) : l'analyse
        # a alors ete produite sans eux, ce qui doit rester visible.
        "sans_texte": [t for t, m in (("cps", meta_cps), ("rc", meta_rc))
                       if m.get("lots") and not m.get("caracteres_lus")],
    }
    return resultat
