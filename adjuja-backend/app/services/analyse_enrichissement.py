# -*- coding: utf-8 -*-
"""Analyse AO enrichie : fonctions pures (gravite des risques, normalisation,
priorisation des articles). Spec : context/feature-spec/analyse-ao-enrichie/api.md.

COPIE MIROIR : ce fichier existe a l'identique dans
  adjuja-watcher/app/modules/ao_scraper/enrichissement.py
  adjuja-backend/app/services/analyse_enrichissement.py
Les deux services ne partagent pas de code (meme principe que la lecture des
lots, _lire_type / _assemble_lots). Toute modification se fait dans les deux
fichiers ; les tests sont les memes des deux cotes.
"""

import re
import unicodedata
from typing import Any

TYPES_RISQUE = ("financier", "penalites", "eliminatoire", "capacite_technique", "delai", "administratif")
PROBABILITES = ("faible", "moyenne", "forte")
IMPACTS = ("faible", "moyen", "fort")
TYPES_JALON = ("depot", "visite", "questions", "ouverture", "execution", "autre")
# Du plus grave au moins grave : sert aussi au tri.
GRAVITES = ("critique", "elevee", "moderee", "faible")

# Probabilite x impact -> gravite. Calculee ici, jamais par le modele, pour que
# deux analyses du meme document donnent la meme gravite.
_MATRICE = {
    ("forte", "fort"): "critique",
    ("forte", "moyen"): "elevee",
    ("forte", "faible"): "moderee",
    ("moyenne", "fort"): "elevee",
    ("moyenne", "moyen"): "moderee",
    ("moyenne", "faible"): "faible",
    ("faible", "fort"): "moderee",
    ("faible", "moyen"): "faible",
    ("faible", "faible"): "faible",
}

PLAFONDS = {"risques": 10, "clauses_a_surveiller": 8, "questions_moa": 8, "jalons": 10}

# Le modele confond parfois le genre des adjectifs : on accepte les deux formes.
_ALIAS_PROBABILITE = {"moyen": "moyenne", "fort": "forte", "faibles": "faible"}
_ALIAS_IMPACT = {"moyenne": "moyen", "forte": "fort", "faibles": "faible"}


def _sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texte) if unicodedata.category(c) != "Mn")


def _valeur(v: Any) -> str:
    return _sans_accents(str(v)).strip().lower().replace(" ", "_") if v is not None else ""


def calculer_gravite(probabilite: str, impact: str) -> str:
    """Gravite a partir des deux axes. Leve KeyError sur une valeur hors liste."""
    return _MATRICE[(probabilite, impact)]


def normaliser_risques(risques: Any) -> tuple[list[dict], int]:
    """Valide, calcule la gravite, trie et plafonne les risques du modele.

    Retourne (risques retenus, nombre d'ecartes). Un risque dont le type, la
    probabilite ou l'impact sort des valeurs fermees est ecarte ; une gravite
    fournie par le modele est toujours ecrasee.
    """
    if not isinstance(risques, list):
        return [], 0
    retenus, ecartes = [], 0
    for r in risques:
        if not isinstance(r, dict):
            ecartes += 1
            continue
        type_ = _valeur(r.get("type"))
        proba = _valeur(r.get("probabilite"))
        proba = _ALIAS_PROBABILITE.get(proba, proba)
        impact = _valeur(r.get("impact"))
        impact = _ALIAS_IMPACT.get(impact, impact)
        if type_ not in TYPES_RISQUE or proba not in PROBABILITES or impact not in IMPACTS:
            ecartes += 1
            continue
        risque = dict(r)
        risque.update(type=type_, probabilite=proba, impact=impact, gravite=calculer_gravite(proba, impact))
        retenus.append(risque)
    retenus.sort(key=lambda r: (GRAVITES.index(r["gravite"]), TYPES_RISQUE.index(r["type"])))
    return retenus[: PLAFONDS["risques"]], ecartes


def normaliser_analyse(resultat: dict) -> dict:
    """Met les nouvelles cles de l'analyse dans une forme sure pour l'ecran.

    Ne touche pas aux cles existantes (verdict Go/No-Go et fit score les lisent).
    Une cle absente reste absente : c'est ce qui distingue une analyse
    anterieure au chantier d'une analyse qui n'a rien trouve.
    """
    if "risques" in resultat:
        resultat["risques"], ecartes = normaliser_risques(resultat.get("risques"))
        if ecartes:
            resultat.setdefault("_analyse_meta", {})["risques_ecartes"] = ecartes
    for cle in ("clauses_a_surveiller", "questions_moa", "jalons"):
        if cle in resultat:
            valeur = resultat.get(cle)
            liste = [x for x in valeur if isinstance(x, dict)] if isinstance(valeur, list) else []
            resultat[cle] = liste[: PLAFONDS[cle]]
    for jalon in resultat.get("jalons") or []:
        type_ = _valeur(jalon.get("type"))
        jalon["type"] = type_ if type_ in TYPES_JALON else "autre"
    if "decomposition_budgetaire" in resultat and not isinstance(resultat.get("decomposition_budgetaire"), dict):
        resultat["decomposition_budgetaire"] = None
    return resultat


# ── Priorisation des articles ────────────────────────────────────────────────

# En-tete d'article en debut de ligne : « Article 12 », « ARTICLE 12 : »,
# « Art. 12 », « Article n° 12 ».
_ENTETE = re.compile(r"(?im)^[ \t]*(?:article|art\.)[ \t]*(?:n[°o][ \t]*)?(\d+)")

# Mots qui signalent un article porteur de risque (taxonomie validee le
# 2026-09-12), sans accents : le texte est compare sans accents.
MOTS_CLES = (
    "penalite", "retard", "delai", "paiement", "avance", "retenue", "garantie",
    "caution", "cautionnement", "revision des prix", "resiliation", "assurance",
    "sous-traitance", "reception", "pieces", "qualification", "classification",
    "reference", "chiffre d'affaires", "visite", "echantillon", "critere",
    "note technique", "elimin", "jugement", "moyens humains", "materiel",
    "certificat", "agrement", "amende", "force majeure", "litige",
)

PREAMBULE_MAX = 3000
ARTICLES_MIN = 3


def _score(article: str) -> float:
    """Nombre de mots-cles par millier de caracteres."""
    bas = _sans_accents(article).lower()
    occurrences = sum(bas.count(m) for m in MOTS_CLES)
    return occurrences * 1000 / max(len(article), 1)


def prioriser_articles(texte: str, budget: int) -> tuple[str, dict]:
    """Ramene `texte` a `budget` caracteres en gardant les articles utiles.

    - texte dans le budget : rendu tel quel ;
    - moins de 3 articles reperes (document non structure) : coupe simple,
      comme avant ce chantier ;
    - sinon : preambule garde, articles classes par densite de mots-cles,
      retenus jusqu'au budget puis remis dans l'ordre du document.
    """
    if len(texte) <= budget:
        return texte, {"methode": "complet", "caracteres_perdus": 0}

    entetes = list(_ENTETE.finditer(texte))
    if len(entetes) < ARTICLES_MIN:
        return texte[:budget], {"methode": "coupe", "caracteres_perdus": len(texte) - budget}

    preambule = texte[: entetes[0].start()][:PREAMBULE_MAX]
    articles = []
    for i, m in enumerate(entetes):
        fin = entetes[i + 1].start() if i + 1 < len(entetes) else len(texte)
        articles.append((i, m.group(1), texte[m.start():fin]))

    reste = budget - len(preambule)
    gardes = []
    for i, numero, corps in sorted(articles, key=lambda a: (-_score(a[2]), a[0])):
        if len(corps) <= reste:
            gardes.append((i, numero, corps))
            reste -= len(corps)
    gardes.sort(key=lambda a: a[0])

    indices = {a[0] for a in gardes}
    resultat = preambule + "".join(corps for _, _, corps in gardes)
    return resultat, {
        "methode": "articles",
        "articles_total": len(articles),
        "articles_gardes": len(gardes),
        "articles_ecartes": [numero for i, numero, _ in articles if i not in indices],
        "caracteres_perdus": len(texte) - len(resultat),
    }


# ── Consignes ajoutees au prompt d'analyse ───────────────────────────────────

STRUCTURE_JSON = """  "risques": [
    {"type": "penalites", "titre": "...", "clause": "citation courte et exacte", "reference": "CPS, article 24",
     "probabilite": "moyenne", "impact": "fort", "conseil": "action concrete pour l'entreprise"}
  ],
  "decomposition_budgetaire": {"montant_estime": null, "postes": [{"libelle": "...", "montant": null}], "source": "citation"},
  "clauses_a_surveiller": [{"sujet": "...", "clause": "citation", "reference": "CPS, article 18", "pourquoi": "..."}],
  "questions_moa": [{"question": "...", "motif": "ambiguite ou contradiction relevee", "reference": "RC, article 7"}],
  "jalons": [{"libelle": "...", "date": "AAAA-MM-JJ ou texte exact", "type": "visite", "reference": "RC, article 9"}]"""

REGLES = """- NE JAMAIS INVENTER : un montant, une date ou une clause absents du texte donnent null ou une liste vide
- risques : au plus 10. type parmi financier, penalites, eliminatoire, capacite_technique, delai, administratif. probabilite parmi faible, moyenne, forte. impact parmi faible, moyen, fort. Pas de champ gravite. Chaque risque cite la clause exacte et sa reference (document et article)
- decomposition_budgetaire : null si le document ne chiffre rien
- clauses_a_surveiller : au plus 8, clauses contractuelles defavorables ou inhabituelles (retenue, revision des prix, resiliation, assurance, sous-traitance)
- questions_moa : au plus 8, seulement les ambiguites reelles (contradiction CPS/RC, quantite manquante, critere flou), jamais de question generique
- jalons : au plus 10, type parmi depot, visite, questions, ouverture, execution, autre ; date au format AAAA-MM-JJ si elle est precise, sinon le texte exact"""


# ── Re-analyse des AO deja analyses (api.md, section 4) ──────────────────────

NOUVELLES_CLES = ("risques", "decomposition_budgetaire", "clauses_a_surveiller", "questions_moa", "jalons")


def fusionner_enrichissement(ancienne: dict, nouvelle: dict) -> dict:
    """Ajoute a une analyse existante les cinq nouvelles cles d'une re-analyse.

    Ne remplace JAMAIS une cle existante : en mode accompagne, l'utilisateur a
    pu corriger l'analyse a l'etape « Comprehension ». La meta de la
    re-analyse est rangee a part (`_analyse_meta.enrichissement`).
    """
    fusion = dict(ancienne)
    for cle in NOUVELLES_CLES:
        if cle not in fusion and cle in nouvelle:
            fusion[cle] = nouvelle[cle]
    meta = dict(ancienne.get("_analyse_meta") or {})
    meta["enrichissement"] = nouvelle.get("_analyse_meta") or {}
    fusion["_analyse_meta"] = meta
    return fusion


def a_enrichir(analyse: dict | None) -> bool:
    """Vrai pour une analyse anterieure au chantier (pas de cle `risques`)."""
    return bool(analyse) and "risques" not in analyse
