# -*- coding: utf-8 -*-
"""
Mise en correspondance d'un AO scrapé avec la nomenclature de secteurs
(app.core.taxonomie). Texte uniquement, aucune dépendance DB/HTTP : la
même fonction sera réutilisable plus tard par le service de notifications.

Volontairement basé sur des phrases complètes (label du secteur ou
sous-activité entière), jamais sur des mots isolés : `categorie` n'est
qu'un mot générique ("Travaux"/"Services"/"Fournitures") qui apparaît
dans une dizaine de libellés de secteurs différents — le faire correspondre
ferait matcher quasiment tous les AOs sur tous ces secteurs. Le matching
porte donc sur titre + secteur + description uniquement.
"""

import unicodedata

from app.core.taxonomie import SECTEURS

# Mots vides + mots génériques du domaine (apparaissent en tête d'une
# dizaine de libellés de secteurs différents — "Travaux", "Etudes",
# "Matériel"... seuls, ils ne distinguent rien et feraient matcher
# n'importe quel AO sur la moitié de la nomenclature).
_STOPWORDS = {
    "de", "des", "du", "le", "la", "les", "un", "une", "et", "en", "a",
    "au", "aux", "pour", "dans", "ou", "sur", "avec", "par", "ce", "ces",
    "son", "sa", "ses", "leur", "leurs", "qui", "que", "d", "l", "etc",
    "divers", "diverses", "autres", "autre",
    "travaux", "travail", "etudes", "etude", "produits", "produit",
    "materiel", "materiels", "equipement", "equipements", "prestations",
    "prestation", "services", "service", "fourniture", "fournitures",
    "gestion", "systeme",
    # Verbes/noms de procedure d'achat public -- apparaissent dans la
    # quasi-totalite des titres d'AO ("Achat de...", "Acquisition de...",
    # "Realisation de...") donc ne distinguent jamais un domaine d'un autre.
    "achat", "achats", "acquisition", "acquisitions", "realisation",
    "realisations", "marche", "marches",
}

# Une phrase ne sert de signal de matching que si elle garde au moins ce
# nombre de mots significatifs apres filtrage — sinon trop generique
# (ex: secteur "1101 - Maintenance", mot unique, garde a 1 par exception).
MIN_SIGNIFICANT_TOKENS = 2

# Nombre minimum de mots significatifs en commun entre une phrase de la
# nomenclature et le texte de l'AO pour considerer que ca matche. Exiger
# la phrase ENTIERE (tous ses mots) est trop strict : un titre d'AO reel
# est court et ne repete jamais un libelle de 5-6 mots integralement.
# 2 mots significatifs en commun reste specifique (un seul mot generique
# isole ne suffit jamais, cf. _STOPWORDS) tout en restant atteignable.
MIN_MATCHING_TOKENS = 2


def normalize(text: str | None) -> str:
    """Minuscules, accents retires, ponctuation reduite a des espaces."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    return "".join(c if c.isalnum() else " " for c in text)


def _stem(word: str) -> str:
    """Heuristique naive : retire un 's' final pour absorber le pluriel."""
    if len(word) > 4 and word.endswith("s"):
        return word[:-1]
    return word


def _tokenize(text: str) -> set[str]:
    return {
        _stem(w)
        for w in normalize(text).split()
        if len(w) >= 3 and w not in _STOPWORDS
    }


def _phrase_token_sets(secteur) -> list[set[str]]:
    phrases = [secteur.label, *secteur.activites]
    token_sets = (_tokenize(p) for p in phrases)
    return [
        tokens for tokens in token_sets
        if len(tokens) >= MIN_SIGNIFICANT_TOKENS or len(secteur.activites) == 1
    ]


# Precalcule une seule fois au chargement du module : eviter de
# re-tokeniser les ~78 secteurs a chaque appel de match_secteurs().
_SECTEUR_TOKENS: list[tuple[str, list[set[str]]]] = [
    (s.code, _phrase_token_sets(s)) for s in SECTEURS
]


def match_secteurs(
    titre: str | None,
    secteur: str | None,
    description: str | None,
) -> list[str]:
    """Retourne les codes secteur dont le libelle ou une sous-activite a
    tous ses mots significatifs presents dans le texte de l'AO (titre +
    secteur + description). Match au niveau mot (apres stemming naif),
    jamais sur un mot generique isole, pour limiter les faux positifs."""
    blob_tokens = _tokenize(f"{titre or ''} {secteur or ''} {description or ''}")
    if not blob_tokens:
        return []

    def _phrase_matches(tokens: set[str]) -> bool:
        if len(tokens) <= 1:
            return tokens <= blob_tokens
        return len(tokens & blob_tokens) >= MIN_MATCHING_TOKENS

    matched = [
        code
        for code, phrase_token_sets in _SECTEUR_TOKENS
        if any(_phrase_matches(tokens) for tokens in phrase_token_sets)
    ]
    return matched
