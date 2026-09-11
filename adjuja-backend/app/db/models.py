from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Any, Optional

from app.db.base import Base


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"
    __table_args__ = (UniqueConstraint("email", name="uq_newsletter_email"),)

    id: Mapped[str]        = mapped_column(String(36), primary_key=True)
    email: Mapped[str]     = mapped_column(String(255), nullable=False, index=True)
    active: Mapped[bool]   = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[str] = mapped_column(String(50))


class Marche(Base):
    __tablename__ = "marches"
    __table_args__ = (
        Index("idx_marches_org_id", "org_id"),
        Index("idx_marches_user_id", "user_id"),
    )

    id: Mapped[str]               = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str]           = mapped_column(String(36), index=True)
    user_id: Mapped[str]          = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[str]       = mapped_column(String(50))
    reference: Mapped[str]        = mapped_column(String(255), default="")
    acheteur: Mapped[str]         = mapped_column(String(255), default="")
    objet: Mapped[str]            = mapped_column(Text, default="")
    statut: Mapped[str]           = mapped_column(String(50), default="en_cours")
    cps_key: Mapped[str | None]   = mapped_column(String(512), nullable=True)
    rc_key: Mapped[str | None]    = mapped_column(String(512), nullable=True)

    offre_technique_jobs: Mapped[list["OffreTechniqueJob"]] = relationship(back_populates="marche", cascade="all, delete-orphan")
    filler_jobs: Mapped[list["FillerJob"]]                  = relationship(back_populates="marche", cascade="all, delete-orphan")
    signing_jobs: Mapped[list["SigningJob"]]                 = relationship(back_populates="marche", cascade="all, delete-orphan")


class OffreTechniqueJob(Base):
    __tablename__ = "offre_technique_jobs"

    id: Mapped[str]         = mapped_column(String(36), primary_key=True)
    marche_id: Mapped[str]  = mapped_column(String(36), ForeignKey("marches.id"), index=True)
    org_id: Mapped[str]     = mapped_column(String(36))
    created_at: Mapped[str] = mapped_column(String(50))
    job_id: Mapped[str]     = mapped_column(String(36))
    statut: Mapped[str]     = mapped_column(String(50), default="termine")

    marche: Mapped["Marche"] = relationship(back_populates="offre_technique_jobs")


class FillerJob(Base):
    __tablename__ = "filler_jobs"

    id: Mapped[str]         = mapped_column(String(36), primary_key=True)
    marche_id: Mapped[str]  = mapped_column(String(36), ForeignKey("marches.id"), index=True)
    org_id: Mapped[str]     = mapped_column(String(36))
    created_at: Mapped[str] = mapped_column(String(50))
    job_id: Mapped[str]     = mapped_column(String(36))
    statut: Mapped[str]     = mapped_column(String(50), default="termine")

    marche: Mapped["Marche"] = relationship(back_populates="filler_jobs")


class SigningJob(Base):
    __tablename__ = "signing_jobs"

    id: Mapped[str]         = mapped_column(String(36), primary_key=True)
    marche_id: Mapped[str]  = mapped_column(String(36), ForeignKey("marches.id"), index=True)
    org_id: Mapped[str]     = mapped_column(String(36))
    created_at: Mapped[str] = mapped_column(String(50))
    job_id: Mapped[str]     = mapped_column(String(36))
    statut: Mapped[str]     = mapped_column(String(50), default="termine")

    marche: Mapped["Marche"] = relationship(back_populates="signing_jobs")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str]           = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str]     = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str]         = mapped_column(String(255))
    slug: Mapped[str]         = mapped_column(String(100), unique=True, index=True)
    created_at: Mapped[str]   = mapped_column(String(50))

    # foreign_keys explicite : owner_id est aussi une FK vers users.id, donc SQLAlchemy
    # ne peut plus deviner tout seul quelle colonne relie Organization a User ici.
    users: Mapped[list["User"]]    = relationship(back_populates="org", cascade="all, delete-orphan", foreign_keys="User.org_id")
    launches: Mapped[list["Launch"]] = relationship(back_populates="org", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str]                      = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str | None]           = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True, index=True)
    nom: Mapped[str]                     = mapped_column(String(255))
    prenom: Mapped[str]                  = mapped_column(String(255))
    email: Mapped[str]                   = mapped_column(String(255), unique=True, index=True)
    hashed_pwd: Mapped[str]              = mapped_column(Text)
    created_at: Mapped[str]              = mapped_column(String(50))
    email_verified: Mapped[bool]         = mapped_column(Boolean, default=True)
    verification_token: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    generations_used: Mapped[int]        = mapped_column(Integer, default=0)
    max_generations: Mapped[int]         = mapped_column(Integer, default=0)
    entreprise: Mapped[str]              = mapped_column(String(255), default="")
    secteur_activite: Mapped[str]        = mapped_column(String(100), default="")
    nb_ao_par_an: Mapped[int | None]     = mapped_column(Integer, nullable=True)

    org: Mapped["Organization | None"]   = relationship(back_populates="users", foreign_keys=[org_id])
    launches: Mapped[list["Launch"]]     = relationship(back_populates="user", cascade="all, delete-orphan")


class Launch(Base):
    __tablename__ = "launches"
    __table_args__ = (
        Index("idx_launches_user_id", "user_id"),
        Index("idx_launches_org_id", "org_id"),
    )

    id: Mapped[str]              = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str]         = mapped_column(String(36), ForeignKey("users.id"))
    org_id: Mapped[str | None]   = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True)
    created_at: Mapped[str]      = mapped_column(String(50))
    ao_excerpt: Mapped[str]      = mapped_column(Text, default="")
    company_nom: Mapped[str]     = mapped_column(String(255), default="")
    provider: Mapped[str]        = mapped_column(String(50), default="")
    model: Mapped[str]           = mapped_column(String(100), default="")
    tokens_utilises: Mapped[int] = mapped_column(Integer, default=0)
    langue: Mapped[str]          = mapped_column(String(10), default="fr")
    result_json: Mapped[str]     = mapped_column(Text, default="{}")
    minio_job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    user: Mapped["User"]              = relationship(back_populates="launches")
    org: Mapped["Organization | None"] = relationship(back_populates="launches")


class Usage(Base):
    __tablename__ = "usage"

    id: Mapped[int]                = mapped_column(Integer, primary_key=True, default=1)
    total_tokens: Mapped[int]      = mapped_column(Integer, default=0)
    total_appels: Mapped[int]      = mapped_column(Integer, default=0)
    total_tokens_ocr: Mapped[int]  = mapped_column(Integer, default=0)


# ---------------------------------------------------------------------------
# Phase 4  Pipeline AO automatisé
# ---------------------------------------------------------------------------

class AppelOffre(Base):
    """Dossier AO principal. Un dossier par appel d'offres soumis par l'entreprise."""
    __tablename__ = "appels_offres"
    __table_args__ = (
        Index("idx_ao_org_id", "org_id"),
        Index("idx_ao_user_id", "user_id"),
        Index("idx_ao_statut", "statut"),
    )

    id: Mapped[str]                   = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str]               = mapped_column(String(36), nullable=False)
    user_id: Mapped[str]              = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[str]           = mapped_column(String(50), nullable=False)
    updated_at: Mapped[str]           = mapped_column(String(50), nullable=False)

    reference: Mapped[str]            = mapped_column(String(255), default="")
    acheteur: Mapped[str]             = mapped_column(String(255), default="")
    objet: Mapped[str]                = mapped_column(Text, default="")

    # Statut pipeline : brouillon → en_analyse → en_traitement → termine → erreur
    # (+ abandonne : refus explicite a l'etape Decision du mode accompagne)
    statut: Mapped[str]               = mapped_column(String(50), default="brouillon")
    # Regime de traitement : express (un clic, chain Celery) | accompagne (7 etapes validees)
    mode: Mapped[str]                 = mapped_column(String(20), default="express", server_default="express", nullable=False)
    pipeline_pct: Mapped[int]         = mapped_column(Integer, default=0)
    erreur_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Résultat de task_analyze_ao_context  structure définie dans architecture.md §5
    analyse_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Instructions spécifiques à cet AO, injectées dans tous les prompts LLM du pipeline
    custom_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    documents: Mapped[list["AoDocument"]] = relationship(back_populates="ao", cascade="all, delete-orphan")


class AoDocument(Base):
    """Un fichier associé à un dossier AO (source uploadé ou généré)."""
    __tablename__ = "ao_documents"
    __table_args__ = (
        Index("idx_aodoc_ao_id", "ao_id"),
        Index("idx_aodoc_doc_type", "doc_type"),
    )

    id: Mapped[str]            = mapped_column(String(36), primary_key=True)
    ao_id: Mapped[str]         = mapped_column(String(36), ForeignKey("appels_offres.id"), nullable=False)
    created_at: Mapped[str]    = mapped_column(String(50), nullable=False)

    # Dossier : source | technique | financier | administratif | output
    dossier: Mapped[str]       = mapped_column(String(50), nullable=False)
    # Type : cps | rc | note_metho | acte_engagement | bordereau | declaration_honneur | zip_final | autre
    doc_type: Mapped[str]      = mapped_column(String(100), nullable=False)
    # Origine : upload (utilisateur) | genere (LLM) | rempli (filler) | signe (signing)
    origine: Mapped[str]       = mapped_column(String(50), nullable=False, default="upload")
    # Statut : en_attente | traite | erreur
    statut: Mapped[str]        = mapped_column(String(50), nullable=False, default="en_attente")

    minio_key: Mapped[str | None]   = mapped_column(String(512), nullable=True)
    nom_fichier: Mapped[str]        = mapped_column(String(255), default="")
    taille_octets: Mapped[int]      = mapped_column(Integer, default=0)

    ao: Mapped["AppelOffre"] = relationship(back_populates="documents")


class CompanyProfile(Base):
    """Profil de l'entreprise par org. Remplace la saisie manuelle à chaque génération."""
    __tablename__ = "company_profiles"

    id: Mapped[str]              = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str]          = mapped_column(String(36), nullable=False, unique=True, index=True)
    created_at: Mapped[str]      = mapped_column(String(50), nullable=False)
    updated_at: Mapped[str]      = mapped_column(String(50), nullable=False)

    nom_entreprise: Mapped[str]  = mapped_column(String(255), default="")
    ice: Mapped[str]             = mapped_column(String(50), default="")
    rc: Mapped[str]              = mapped_column(String(50), default="")
    if_fiscal: Mapped[str]       = mapped_column(String(50), default="")
    cnss: Mapped[str]            = mapped_column(String(50), default="")
    capital_social: Mapped[str]  = mapped_column(String(100), default="")
    rib: Mapped[str]             = mapped_column(String(100), default="")
    forme_juridique: Mapped[str] = mapped_column(String(100), default="")
    adresse: Mapped[str]         = mapped_column(Text, default="")
    ville: Mapped[str]           = mapped_column(String(100), default="")
    telephone: Mapped[str]       = mapped_column(String(20), default="")
    email: Mapped[str]           = mapped_column(String(255), default="")
    gerant_nom: Mapped[str]      = mapped_column(String(255), default="")
    gerant_prenom: Mapped[str]   = mapped_column(String(255), default="")
    gerant_cin: Mapped[str]      = mapped_column(String(20), default="")
    secteur: Mapped[str]         = mapped_column(String(255), default="")
    # Style et tonalité globaux de l'org, injectés dans tous les pipelines
    custom_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Données supplémentaires libres (capital, garanties, références, etc.)
    extra: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Images signature, cachet, lu_et_accepte (MinIO)
    signature_minio_key:           Mapped[str | None] = mapped_column(String(512), nullable=True)
    cachet_minio_key:              Mapped[str | None] = mapped_column(String(512), nullable=True)
    lu_et_accepte_minio_key:       Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Template DOCX pour la note méthodologique (branding org)
    template_note_metho_minio_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


class StaffCv(Base):
    """CV d'un intervenant pour la constitution du dossier technique."""
    __tablename__ = "staff_cvs"
    __table_args__ = (
        Index("idx_staffcv_org_id", "org_id"),
    )

    id: Mapped[str]            = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str]        = mapped_column(String(36), nullable=False)
    created_at: Mapped[str]    = mapped_column(String(50), nullable=False)
    updated_at: Mapped[str]    = mapped_column(String(50), nullable=False)

    nom: Mapped[str]           = mapped_column(String(255), default="")
    prenom: Mapped[str]        = mapped_column(String(255), default="")
    poste: Mapped[str]         = mapped_column(String(255), default="")
    diplome: Mapped[str]       = mapped_column(String(255), default="")
    annees_experience: Mapped[int]  = mapped_column(Integer, default=0)
    specialite:        Mapped[str]  = mapped_column(String(255), default="")
    actif:             Mapped[bool] = mapped_column(Boolean, default=True)
    # Compétences, expériences, références, etc.
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Clé MinIO du PDF CV si uploadé
    cv_minio_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


class CompanyDocument(Base):
    """Document permanent de l'entreprise (attestations, gérance, diplômes...)."""
    __tablename__ = "company_documents"
    __table_args__ = (
        Index("idx_companydoc_org_id",   "org_id"),
        Index("idx_companydoc_doc_type", "doc_type"),
    )

    id:            Mapped[str]           = mapped_column(String(36), primary_key=True)
    org_id:        Mapped[str]           = mapped_column(String(36), nullable=False)
    created_at:    Mapped[str]           = mapped_column(String(50), nullable=False)
    updated_at:    Mapped[str]           = mapped_column(String(50), nullable=False)
    # Types: pouvoir_gerance | attestation_fiscale | attestation_cnas | attestation_casnos
    #        reference_realisation | diplome | autre
    doc_type:      Mapped[str]           = mapped_column(String(100), nullable=False)
    nom_fichier:   Mapped[str]           = mapped_column(String(255), default="")
    minio_key:     Mapped[str | None]    = mapped_column(String(512), nullable=True)
    description:   Mapped[str | None]    = mapped_column(Text, nullable=True)
    date_validite: Mapped[str | None]    = mapped_column(String(50), nullable=True)


class AoTeamMember(Base):
    """Membre de l'équipe affecté à un AO spécifique (lien AO <-> StaffCv)."""
    __tablename__ = "ao_team_members"
    __table_args__ = (
        Index("idx_aoteam_ao_id", "ao_id"),
    )

    id:                Mapped[str]        = mapped_column(String(36), primary_key=True)
    ao_id:             Mapped[str]        = mapped_column(String(36), ForeignKey("appels_offres.id"), nullable=False)
    staff_cv_id:       Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("staff_cvs.id"), nullable=True)
    created_at:        Mapped[str]        = mapped_column(String(50), nullable=False)
    role_dans_offre:   Mapped[str]        = mapped_column(String(255), default="")
    profil_requis_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True si aucun CV de l'org ne couvre ce profil requis
    warning:           Mapped[bool]       = mapped_column(Boolean, default=False)


class AoPipelineStep(Base):
    """Une etape du parcours en mode accompagne, pour un AO donne.

    Table dediee plutot qu'un blob JSON sur appels_offres : on a besoin de savoir
    qui a valide quoi et quand (donnee d'audit), et de repondre par requete indexee
    a "quels AO attendent une validation" (dashboard-collaboratif).

    Horodatages en str ISO 8601 comme tout le domaine AO (AppelOffre.created_at),
    pour ne pas melanger deux conventions de serialisation dans la meme reponse API.
    """
    __tablename__ = "ao_pipeline_steps"
    __table_args__ = (
        UniqueConstraint("ao_id", "step_key", name="uq_aostep_ao_step"),
        Index("idx_aostep_ao_order", "ao_id", "step_order"),
    )

    id:             Mapped[str]        = mapped_column(String(36), primary_key=True)
    ao_id:          Mapped[str]        = mapped_column(
        String(36), ForeignKey("appels_offres.id", ondelete="CASCADE"), nullable=False)
    step_key:       Mapped[str]        = mapped_column(String(50), nullable=False)
    step_order:     Mapped[int]        = mapped_column(Integer, nullable=False)
    # a_faire | en_cours | attente_validation | validee | non_applicable | erreur
    statut:         Mapped[str]        = mapped_column(String(30), default="a_faire", nullable=False)
    # None = applicabilite pas encore determinee (avant l'analyse)
    applicable:     Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    erreur_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at:     Mapped[str | None] = mapped_column(String(50), nullable=True)
    completed_at:   Mapped[str | None] = mapped_column(String(50), nullable=True)
    validated_at:   Mapped[str | None] = mapped_column(String(50), nullable=True)
    validated_by:   Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


# ---------------------------------------------------------------------------
# Billing & Subscriptions
# ---------------------------------------------------------------------------

class Subscription(Base):
    """Etat d'abonnement d'un org. Source de vérité unique pour l'accès aux
    fonctionnalités payantes -- jamais un appel live au provider de paiement."""
    __tablename__ = "subscriptions"

    id: Mapped[str]         = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str]     = mapped_column(String(36), ForeignKey("organizations.id"), unique=True, index=True)
    plan_code: Mapped[str]  = mapped_column(String(20), default="free")
    # active | past_due | canceled | trialing
    status: Mapped[str]     = mapped_column(String(20), default="active")
    current_period_end: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # manual | cmi
    provider: Mapped[str]        = mapped_column(String(20), default="manual")
    provider_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    grace_until: Mapped[str | None]  = mapped_column(String(50), nullable=True)
    created_at: Mapped[str] = mapped_column(String(50))
    updated_at: Mapped[str] = mapped_column(String(50))


class BillingEvent(Base):
    """Garde-fou d'idempotence pour les webhooks. Un provider (CMI ou autre) peut
    rejouer un callback ; un provider_event_id déjà vu est ignoré plutôt que de
    réactiver l'abonnement une deuxième fois."""
    __tablename__ = "billing_events"
    __table_args__ = (
        UniqueConstraint("provider", "provider_event_id", name="uq_billing_event"),
    )

    id: Mapped[str]                = mapped_column(String(36), primary_key=True)
    provider: Mapped[str]          = mapped_column(String(20))
    provider_event_id: Mapped[str] = mapped_column(String(255))
    org_id: Mapped[str | None]     = mapped_column(String(36), nullable=True)
    event_type: Mapped[str]        = mapped_column(String(50))
    raw_payload: Mapped[str]       = mapped_column(Text)
    processed_at: Mapped[str]      = mapped_column(String(50))
