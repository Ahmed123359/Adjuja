from pydantic import BaseModel, ConfigDict, Field
from enum import Enum
from typing import Literal


class ProviderEnum(str, Enum):
    """
    Enumération des providers LLM supportés par l'application.

    Chaque valeur correspond à l'identifiant attendu dans `GenerationRequest.provider`
    et dans le registre de `ProviderFactory`.
    """
    OPENAI    = "openai"
    ANTHROPIC = "anthropic"
    MISTRAL   = "mistral"
    DEEPSEEK  = "deepseek"


class CompanyContext(BaseModel):
    """
    Contexte de l'entreprise qui soumet une réponse à l'appel d'offres.

    Ces informations sont injectées dans le prompt pour personnaliser la réponse
    générée : le LLM peut ainsi mettre en avant les expertises pertinentes,
    les références similaires et les atouts de l'entreprise face aux critères
    de l'acheteur.
    """
    nom: str = Field(
        ...,
        description="Raison sociale de l'entreprise",
    )
    description: str = Field(
        default="",
        description="Présentation générale de l'activité et du positionnement de l'entreprise",
    )
    expertises: list[str] = Field(
        default_factory=list,
        description="Liste des domaines d'expertise (ex: ['développement web', 'cloud AWS'])",
    )
    references: list[str] = Field(
        default_factory=list,
        description="Références de projets similaires déjà réalisés (max 5 recommandés)",
    )
    effectif: int | None = Field(
        default=None,
        description="Nombre de collaborateurs (utilisé pour démontrer la capacité de production)",
    )
    chiffre_affaires: str = Field(
        default="",
        description="Chiffre d'affaires annuel sous forme lisible (ex: '5M€', '500K€')",
    )


class GenerationRequest(BaseModel):
    """
    Requête complète de génération d'une réponse à un appel d'offres.

    C'est le point d'entrée de l'API. Elle contient :
    - Le texte brut de l'AO à traiter
    - Le choix du provider LLM et du modèle
    - Le contexte de l'entreprise répondante
    - Les paramètres de génération (température, longueur max)
    """
    ao_texte: str = Field(
        ...,
        min_length=50,
        max_length=50_000,
        description="Texte complet de l'appel d'offres (entre 50 et 50 000 caractères)",
    )
    provider: ProviderEnum = Field(
        default=ProviderEnum.ANTHROPIC,
        description="Provider LLM à utiliser pour la génération",
    )
    model: str = Field(
        default="",
        description=(
            "Identifiant du modèle spécifique (ex: 'claude-opus-4-6', 'gpt-4o'). "
            "Laisser vide pour utiliser le modèle par défaut du provider."
        ),
    )
    contexte_entreprise: CompanyContext = Field(
        ...,
        description="Informations sur l'entreprise qui répond à l'AO",
    )
    instructions_supplementaires: str = Field(
        default="",
        description="Instructions additionnelles transmises au LLM (ton, contraintes, focus particulier)",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Niveau de créativité du modèle (0 = déterministe, 1 = très créatif)",
    )
    max_tokens: int = Field(
        default=4096,
        ge=256,
        le=16000,
        description="Nombre maximum de tokens dans la réponse générée",
    )
    langue: Literal["fr", "en"] = Field(
        default="fr",
        description="Langue de rédaction de la réponse ('fr' = français, 'en' = anglais)",
    )


class SectionReponse(BaseModel):
    """
    Section individuelle d'une réponse générée à un AO.

    Le texte brut retourné par le LLM est découpé en sections selon les titres
    Markdown (`## Titre`) pour faciliter la manipulation côté client.
    """
    titre: str = Field(..., description="Titre de la section (extrait du Markdown)")
    contenu: str = Field(..., description="Corps de la section")
    ordre: int = Field(..., description="Position de la section dans la réponse (0 = première)")


class GenerationResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    """
    Résultat renvoyé par l'API après une génération.

    En cas de succès (`succes=True`), `texte_complet` contient la réponse
    complète et `sections` son découpage structuré.
    En cas d'échec (`succes=False`), `erreur` décrit la raison de l'échec
    et les champs de contenu sont vides.
    """
    succes: bool = Field(
        ...,
        description="True si la génération a abouti, False en cas d'erreur",
    )
    provider_utilise: str = Field(
        ...,
        description="Identifiant du provider effectivement utilisé",
    )
    model_utilise: str = Field(
        ...,
        description="Identifiant du modèle effectivement utilisé",
    )
    sections: list[SectionReponse] = Field(
        default_factory=list,
        description="Réponse découpée en sections structurées",
    )
    texte_complet: str = Field(
        default="",
        description="Réponse complète en Markdown brut",
    )
    tokens_utilises: int = Field(
        default=0,
        description="Nombre total de tokens consommés (entrée + sortie)",
    )
    erreur: str | None = Field(
        default=None,
        description="Message d'erreur détaillé si succes=False, None sinon",
    )
    brief_strategique: str = Field(
        default="",
        description="Brief stratégique interne généré en phase 1 (enjeux, différenciants, pondération)",
    )


class ModeleDisponible(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    """
    Descripteur d'un modèle LLM disponible dans l'application.

    Retourné par les endpoints `/api/v1/models` pour permettre aux clients
    de lister et choisir le modèle à utiliser dans leurs requêtes.
    """
    provider: str = Field(..., description="Identifiant du provider (ex: 'anthropic')")
    model_id: str = Field(..., description="Identifiant du modèle à passer dans GenerationRequest.model")
    description: str = Field(..., description="Description courte des caractéristiques du modèle")
    defaut: bool = Field(default=False, description="True si c'est le modèle par défaut de ce provider")
