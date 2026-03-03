"""
Service de persistance de l'historique des générations.

Stockage : table SQLite `launches` dans data/offria.db.
Clé étrangère : launches.user_id → users.id
Thread-safe via threading.Lock.
"""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from app.models.generation import GenerationResult
from app.models.history import HistoryEntry, HistorySummary

_DB_PATH = Path(__file__).parents[2] / "data" / "offria.db"


class HistoryService:
    def __init__(self, db_path: Path = _DB_PATH) -> None:
        self._db_path = db_path
        self._lock    = threading.Lock()
        self._init_db()

    # ── Init ────────────────────────────────────────────────────

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS launches (
                    id              TEXT    PRIMARY KEY,
                    user_id         TEXT    NOT NULL,
                    created_at      TEXT    NOT NULL,
                    ao_excerpt      TEXT    NOT NULL DEFAULT '',
                    company_nom     TEXT    NOT NULL DEFAULT '',
                    provider        TEXT    NOT NULL DEFAULT '',
                    model           TEXT    NOT NULL DEFAULT '',
                    tokens_utilises INTEGER NOT NULL DEFAULT 0,
                    langue          TEXT    NOT NULL DEFAULT 'fr',
                    result_json     TEXT    NOT NULL DEFAULT '{}',
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_launches_user_id ON launches(user_id)"
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    # ── Public API ──────────────────────────────────────────────

    def add(self, entry: HistoryEntry) -> None:
        """Insère un lancement en base."""
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO launches "
                    "(id, user_id, created_at, ao_excerpt, company_nom, "
                    " provider, model, tokens_utilises, langue, result_json) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        entry.id,
                        entry.user_id,
                        entry.created_at,
                        entry.ao_excerpt,
                        entry.company_nom,
                        entry.provider,
                        entry.model,
                        entry.tokens_utilises,
                        entry.langue,
                        entry.result.model_dump_json(),
                    ),
                )

    def list_summaries(self, user_id: str = "") -> list[HistorySummary]:
        """Liste allégée des lancements d'un utilisateur, du plus récent au plus ancien."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, user_id, created_at, ao_excerpt, company_nom, "
                "       provider, model, tokens_utilises, langue "
                "FROM launches WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        return [HistorySummary(**dict(row)) for row in rows]

    def get(self, entry_id: str, user_id: str = "") -> HistoryEntry | None:
        """Retourne un lancement complet (avec result) pour un utilisateur donné."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM launches WHERE id = ? AND user_id = ?",
                (entry_id, user_id),
            ).fetchone()
        if row is None:
            return None
        d = dict(row)
        result = GenerationResult.model_validate_json(d.pop("result_json"))
        return HistoryEntry(**d, result=result)

    def delete(self, entry_id: str, user_id: str = "") -> bool:
        """Supprime un lancement. Retourne True s'il existait."""
        with self._lock:
            with self._connect() as conn:
                cursor = conn.execute(
                    "DELETE FROM launches WHERE id = ? AND user_id = ?",
                    (entry_id, user_id),
                )
                return cursor.rowcount > 0

    def clear(self, user_id: str = "") -> None:
        """Supprime tous les lancements d'un utilisateur."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM launches WHERE user_id = ?", (user_id,))

    @property
    def count(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM launches").fetchone()[0]
