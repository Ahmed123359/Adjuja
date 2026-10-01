from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScrapedAo(Base):
    __tablename__ = "scraped_aos"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_source_external"),
        CheckConstraint(
            "status IN ('new', 'seen', 'favorited', 'imported')",
            name="ck_scraped_ao_status",
        ),
        Index("idx_scraped_aos_status", "status"),
        Index("idx_scraped_aos_region", "region"),
        Index("idx_scraped_aos_categorie", "categorie"),
        Index("idx_scraped_aos_mode_passation", "mode_passation"),
        Index("idx_scraped_aos_deadline", "date_limite"),
        Index("idx_scraped_aos_source", "source"),
        Index("idx_scraped_aos_secteur_codes", "secteur_codes", postgresql_using="gin"),
        {"schema": "watcher"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Source identification
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    url_source: Mapped[str] = mapped_column(Text, nullable=False)

    # AO metadata
    acheteur: Mapped[str | None] = mapped_column(Text)
    titre: Mapped[str] = mapped_column(Text, nullable=False)
    date_publication: Mapped[date | None] = mapped_column(Date)
    date_limite: Mapped[date | None] = mapped_column(Date)
    categorie: Mapped[str | None] = mapped_column(String(100))
    mode_passation: Mapped[str | None] = mapped_column(String(255))
    # Reference de l'avis telle que publiee (« 10012003 ») ; external_id est
    # l'identifiant interne du portail. Colonne ajoutee par app.core.schema.
    reference: Mapped[str | None] = mapped_column(String(255))
    secteur: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(String(100))
    ville: Mapped[str | None] = mapped_column(Text)
    # Codes de la nomenclature Sodipress (app.core.taxonomie) matches
    # par mots-cles au moment du scrape  voir matching.py
    secteur_codes: Mapped[list[str] | None] = mapped_column(JSONB)
    budget_estime: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    caution: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    description: Mapped[str | None] = mapped_column(Text)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Document handling (populated lazily on favorite)
    zip_url: Mapped[str | None] = mapped_column(Text)
    zip_minio_key: Mapped[str | None] = mapped_column(Text)
    zip_downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    zip_error: Mapped[str | None] = mapped_column(Text)
    classified_docs: Mapped[dict | None] = mapped_column(JSON)

    # Analyse CPS/RC via Mistral, calculee une seule fois par AO (cache
    # global, partage entre toutes les orgs)  voir analysis.py
    analyse_json: Mapped[dict | None] = mapped_column(JSONB)


class ScrapedBdc(Base):
    """Bons de commande (achats de faible montant, pas de budget publie,
    devis plutot que CPS+RC formels). Table separee de ScrapedAo : pas de
    budget/caution, document unique (pas de classified_docs multi-fichiers),
    et un concept d'annulation propre aux BDC. Le telechargement du
    document est anonyme (verifie par curl sans cookies) -- meme flux
    lazy-download-on-favorite que les AOs. Voir app/modules/bdc_scraper/."""

    __tablename__ = "scraped_bdc"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_bdc_source_external"),
        CheckConstraint(
            "status IN ('new', 'seen', 'favorited')",
            name="ck_scraped_bdc_status",
        ),
        Index("idx_scraped_bdc_status", "status"),
        Index("idx_scraped_bdc_region", "region"),
        Index("idx_scraped_bdc_categorie", "categorie"),
        Index("idx_scraped_bdc_deadline", "date_limite"),
        {"schema": "watcher"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    source: Mapped[str] = mapped_column(String(50), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    url_source: Mapped[str] = mapped_column(Text, nullable=False)

    acheteur: Mapped[str | None] = mapped_column(Text)
    titre: Mapped[str] = mapped_column(Text, nullable=False)
    date_publication: Mapped[date | None] = mapped_column(Date)
    date_limite: Mapped[date | None] = mapped_column(Date)
    categorie: Mapped[str | None] = mapped_column(String(100))
    nature_prestation: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(String(100))
    ville: Mapped[str | None] = mapped_column(Text)

    # Annulation (concept propre aux BDC, absent des AO)
    est_annule: Mapped[bool] = mapped_column(default=False, nullable=False)
    date_annulation: Mapped[date | None] = mapped_column(Date)
    raison_annulation: Mapped[str | None] = mapped_column(Text)

    # Document unique (pas de classification multi-fichiers comme les AOs --
    # un seul fichier/zip par BDC). url_source/nom = ce qui a ete scrape ;
    # zip_* = etat du telechargement lazy declenche au favori.
    document_url: Mapped[str | None] = mapped_column(Text)
    document_nom: Mapped[str | None] = mapped_column(Text)
    zip_minio_key: Mapped[str | None] = mapped_column(Text)
    zip_downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    zip_error: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AwardResult(Base):
    """Un résultat publié : annonce AO (résultat définitif, extrait de PV) ou
    résultat de bon de commande. Spec : context/feature-spec/
    resultats-attribution/api.md (lot A) et suivi-resultats/ (phase 2).

    Jamais purgé : sa valeur est l'historique qu'il accumule. L'attributaire
    ne vit que dans AwardBid (ligne `statut = 'retenu'`), jamais en double ici.
    """

    __tablename__ = "award_results"
    __table_args__ = (
        UniqueConstraint("source", "type_resultat", "cle_externe", name="uq_award_result"),
        CheckConstraint("type_resultat IN ('resultat_definitif', 'extrait_pv', 'bdc')", name="ck_award_type"),
        CheckConstraint(
            "extraction_statut IN ('non_applicable', 'en_attente', 'extrait', 'echec')", name="ck_award_extraction"),
        Index("idx_award_results_date", "date_publication"),
        Index("idx_award_results_acheteur", "acheteur"),
        Index("idx_award_results_extraction", "extraction_statut"),
        Index("idx_award_results_secteur_codes", "secteur_codes", postgresql_using="gin"),
        {"schema": "watcher"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    type_resultat: Mapped[str] = mapped_column(String(20), nullable=False)
    cle_externe: Mapped[str] = mapped_column(String(255), nullable=False)
    org_acronyme: Mapped[str | None] = mapped_column(String(20))
    reference: Mapped[str | None] = mapped_column(String(255))
    objet: Mapped[str] = mapped_column(Text, nullable=False)
    acheteur: Mapped[str | None] = mapped_column(Text)
    procedure: Mapped[str | None] = mapped_column(String(255))
    categorie: Mapped[str | None] = mapped_column(String(100))
    lieu_execution: Mapped[str | None] = mapped_column(Text)
    date_publication: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    nb_offres: Mapped[int | None] = mapped_column()
    est_infructueux: Mapped[bool] = mapped_column(default=False, nullable=False)
    secteur_codes: Mapped[list[str] | None] = mapped_column(JSONB)
    url_source: Mapped[str] = mapped_column(Text, nullable=False)
    # AO : [{"id_avis", "url"}], rempli par une seconde passe (fiche par fiche).
    pieces_jointes: Mapped[list | None] = mapped_column(JSONB)
    extraction_statut: Mapped[str] = mapped_column(String(20), default="en_attente", nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AwardBid(Base):
    """Un soumissionnaire d'un résultat. Lot A : seulement l'attributaire des
    bons de commande (`origine = 'listing_bdc'`) ; le lot B (lecture des PV)
    ajoutera les admis et les écartés."""

    __tablename__ = "award_bids"
    __table_args__ = (
        CheckConstraint("statut IN ('retenu', 'admis', 'ecarte', 'inconnu')", name="ck_award_bid_statut"),
        CheckConstraint("origine IN ('listing_bdc', 'extraction')", name="ck_award_bid_origine"),
        Index("idx_award_bids_nom", "soumissionnaire_normalise"),
        Index("idx_award_bids_result", "result_id"),
        {"schema": "watcher"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    result_id: Mapped[int] = mapped_column(ForeignKey("watcher.award_results.id", ondelete="CASCADE"), nullable=False)
    soumissionnaire: Mapped[str] = mapped_column(Text, nullable=False)
    soumissionnaire_normalise: Mapped[str] = mapped_column(Text, nullable=False)
    lot: Mapped[str | None] = mapped_column(String(50))
    montant_ttc: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    statut: Mapped[str] = mapped_column(String(20), nullable=False)
    origine: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
