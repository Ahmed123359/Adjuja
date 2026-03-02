from pydantic import BaseModel, Field
from enum import Enum


class TypeMarche(str, Enum):
    """
    Enumération des types de marchés publics selon la nomenclature française.

    Valeurs possibles :
    - TRAVAUX      : marchés de construction, rénovation, génie civil
    - FOURNITURES  : marchés d'achat de matériel, équipements, produits
    - SERVICES     : marchés de prestations intellectuelles ou opérationnelles
    - MIXTE        : combinaison de plusieurs types, ou type indéterminé
    """
    TRAVAUX     = "travaux"
    FOURNITURES = "fournitures"
    SERVICES    = "services"
    MIXTE       = "mixte"


class Critere(BaseModel):
    """
    Critère d'évaluation utilisé par l'acheteur pour noter les offres.

    Les critères et leurs pondérations définissent comment l'acheteur
    comparera les offres reçues. Exemple classique :
    - Prix (40%) + Valeur technique (40%) + Délai (20%) = 100%
    """
    nom: str = Field(
        ...,
        description="Intitulé du critère (ex: 'prix', 'délai', 'qualité technique')",
    )
    ponderation: float = Field(
        ...,
        ge=0,
        le=100,
        description="Poids du critère exprimé en pourcentage (0-100)",
    )
    description: str = Field(
        default="",
        description="Détail sur la façon dont ce critère sera évalué",
    )


class Section(BaseModel):
    """
    Section structurelle d'un appel d'offres (ex: contexte, besoins, livrables).

    Un AO est généralement découpé en sections thématiques qui organisent
    l'information de façon hiérarchique. Cette classe représente l'une d'elles.
    """
    titre: str = Field(..., description="Intitulé de la section")
    contenu: str = Field(..., description="Corps de texte de la section")
    ordre: int = Field(default=0, description="Position de la section dans l'AO (0 = première)")


class AppelOffre(BaseModel):
    """
    Représentation structurée et normalisée d'un appel d'offres.

    Cet objet est produit par `AOParserService` à partir d'un texte brut.
    Il centralise toutes les informations extraites de l'AO et sert de
    base à la construction du prompt de génération.

    Attributs principaux :
    - titre / reference / acheteur : méta-données d'identification
    - type_marche : catégorie du marché (travaux, services, fournitures…)
    - sections : découpage structurel du document source
    - criteres : critères d'évaluation avec pondérations
    - budget_estime / date_limite : contraintes budgétaires et temporelles
    - texte_brut : conservé pour traçabilité et débogage
    """
    titre: str = Field(
        ...,
        description="Titre principal de l'appel d'offres",
    )
    reference: str = Field(
        default="",
        description="Référence ou numéro de marché (ex: 'AO-2024-IT-042')",
    )
    acheteur: str = Field(
        default="",
        description="Nom de l'organisme acheteur (collectivité, entreprise, etc.)",
    )
    type_marche: TypeMarche = Field(
        default=TypeMarche.SERVICES,
        description="Catégorie du marché selon la nomenclature française",
    )
    description_globale: str = Field(
        ...,
        description="Résumé ou extrait des 2000 premiers caractères de l'AO",
    )
    sections: list[Section] = Field(
        default_factory=list,
        description="Sections thématiques extraites du document",
    )
    criteres: list[Critere] = Field(
        default_factory=list,
        description="Critères de sélection et leurs pondérations",
    )
    budget_estime: float | None = Field(
        default=None,
        description="Enveloppe budgétaire estimée en euros (HT), si mentionnée",
    )
    date_limite: str = Field(
        default="",
        description="Date limite de remise des offres au format ISO 8601",
    )
    texte_brut: str = Field(
        default="",
        description="Texte original de l'AO conservé pour traçabilité",
    )
