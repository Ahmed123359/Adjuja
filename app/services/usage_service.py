import sqlite3
import threading
from functools import lru_cache
from pathlib import Path

_DB_PATH = Path(__file__).parents[2] / "data" / "offria.db"


class UsageService:
    """
    Compteur persistant des tokens consommés et des appels effectués.

    Les données sont stockées dans une table SQLite (`usage`) partagée
    avec les autres services (users, history). Une seule ligne (id=1)
    est maintenue en permanence — elle est créée au premier démarrage
    et n'est jamais supprimée, même après un `reset()`.

    Pourquoi SQLite et non de la mémoire ?
    En mémoire, les compteurs sont perdus à chaque redémarrage Docker
    (déploiement, crash, mise à jour). En production, cela rend le suivi
    de consommation inutilisable. SQLite résout le problème sans dépendance
    externe supplémentaire.

    Thread-safety : `threading.Lock` protège les opérations de lecture-
    écriture pour éviter des incréments perdus sous charge concurrente.
    """

    def __init__(self, db_path: Path = _DB_PATH) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    # ------------------------------------------------------------------
    # Init
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        """Crée la table et initialise la ligne unique si elle n'existe pas."""
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS usage (
                    id               INTEGER PRIMARY KEY CHECK (id = 1),
                    total_tokens     INTEGER NOT NULL DEFAULT 0,
                    total_appels     INTEGER NOT NULL DEFAULT 0
                )
            """)
            # Migration : ajoute la colonne si elle n'existe pas (DB existante)
            # Doit s'exécuter AVANT l'INSERT pour ne pas référencer une colonne absente.
            try:
                conn.execute("ALTER TABLE usage ADD COLUMN total_tokens_ocr INTEGER NOT NULL DEFAULT 0")
            except Exception:
                pass  # Colonne déjà présente
            # INSERT OR IGNORE : crée la ligne au premier démarrage,
            # ne fait rien si elle existe déjà (données conservées).
            conn.execute(
                "INSERT OR IGNORE INTO usage (id, total_tokens, total_appels, total_tokens_ocr) VALUES (1, 0, 0, 0)"
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # Lecture
    # ------------------------------------------------------------------

    @property
    def total_tokens(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT total_tokens FROM usage WHERE id = 1").fetchone()
        return row["total_tokens"] if row else 0

    @property
    def total_appels(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT total_appels FROM usage WHERE id = 1").fetchone()
        return row["total_appels"] if row else 0

    @property
    def total_tokens_ocr(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT total_tokens_ocr FROM usage WHERE id = 1").fetchone()
        return row["total_tokens_ocr"] if row else 0

    # ------------------------------------------------------------------
    # Écriture
    # ------------------------------------------------------------------

    def add(self, tokens: int) -> None:
        """Incrémente tokens + compteur d'appels (génération complète)."""
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE usage SET total_tokens = total_tokens + ?, total_appels = total_appels + 1 WHERE id = 1",
                    (tokens,),
                )

    def add_tokens(self, tokens: int) -> None:
        """Incrémente uniquement les tokens texte (brief, chat — pas un appel complet)."""
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE usage SET total_tokens = total_tokens + ? WHERE id = 1",
                    (tokens,),
                )

    def add_ocr_tokens(self, tokens: int) -> None:
        """Incrémente le compteur OCR (GPT-4o vision sur PDF scanné)."""
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE usage SET total_tokens_ocr = total_tokens_ocr + ? WHERE id = 1",
                    (tokens,),
                )

    def reset(self) -> None:
        """Remet les compteurs à zéro (action manuelle depuis l'UI)."""
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE usage SET total_tokens = 0, total_appels = 0, total_tokens_ocr = 0 WHERE id = 1"
                )


@lru_cache(maxsize=1)
def get_usage_service() -> UsageService:
    """Fournit l'instance singleton du compteur d'usage (SQLite)."""
    return UsageService()
