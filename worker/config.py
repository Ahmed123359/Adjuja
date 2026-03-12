"""
Configuration du worker de scraping.

Toutes les valeurs sont lues depuis les variables d'environnement (préfixe WORKER_).
Les valeurs par défaut sont sûres pour le développement local.
En production, définir au minimum WORKER_HEADLESS=true et les identités fictives.
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    """
    Variables d'environnement du worker (préfixe : WORKER_).

    Exemple .env :
        WORKER_ACHETEURS=["OFFICE NATIONAL DES CHEMINS DE FER","AUTRE ACHETEUR"]
        WORKER_FAKE_NOM=Dupont
        WORKER_FAKE_PRENOM=Jean
        WORKER_FAKE_EMAIL=jean.dupont@exemple.ma
        WORKER_MAX_AOS=20
        WORKER_HEADLESS=true
        WORKER_SLOW_MO=200
        WORKER_SCHEDULE_HOURS=6
        WORKER_DB_PATH=/app/data/ao_catalog.db
        WORKER_OUTPUT_DIR=/app/output
    """

    # ── Identité formulaire de retrait ──────────────────────────────────────
    # Le site marchespublics.gov.ma exige un nom/prénom/email pour enregistrer
    # le retrait du dossier. Ces valeurs n'ont pas besoin d'être réelles.
    fake_nom:    str = "Dupont"
    fake_prenom: str = "Jean"
    fake_email:  str = "jean.dupont@exemple.ma"

    # ── Cibles du scraping ───────────────────────────────────────────────────
    # Liste des acheteurs à scraper, format JSON dans le .env :
    #   WORKER_ACHETEURS=["OFFICE NATIONAL DES CHEMINS DE FER","AUTRE ACHETEUR"]
    # pydantic-settings désérialise automatiquement le JSON en list[str].
    acheteurs: list[str] = ["OFFICE NATIONAL DES CHEMINS DE FER"]

    # ── Paramètres Playwright ────────────────────────────────────────────────
    # En production : headless=true obligatoire (pas d'écran disponible).
    # slow_mo : délai en ms entre actions (200-300 recommandé pour sites lents).
    max_aos:  int  = 2
    headless: bool = True
    slow_mo:  int  = 200

    # ── Planification ────────────────────────────────────────────────────────
    # Intervalle entre deux scrapes complets (en heures).
    # 6h = 4 scrapes/jour, suffisant pour couvrir les nouvelles publications.
    schedule_hours: int = 6

    # ── Chemins (dans le conteneur Docker) ──────────────────────────────────
    # db_path est partagé avec le service API via un volume Docker.
    db_path:    str = "/app/data/ao_catalog.db"
    output_dir: str = "/app/output"

    @field_validator("fake_email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("WORKER_FAKE_EMAIL doit être une adresse email valide")
        return v

    @field_validator("schedule_hours")
    @classmethod
    def validate_schedule(cls, v: int) -> int:
        if v < 1:
            raise ValueError("WORKER_SCHEDULE_HOURS doit être >= 1")
        return v

    model_config = SettingsConfigDict(
        env_prefix="WORKER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
