"""Lecture des résultats publiés : fonctions pures, testées sans réseau.

Spec : context/feature-spec/resultats-attribution/api.md (lot A). Structure
HTML vérifiée sur le portail le 2026-10-01 (carte de résultat BDC).
"""

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup, Tag

CASABLANCA = ZoneInfo("Africa/Casablanca")

# Formes juridiques retirées pour rapprocher « BE DATA SARL » de « Be Data ».
FORMES_JURIDIQUES = (
    "SARL AU", "SARLAU", "S.A.R.L. AU", "S.A.R.L", "SARL", "S.A.", "SA", "SNC", "SAS", "SCS", "GIE", "STE", "STÉ", "SOCIETE",
)


@dataclass
class ResultatPublie:
    source: str
    type_resultat: str                    # resultat_definitif | extrait_pv | bdc
    cle_externe: str
    objet: str
    url_source: str
    reference: str | None = None
    acheteur: str | None = None
    org_acronyme: str | None = None
    procedure: str | None = None
    categorie: str | None = None
    lieu_execution: str | None = None
    date_publication: datetime | None = None
    nb_offres: int | None = None
    est_infructueux: bool = False
    attributaire: str | None = None       # BDC seulement (lot A)
    montant_ttc: Decimal | None = None
    extra: dict = field(default_factory=dict)


def normaliser_nom(nom: str) -> str:
    """Majuscules, sans accents ni ponctuation, forme juridique retirée.
    Clé de rapprochement des soumissionnaires d'un PV à l'autre."""
    t = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode().upper()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    for forme in sorted(FORMES_JURIDIQUES, key=len, reverse=True):
        f = re.sub(r"[^\w\s]", " ", unicodedata.normalize("NFKD", forme).encode("ascii", "ignore").decode())
        f = re.sub(r"\s+", " ", f).strip()
        t = re.sub(rf"(^|\s){re.escape(f)}(\s|$)", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def cle_bdc(reference: str | None, acheteur: str | None, publication: datetime | None) -> str:
    """Les cartes de résultat BDC n'ont aucun identifiant ; une référence
    comme « 07/2026 » est reprise par des milliers d'acheteurs."""
    brut = f"{reference or ''}|{(acheteur or '').upper()}|{publication.strftime('%Y-%m-%d %H:%M') if publication else ''}"
    return hashlib.sha1(brut.encode()).hexdigest()


def lire_montant(texte: str | None) -> Decimal | None:
    if not texte:
        return None
    t = re.sub(r"[^\d,\.]", "", texte.replace(" ", "").replace(" ", ""))
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        return Decimal(t) if t else None
    except InvalidOperation:
        return None


def lire_date_heure(texte: str | None) -> datetime | None:
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{2}):(\d{2}))?", texte or "")
    if not m:
        return None
    j, mo, a, h, mi = m.groups()
    return datetime(int(a), int(mo), int(j), int(h or 0), int(mi or 0), tzinfo=CASABLANCA)


def _apres(card: Tag, libelle: str) -> str | None:
    """Texte qui suit « Libellé : » dans la carte."""
    texte = card.get_text(" ", strip=True)
    m = re.search(rf"{libelle}\s*:\s*(.+?)(?=\s+(?:Objet|Acheteur|Date de publication du résultat|Nombre de devis reçus|Entreprise attributaire|Montant TTC)\s*:|$)", texte)
    return m.group(1).strip() if m else None


def lire_cartes_bdc(html: str, url: str) -> list[ResultatPublie]:
    resultats = []
    for card in BeautifulSoup(html, "html.parser").select("div.entreprise__card"):
        reference = _apres(card, "Référence")
        acheteur = _apres(card, "Acheteur")
        publication = lire_date_heure(_apres(card, "Date de publication du résultat"))
        attributaire = _apres(card, "Entreprise attributaire")
        nb = _apres(card, "Nombre de devis reçus")
        objet_el = card.select_one("[data-bs-title]")
        objet = objet_el["data-bs-title"].strip() if objet_el else (_apres(card, "Objet") or "")
        texte = card.get_text(" ", strip=True)
        resultats.append(ResultatPublie(
            source="marchespublics_bdc", type_resultat="bdc",
            cle_externe=cle_bdc(reference, acheteur, publication),
            objet=objet, url_source=url, reference=reference, acheteur=acheteur,
            date_publication=publication,
            nb_offres=int(re.sub(r"\D", "", nb)) if nb and re.search(r"\d", nb) else None,
            est_infructueux="infructueux" in texte.lower(),
            attributaire=attributaire if attributaire and "infructueux" not in texte.lower() else None,
            montant_ttc=lire_montant(_apres(card, "Montant TTC")),
        ))
    return resultats


def liens_pieces_jointes(html: str, base_url: str) -> list[dict]:
    """Liens de pièce jointe d'une fiche d'annonce, `idAvis` non vide
    (la fiche contient aussi un lien « …&idAvis= » vide)."""
    vus, liens = set(), []
    for a in BeautifulSoup(html, "html.parser").select("a[href*='EntrepriseDownloadAvisJAL']"):
        href = a.get("href", "")
        m = re.search(r"idAvis=(\d+)", href)
        if not m or m.group(1) in vus:
            continue
        vus.add(m.group(1))
        url = href if href.startswith("http") else base_url.rstrip("/") + "/" + href.lstrip("/")
        liens.append({"id_avis": m.group(1), "url": url})
    return liens
