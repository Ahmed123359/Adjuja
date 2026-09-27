"""
Verdict Go/No-Go : compare les exigences extraites du CPS/RC (analyse_json,
calcule une seule fois par AO cote ao-watcher) au profil d'eligibilite de
l'org appelante (company_profiles.extra). Aucune comparaison ne necessite
d'appel IA supplementaire : c'est une comparaison Python deterministe.
"""

from datetime import date, datetime
from typing import Any


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    f = _to_float(value)
    return int(f) if f is not None else None


def compute_verdict(
    analyse_json: dict,
    date_limite: str | None,
    extra: dict[str, Any] | None,
) -> dict:
    extra = extra or {}
    hard_fails: list[str] = []
    soft_flags: list[str] = []
    details: dict[str, Any] = {}

    # --- Chiffre d'affaires ---------------------------------------------
    ca_requis = _to_float(analyse_json.get("chiffre_affaires_minimum_exige"))
    ca_org = _to_float(extra.get("chiffre_affaires_moyen"))
    if ca_requis is not None:
        details["chiffre_affaires"] = {"exige": ca_requis, "votre_ca": ca_org}
        if ca_org is None:
            soft_flags.append(
                f"CA minimum exige ({ca_requis:,.0f} MAD) mais aucun CA renseigne dans votre profil."
            )
        elif ca_org < ca_requis:
            hard_fails.append(
                f"Chiffre d'affaires insuffisant : exige {ca_requis:,.0f} MAD, votre CA moyen est {ca_org:,.0f} MAD."
            )

    # --- References similaires -------------------------------------------
    nb_requis = _to_int(analyse_json.get("nombre_references_similaires_exige"))
    references = extra.get("references_similaires") or []
    nb_org = len(references) if isinstance(references, list) else 0
    if nb_requis is not None:
        details["references_similaires"] = {"exige": nb_requis, "vous_avez": nb_org}
        if nb_org < nb_requis:
            hard_fails.append(
                f"References similaires insuffisantes : {nb_requis} exigee(s), {nb_org} renseignee(s) dans votre profil."
            )

    # --- Certifications -----------------------------------------------------
    certifs_requises = analyse_json.get("certifications_requises") or []
    certifs_org = extra.get("certifications") or []
    certifs_org_norm = [c.lower() for c in certifs_org if isinstance(c, str)]
    manquantes = [
        c for c in certifs_requises
        if isinstance(c, str) and not any(c.lower() in org_c or org_c in c.lower() for org_c in certifs_org_norm)
    ]
    if certifs_requises:
        details["certifications"] = {"exigees": certifs_requises, "manquantes": manquantes}
        if manquantes:
            hard_fails.append(f"Certification(s) manquante(s) : {', '.join(manquantes)}.")

    # --- Qualification / classification (soft, jamais hard-fail) -----------
    qualification_requise = analyse_json.get("qualification_requise")
    classifications = extra.get("classifications") or []
    if qualification_requise:
        qual_lower = str(qualification_requise).lower()
        domaines = [
            c.get("domaine", "") for c in classifications
            if isinstance(c, dict) and c.get("domaine")
        ]
        match = any(d.lower() in qual_lower or qual_lower in d.lower() for d in domaines if d)
        details["qualification"] = {"exigee": qualification_requise, "domaine_trouve": match}
        if match:
            soft_flags.append(
                f"Qualification exigee ({qualification_requise}) : domaine present dans votre profil, niveau (classe/categorie) a verifier manuellement."
            )
        else:
            soft_flags.append(
                f"Qualification exigee ({qualification_requise}) : aucune classification correspondante dans votre profil, a verifier."
            )

    # --- Delai -------------------------------------------------------------
    if date_limite:
        try:
            deadline = date.fromisoformat(date_limite[:10])
            jours_restants = (deadline - date.today()).days
            details["delai"] = {"jours_restants": jours_restants}
            if 0 <= jours_restants < 10:
                soft_flags.append(f"Delai serre : {jours_restants} jour(s) restant(s) avant la date limite.")
        except ValueError:
            pass

    if hard_fails:
        verdict = "no_go"
    elif soft_flags:
        verdict = "risque"
    else:
        verdict = "go"

    return {
        "verdict": verdict,
        "raisons": hard_fails + soft_flags,
        # Separes pour le fit score (2026-09-27), qui distingue la barriere
        # d'eligibilite des simples avertissements. `raisons` reste inchange.
        "bloquants": hard_fails,
        "avertissements": soft_flags,
        "details": details,
    }
