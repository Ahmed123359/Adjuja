#!/usr/bin/env python3
"""
filler_placeholders.py
----------------------
Détection et extraction des placeholders dans les documents texte.

Utilisé par les pipelines PDF texte et DOCX uniquement.
Le pipeline PDF scanné (Pixtral) n'utilise pas ce module :
la détection des placeholders est gérée directement par le modèle vision.

Trois responsabilités :
    1. PH_RE                   : regex de détection des placeholders
    2. has_placeholder()       : teste si une ligne contient un placeholder
    3. extract_replacement_pairs() : associe chaque placeholder original
                                     à sa valeur remplie
    4. build_fill_operations() : construit les opérations de remplacement
                                 avec les métadonnées de position (pour PDF texte)
"""

import re
from typing import Any


# ---------------------------------------------------------------------------
# Regex de détection des placeholders
# ---------------------------------------------------------------------------

# Détecte les formes suivantes :
#   1. Séquences de points/underscores/ellipses (>= 3 caractères) optionnellement
#      suivies d'une phrase indicatrice entre parenthèses (>= 5 caractères)
#      ex: "........ (nom, prenom et qualite)"
#   2. Crochets contenant "completer" ou "préciser"
#      ex: "[a completer]"
#   3. Parenthèses contenant "indiquer" ou "préciser", SANS numéro de note
#      de bas de page (ex: "(1) Indiquer..." est une note, pas un placeholder)
#      Négatif : n'accepte pas si la parenthèse s'ouvre immédiatement sur un chiffre
#      ex: "(indiquer la valeur)" → placeholder
#           "(1) Indiquer les informations..." → note de bas de page, ignorée
PH_RE = re.compile(
    r"(?:[.…_]{3,})(?:\s*\([^)]{5,}\))?"      # points/tirets + hint optionnel
    r"|\[.*?(?:compl[eé]ter|pr[eé]ciser).*?\]"  # [a completer] ou [à préciser]
    r"|\((?!\d+\s*\))(?:[^)]*?)(?:indiquer|pr[eé]ciser)[^)]*\)",  # (indiquer ...) sans note
    re.IGNORECASE,
)


def has_placeholder(text: str) -> bool:
    """
    Indique si la chaîne contient au moins un placeholder.

    Utilisé par les pipelines texte pour filtrer les lignes qui
    nécessitent un remplissage avant de les envoyer au LLM.

    Args:
        text: Texte de la ligne ou du paragraphe à tester.

    Returns:
        True si un placeholder est détecté, False sinon.
    """
    return bool(PH_RE.search(text))


def extract_replacement_pairs(original: str, filled_text: str) -> list[tuple[str, str]]:
    """
    Associe chaque placeholder du texte original à sa valeur remplie.

    Compare le texte original (avec placeholders) au texte rempli retourné
    par le LLM pour identifier exactement ce qui a changé et construire
    les paires (ancien_texte, nouveau_texte) utilisées par fill_text_pdf.

    Stratégie :
        1. Extraire tous les placeholders du texte original via PH_RE.
        2. Construire un pattern regex en remplaçant chaque placeholder
           par un groupe de capture (.+?).
        3. Matcher ce pattern contre le texte rempli pour extraire
           les valeurs insérées par le LLM.
        4. Si le pattern échoue et qu'il n'y a qu'un seul placeholder,
           utiliser une stratégie de prefix/suffix pour extraire la valeur.

    Args:
        original    : Texte original contenant les placeholders.
        filled_text : Texte rempli retourné par le LLM.

    Returns:
        Liste de tuples (placeholder_original, valeur_remplie).
        Liste vide si aucun changement détecté ou si la comparaison échoue.
    """
    if not isinstance(filled_text, str):
        return []

    placeholders = list(PH_RE.finditer(original))
    if not placeholders or original == filled_text:
        return []

    # Construire un pattern de correspondance en préservant le texte fixe
    pattern_parts: list[str] = []
    last = 0
    for ph in placeholders:
        pattern_parts.append(re.escape(original[last:ph.start()]))
        pattern_parts.append("(.+?)")
        last = ph.end()
    pattern_parts.append(re.escape(original[last:]) + "$")

    try:
        match = re.match("".join(pattern_parts), filled_text, re.DOTALL)
    except re.error:
        match = None

    if match:
        pairs: list[tuple[str, str]] = []
        for i, ph in enumerate(placeholders):
            new_value = match.group(i + 1)
            # Ne garder la paire que si la valeur a réellement changé
            if new_value != ph.group(0):
                pairs.append((ph.group(0), new_value))
        return pairs

    # Fallback pour les lignes avec un seul placeholder
    if len(placeholders) == 1:
        ph = placeholders[0]
        prefix = original[:ph.start()]
        suffix = original[ph.end():]
        if filled_text.startswith(prefix) and (not suffix or filled_text.endswith(suffix)):
            end_idx = len(filled_text) - len(suffix) if suffix else len(filled_text)
            new_value = filled_text[len(prefix):end_idx]
            if new_value and new_value != ph.group(0):
                return [(ph.group(0), new_value)]

    return []


def build_fill_operations(
    filled_lines: dict[str, str],
    line_meta: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Construit la liste des opérations de remplacement pour le pipeline PDF texte.

    Pour chaque ligne remplie par le LLM, extrait les paires
    (placeholder_original, valeur_remplie) et les enrichit avec les
    métadonnées de position (page, bbox) nécessaires à fill_text_pdf.

    Args:
        filled_lines : Dictionnaire {id_ligne: texte_rempli} retourné par call_mistral().
        line_meta    : Dictionnaire {id_ligne: {"page_no", "bbox", "original", ...}}
                       construit lors de l'extraction du texte PDF.

    Returns:
        Liste de dicts prêts à être passés à fill_text_pdf() :
        [{"page_no": int, "line_bbox": tuple, "old_text": str, "new_text": str}, ...]
    """
    fill_ops: list[dict[str, Any]] = []

    for line_id, filled_text in filled_lines.items():
        meta = line_meta.get(line_id)
        if not meta:
            continue

        for old_text, new_text in extract_replacement_pairs(meta["original"], filled_text):
            fill_ops.append({
                "page_no":   meta["page_no"],
                "line_bbox": meta["bbox"],
                "old_text":  old_text,
                "new_text":  new_text,
            })

    return fill_ops
