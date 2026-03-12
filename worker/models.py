"""
Modèles de données du worker de scraping.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class AOResult:
    """
    Résultat du scraping pour un appel d'offres.

    Les champs de base (ref_consultation, titre, url_detail) sont toujours
    renseignés. Les champs enrichis sont best-effort : ils sont extraits de
    la page de détail et valent None si l'extraction échoue, sans bloquer
    le reste du traitement.
    """

    # ── Champs de base (toujours présents) ──────────────────────────────────
    ref_consultation: str            # ID interne PRADO  ex : "981730"
    titre:            str            # Titre court       ex : "[25S038] Réalisation..."
    url_detail:       str            # URL fiche détail

    # ── Résultat du téléchargement ───────────────────────────────────────────
    fichier_path: Optional[str] = None   # Chemin local du ZIP téléchargé
    erreur:       Optional[str] = None   # Message d'erreur si échec

    # ── Acheteur de recherche ────────────────────────────────────────────────
    acheteur_filtre: Optional[str] = None  # filtre utilisé lors de la recherche

    # ── Champs enrichis (best-effort, extraits de la page de détail) ─────────
    reference:       Optional[str] = None  # ex : "25S038"
    objet:           Optional[str] = None  # Description complète de l'AO
    acheteur_detail: Optional[str] = None  # ex : "M3 / ONCF - OFFICE NATIONAL..."
    type_annonce:    Optional[str] = None  # ex : "Annonce de consultation"
    procedure:       Optional[str] = None  # ex : "Appel d'offres ouvert | Au rabais"
    categorie:       Optional[str] = None  # ex : "Services"
    contact_nom:     Optional[str] = None  # ex : "NABIL BEN MESSAOUD"
    contact_email:   Optional[str] = None  # ex : "h38710@oncf.ma"
    contact_tel:     Optional[str] = None  # ex : "05 37 77 47 47"
    date_limite:     Optional[str] = None  # ex : "22/04/2026 09:00"
