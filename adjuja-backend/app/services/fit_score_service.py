"""
Fit score : compatibilite /100 entre un AO et le profil d'une org, decompose en
six facteurs ponderes (spec : context/feature-spec/fit-score/).

- La barriere d'eligibilite reste celle de `compute_verdict`, appelee telle
  quelle : un echec bloquant affiche « non eligible » sans remettre le score a
  zero.
- Un facteur que l'AO n'exige pas est ecarte et les poids restants sont
  renormalises : le score ne reflete que des exigences reelles.
- Les references sont rapprochees de l'objet de l'AO par embeddings
  (mistral-embed) : intitules du profil et documents « Reference de
  realisation » indexes dans `offria_kb_{org_id}`. Sans embeddings (cle
  absente, service injoignable), repli par mots-cles, signale en confiance
  faible.

Tout le calcul est deterministe sauf les embeddings ; les fonctions `facteur_*`
sont pures et testees dans tests/unit/test_fit_score.py.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol

from app.cache import cache
from app.services.eligibility_service import compute_verdict

logger = logging.getLogger(__name__)

POIDS: dict[str, int] = {
    "qualifications": 30,
    "capacite_financiere": 20,
    "references": 20,
    "equipe": 15,
    "conformite_administrative": 10,
    "proximite": 5,
}

# Similarite cosinus a partir de laquelle une reference est « proche » de
# l'objet de l'AO. Valeur initiale, a recalibrer sur 10-20 paires reelles
# (spec api.md, etape 2) : c'est la seule constante a toucher.
SEUIL_SIMILARITE = 0.80
# En dessous, une reference n'apporte rien au score de proximite.
PLANCHER_SIMILARITE = 0.60
# Repli mots-cles : part des mots significatifs communs jugee « proche ».
SEUIL_MOTS = 0.34

_TTL_EMBEDDING = 30 * 24 * 3600
_DOC_TYPES_REFERENCE = ["reference_realisation"]

_MOTS_VIDES = {
    "pour", "dans", "avec", "sans", "des", "les", "une", "sur", "par", "aux",
    "est", "sont", "leur", "leurs", "cette", "ces", "entre", "ainsi", "tout",
    "tous", "toutes", "travaux", "marche", "marches", "prestation", "prestations",
    "objet", "relatif", "relatifs", "relative", "relatives", "concernant",
}


# ── Entrees ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AoContext:
    objet: str = ""
    region: str | None = None
    ville: str | None = None
    date_limite: str | None = None


class _Embedder(Protocol):
    async def embed(self, text: str) -> list[float]: ...

    async def search_org(
        self, org_id: str, vector: list[float], doc_types: list[str], limit: int = 10,
    ) -> list[tuple[float, dict]]: ...


# ── Outils texte ───────────────────────────────────────────────────────────

def _norm(texte: Any) -> str:
    s = unicodedata.normalize("NFD", str(texte or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _mots(texte: Any) -> set[str]:
    return {m for m in _norm(texte).split() if len(m) >= 4 and m not in _MOTS_VIDES}


def _recouvrement(a: Any, b: Any) -> float:
    """Part des mots significatifs communs, rapportee au plus court des deux."""
    ma, mb = _mots(a), _mots(b)
    if not ma or not mb:
        return 0.0
    return len(ma & mb) / min(len(ma), len(mb))


def _cosinus(u: list[float], v: list[float]) -> float:
    num = sum(x * y for x, y in zip(u, v))
    den = math.sqrt(sum(x * x for x in u)) * math.sqrt(sum(y * y for y in v))
    return num / den if den else 0.0


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _facteur(
    code: str,
    score: float | None,
    justification: str,
    confiance: str = "haute",
    action: dict | None = None,
) -> dict:
    exige = score is not None
    return {
        "code": code,
        "poids": POIDS[code],
        "score": round(max(0.0, min(100.0, score))) if exige else None,
        "exige": exige,
        "confiance": confiance,
        "justification": justification,
        "action": action,
    }


def _action(cible: str, champ: str | None = None) -> dict:
    return {"cible": cible, "champ": champ}


# ── Facteurs purs ──────────────────────────────────────────────────────────

def facteur_qualifications(analyse: dict, extra: dict) -> dict:
    requises = [c for c in (analyse.get("certifications_requises") or []) if isinstance(c, str) and c.strip()]
    qualif = analyse.get("qualification_requise")
    if not requises and not qualif:
        return _facteur("qualifications", None, "Aucune certification ni qualification exigée.")

    parts: list[float] = []
    textes: list[str] = []
    action = None

    if requises:
        org = [c.lower() for c in (extra.get("certifications") or []) if isinstance(c, str)]
        # Meme rapprochement textuel que compute_verdict, pour ne pas diverger
        # de la barriere d'eligibilite.
        trouvees = [c for c in requises if any(c.lower() in o or o in c.lower() for o in org)]
        manquantes = [c for c in requises if c not in trouvees]
        parts.append(100 * len(trouvees) / len(requises))
        if manquantes:
            textes.append(f"Certification(s) manquante(s) : {', '.join(manquantes)}.")
            action = _action("profil", "certifications")
        else:
            textes.append(f"Certification(s) exigée(s) présente(s) : {', '.join(requises)}.")

    confiance = "haute"
    if qualif:
        q = str(qualif).lower()
        domaines = [
            str(c.get("domaine", "")) for c in (extra.get("classifications") or [])
            if isinstance(c, dict) and c.get("domaine")
        ]
        match = any(d.lower() in q or q in d.lower() for d in domaines if d)
        # Le domaine se compare, la classe et la categorie non : 75 et non 100.
        parts.append(75 if match else 0)
        if match:
            textes.append(f"Qualification « {qualif} » : domaine présent, classe à vérifier.")
        else:
            textes.append(f"Qualification « {qualif} » : aucune classification correspondante.")
            action = action or _action("profil", "classifications")
        if not requises:
            confiance = "moyenne"

    return _facteur("qualifications", sum(parts) / len(parts), " ".join(textes), confiance, action)


def facteur_capacite_financiere(analyse: dict, extra: dict) -> dict:
    exige = _to_float(analyse.get("chiffre_affaires_minimum_exige"))
    if exige is None or exige <= 0:
        return _facteur("capacite_financiere", None, "Aucun chiffre d'affaires minimum exigé.")
    ca = _to_float(extra.get("chiffre_affaires_moyen"))
    if ca is None:
        return _facteur(
            "capacite_financiere", 0,
            f"Chiffre d'affaires minimum exigé : {exige:,.0f} MAD. Aucun chiffre d'affaires dans votre profil.",
            "faible", _action("profil", "chiffre_affaires_moyen"),
        )
    if ca >= exige:
        return _facteur(
            "capacite_financiere", 100,
            f"Votre chiffre d'affaires moyen ({ca:,.0f} MAD) couvre le minimum exigé ({exige:,.0f} MAD).",
        )
    return _facteur(
        "capacite_financiere", 100 * ca / exige,
        f"Chiffre d'affaires moyen {ca:,.0f} MAD pour {exige:,.0f} MAD exigés.",
        "haute", _action("profil", "chiffre_affaires_moyen"),
    )


def facteur_equipe(analyse: dict, staff: list[Any]) -> dict:
    profils = [p for p in (analyse.get("profils_requis") or []) if isinstance(p, dict)]
    if not profils:
        return _facteur("equipe", None, "Aucun profil exigé.")
    actifs = [cv for cv in staff if getattr(cv, "actif", True)]
    couverts: list[str] = []
    manquants: list[str] = []
    for p in profils:
        besoin = f"{p.get('poste', '')} {p.get('specialite', '')}"
        mini = int(_to_float(p.get("annees_experience_min")) or 0)
        ok = any(
            _recouvrement(besoin, f"{getattr(cv, 'poste', '')} {getattr(cv, 'specialite', '')}") > 0
            and int(getattr(cv, "annees_experience", 0) or 0) >= mini
            for cv in actifs
        )
        (couverts if ok else manquants).append(str(p.get("poste") or "profil"))
    texte = f"{len(couverts)} profil(s) exigé(s) sur {len(profils)} couvert(s) par vos CV."
    if manquants:
        texte += f" À pourvoir : {', '.join(manquants)}."
    return _facteur(
        "equipe", 100 * len(couverts) / len(profils), texte, "moyenne",
        _action("equipe") if manquants else None,
    )


def facteur_conformite(profile: Any, documents: list[Any], aujourdhui: date | None = None) -> dict:
    if profile is None:
        return _facteur(
            "conformite_administrative", 0, "Profil entreprise non renseigné.",
            "haute", _action("profil", "ice"),
        )
    today = aujourdhui or date.today()
    manquants: list[tuple[str, dict]] = []
    for champ, libelle in (("ice", "ICE"), ("rc", "RC"), ("if_fiscal", "identifiant fiscal"), ("cnss", "CNSS")):
        if not str(getattr(profile, champ, "") or "").strip():
            manquants.append((libelle, _action("profil", champ)))

    def _valide(doc: Any) -> bool:
        fin = getattr(doc, "date_validite", None)
        if not fin:
            return True
        try:
            return date.fromisoformat(str(fin)[:10]) >= today
        except ValueError:
            return True

    attestation = [d for d in documents if getattr(d, "doc_type", "") == "attestation_fiscale"]
    if not any(_valide(d) for d in attestation):
        libelle = "attestation fiscale en cours de validité" if attestation else "attestation fiscale"
        manquants.append((libelle, _action("documents")))

    total = 5
    presents = total - len(manquants)
    if not manquants:
        return _facteur("conformite_administrative", 100, "ICE, RC, IF, CNSS et attestation fiscale renseignés.")
    return _facteur(
        "conformite_administrative", 100 * presents / total,
        f"Manquant : {', '.join(m[0] for m in manquants)}.",
        "haute", manquants[0][1],
    )


def facteur_proximite(ctx: AoContext, profile: Any) -> dict:
    lieu_ao = f"{ctx.ville or ''} {ctx.region or ''}".strip()
    ville = str(getattr(profile, "ville", "") or "").strip() if profile is not None else ""
    if not lieu_ao or not ville:
        return _facteur("proximite", None, "Lieu de l'AO ou ville du siège inconnu.")
    if _norm(ville) and _norm(ville) in _norm(lieu_ao):
        return _facteur("proximite", 100, f"AO situé dans votre ville ({ville}).", "faible")
    # L'eloignement ne disqualifie pas : 40, pas 0.
    return _facteur("proximite", 40, f"AO situé hors de votre ville ({lieu_ao} ; siège : {ville}).", "faible")


def score_references(
    similarites: list[tuple[float, str]],
    nb_exige: int | None,
    methode: str,
) -> dict:
    """`similarites` : (similarite, intitule) par reference candidate.
    `methode` : "embeddings" ou "mots_cles" (seuils differents)."""
    seuil = SEUIL_SIMILARITE if methode == "embeddings" else SEUIL_MOTS
    confiance = "faible" if methode == "mots_cles" else "moyenne"
    if nb_exige is None and not similarites:
        return _facteur("references", None, "Aucune référence exigée ni renseignée.")
    if not similarites:
        return _facteur(
            "references", 0, f"{nb_exige} référence(s) similaire(s) exigée(s), aucune dans votre profil.",
            confiance, _action("profil", "references_similaires"),
        )

    proches = [s for s in similarites if s[0] >= seuil]
    meilleure = max(similarites, key=lambda s: s[0])
    if nb_exige:
        score = 100 * min(1.0, len(proches) / nb_exige)
        texte = f"{len(proches)} référence(s) proche(s) de l'objet sur {nb_exige} exigée(s)."
    else:
        if methode == "embeddings":
            score = 100 * (meilleure[0] - PLANCHER_SIMILARITE) / (SEUIL_SIMILARITE - PLANCHER_SIMILARITE)
        else:
            score = 100 * meilleure[0] / SEUIL_MOTS
        texte = f"Référence la plus proche : « {meilleure[1]} »."
    if proches and len(proches) >= (nb_exige or 1):
        confiance = "haute" if methode == "embeddings" else confiance
    action = None if score >= 100 else _action("profil", "references_similaires")
    return _facteur("references", score, texte, confiance, action)


def assembler(facteurs: list[dict], verdict: dict, methode_references: str) -> dict:
    exiges = [f for f in facteurs if f["exige"]]
    total_poids = sum(f["poids"] for f in exiges)
    score = round(sum(f["poids"] * f["score"] for f in exiges) / total_poids) if total_poids else None

    bloquants = list(verdict.get("bloquants") or [])
    avertissements = list(verdict.get("avertissements") or [])
    if bloquants:
        eligibilite = "non_eligible"
    elif "qualification" in (verdict.get("details") or {}):
        eligibilite = "a_verifier"
    else:
        eligibilite = "eligible"

    return {
        "score": score,
        "eligibilite": eligibilite,
        "bloquants": bloquants,
        "avertissements": avertissements,
        "facteurs": facteurs,
        "methode_references": methode_references,
    }


# ── Service ────────────────────────────────────────────────────────────────

class FitScoreService:
    def __init__(self, embedder: _Embedder | None) -> None:
        self._embedder = embedder

    async def _vecteur(self, texte: str) -> list[float]:
        cle = "fit:emb:" + hashlib.sha1(texte.encode("utf-8")).hexdigest()
        cached = cache.get(cle)
        if isinstance(cached, list) and cached:
            return cached
        assert self._embedder is not None
        vec = await self._embedder.embed(texte)
        cache.set(cle, vec, ttl=_TTL_EMBEDDING)
        return vec

    async def _references(
        self, analyse: dict, ctx: AoContext, extra: dict, org_id: str,
    ) -> tuple[dict, str]:
        nb_exige_raw = _to_float(analyse.get("nombre_references_similaires_exige"))
        nb_exige = int(nb_exige_raw) if nb_exige_raw else None
        objet = str((analyse.get("contexte") or {}).get("objet") or ctx.objet or "").strip()
        intitules = [
            str(r.get("intitule", "")).strip()
            for r in (extra.get("references_similaires") or [])
            if isinstance(r, dict) and str(r.get("intitule", "")).strip()
        ]

        if not objet:
            sims = [(0.0, i) for i in intitules]
            return score_references(sims, nb_exige, "mots_cles"), "mots_cles"

        if self._embedder is not None:
            try:
                vec_objet = await self._vecteur(objet)
                sims: list[tuple[float, str]] = []
                for intitule in intitules:
                    sims.append((_cosinus(vec_objet, await self._vecteur(intitule)), intitule))
                for score, payload in await self._embedder.search_org(
                    org_id, vec_objet, _DOC_TYPES_REFERENCE, limit=10,
                ):
                    sims.append((score, str(payload.get("nom_fichier") or "document de référence")))
                return score_references(sims, nb_exige, "embeddings"), "embeddings"
            except Exception as exc:
                logger.info("[fit_score] embeddings indisponibles, repli mots-cles : %s", exc)

        sims = [(_recouvrement(objet, i), i) for i in intitules]
        return score_references(sims, nb_exige, "mots_cles"), "mots_cles"

    async def compute(
        self,
        analyse_json: dict,
        ctx: AoContext,
        profile: Any,
        staff: list[Any],
        documents: list[Any],
        org_id: str,
    ) -> dict:
        analyse = analyse_json or {}
        extra = (getattr(profile, "extra", None) or {}) if profile is not None else {}
        verdict = compute_verdict(analyse, ctx.date_limite, extra)
        references, methode = await self._references(analyse, ctx, extra, org_id)
        facteurs = [
            facteur_qualifications(analyse, extra),
            facteur_capacite_financiere(analyse, extra),
            references,
            facteur_equipe(analyse, staff),
            facteur_conformite(profile, documents),
            facteur_proximite(ctx, profile),
        ]
        return assembler(facteurs, verdict, methode)
