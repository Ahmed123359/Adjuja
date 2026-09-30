"""Réponses du panneau d'administration. Voir
`context/feature-spec/admin-panel/api.md`."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class Remplissage(BaseModel):
    champ: str
    ouverts_pct: float | None       # None : aucun avis ouvert
    recents_pct: float | None       # None : aucun avis ouvert découvert sur 7 jours
    alerte: bool


class AnalysesSource(BaseModel):
    faites: int
    a_enrichir: int


class EssaiScrape(BaseModel):
    debut: str
    statut: str                     # "ok" | "erreur" | "ignore"
    trouves: int
    enregistres: int
    erreur: str | None
    declenchement: str              # "planifie" | "admin"


class SourceVeille(BaseModel):
    source: str
    table: str                      # "ao" | "bdc"
    ouverts: int
    nouveaux_24h: int
    nouveaux_7j: int
    # Fin du dernier passage réussi (watcher.scrape_runs) ; None si aucun.
    dernier_passage: str | None = None
    # Dernière tentative, quel qu'en soit le résultat : montre une source qui
    # échoue depuis le dernier succès.
    dernier_essai: EssaiScrape | None = None
    # Dernier succès plus vieux que deux intervalles planifiés (ou jamais).
    passage_en_retard: bool = False
    remplissage: list[Remplissage]
    dce_en_echec: int
    analyses: AnalysesSource | None = None   # BDC : pas d'analyse


class VeilleSourcesOut(BaseModel):
    genere_le: str
    sources: list[SourceVeille]


class DceEchec(BaseModel):
    id: int
    table: str
    source: str
    reference: str | None
    titre: str
    acheteur: str | None
    date_limite: str | None
    erreur: str


class DceEchecsOut(BaseModel):
    total: int
    items: list[DceEchec]


# ── Actions sur la veille et journal ─────────────────────────────────────────

class ActionVeilleIn(BaseModel):
    """Paramètres d'une action. `reel` faux (défaut) : simulation, rien n'est
    lu ni appelé. Ignorés pour la relance d'un scrape."""
    reel: bool = False
    limite: int | None = Field(None, ge=1, le=5000)
    source: Literal["marchespublics", "safakat_cdg", "achats_cimr"] | None = None


class ActionLancee(BaseModel):
    id: str                         # ligne du journal
    action: str
    task_id: str
    params: dict[str, Any]


class EtatAction(BaseModel):
    etat: Literal["en_attente", "en_cours", "termine", "echec"]
    progression: dict[str, int] | None = None
    resultat: dict[str, Any] | None = None
    erreur: str | None = None


class JournalAction(BaseModel):
    id: str
    created_at: str
    termine_at: str | None
    admin_email: str
    module: str
    action: str
    params: dict[str, Any] | None
    task_id: str | None
    statut: str                     # "lance" | "termine" | "echec" | "refuse"
    resultat: dict[str, Any] | None


# ── Comptes, organisations, abonnements, accès ───────────────────────────────

class OrganisationLigne(BaseModel):
    org_id: str
    nom: str
    proprietaire_email: str
    membres: int
    offre: str                      # code du plan ; "free" sans abonnement
    statut_abonnement: str | None   # active | past_due | canceled | trialing
    echeance: str | None
    dossiers_mois: int
    dossiers_total: int
    derniere_connexion: str | None  # la plus récente de ses membres
    suspendue: bool                 # tous ses membres suspendus
    creee_le: str


class OrganisationsPage(BaseModel):
    total: int
    page: int
    par_page: int
    items: list[OrganisationLigne]


class Membre(BaseModel):
    id: str
    nom: str
    email: str
    email_verifie: bool
    cree_le: str
    derniere_connexion: str | None
    suspendu_le: str | None
    admin: bool                     # adresse de ADMIN_EMAILS
    proprietaire: bool


class Consommation(BaseModel):
    utilise: int
    limite: int | None              # None = illimité


class DossierResume(BaseModel):
    id: str
    reference: str
    objet: str
    statut: str
    cree_le: str


class AbonnementDetail(BaseModel):
    offre: str
    libelle: str
    prix_mensuel_mad: int
    statut: str | None
    echeance: str | None
    fin_de_grace: str | None
    fournisseur: str | None


class OrganisationDetail(BaseModel):
    org_id: str
    nom: str
    creee_le: str
    membres: list[Membre]
    abonnement: AbonnementDetail
    dossiers_mois: Consommation
    documents: Consommation
    membres_limite: int | None
    dossiers_par_statut: dict[str, int]
    derniers_dossiers: list[DossierResume]
    generations_30j: int


class ChangerOffreIn(BaseModel):
    plan_code: Literal["free", "starter", "pro", "enterprise"]
    duree_mois: int = Field(1, ge=1, le=24)


class SuspensionIn(BaseModel):
    raison: str = Field("", max_length=500)


class AbonnementLigne(BaseModel):
    org_id: str
    nom: str
    offre: str
    statut: str
    echeance: str | None
    fin_de_grace: str | None
    fournisseur: str
    mis_a_jour: str


class AccesAdmin(BaseModel):
    email: str
    compte_existe: bool
    email_verifie: bool
    derniere_connexion: str | None
    actif: bool                     # ouvre vraiment le panneau (existe + vérifié + non suspendu)


class AccesOut(BaseModel):
    administrateurs: list[AccesAdmin]
    inscription_sur_invitation: bool
    adresses_autorisees: list[str]


# ── Tableau de bord ──────────────────────────────────────────────────────────

class Periode(BaseModel):
    j7: int
    j30: int


class PointJour(BaseModel):
    jour: str                       # AAAA-MM-JJ
    valeur: int


class TableauDeBord(BaseModel):
    genere_le: str
    comptes_total: int
    comptes_nouveaux: Periode
    comptes_actifs: Periode         # dernière connexion dans la période
    comptes_suspendus: int
    organisations_total: int
    organisations_par_offre: dict[str, int]
    abonnements_par_statut: dict[str, int]
    # Somme du tarif mensuel affiché des abonnements actifs payants. Aucun
    # montant réellement encaissé n'est enregistré : c'est une estimation.
    revenu_mensuel_estime_mad: int
    dossiers_crees: Periode
    generations: Periode
    paiements_en_retard: int
    echeances_7j: int
    veille_sources_en_retard: int
    veille_champs_en_alerte: int
    veille_dce_en_echec: int
    inscriptions_30j: list[PointJour]
    dossiers_30j: list[PointJour]
