"""
Service de persistance de l'historique des générations.

Stockage : fichier JSON à la racine du projet (history.json).
Thread-safe via threading.Lock.
Maximum MAX_ENTRIES entrées — les plus anciennes sont supprimées au-delà.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock

from app.models.history import HistoryEntry, HistorySummary

logger = logging.getLogger(__name__)

MAX_ENTRIES = 100

# history.json stocké à la racine du projet (même dossier que company_defaults.json)
_DEFAULT_PATH = Path(__file__).resolve().parent.parent.parent / "history.json"


class HistoryService:
    def __init__(self, path: Path | None = None) -> None:
        self._path  = path or _DEFAULT_PATH
        self._lock  = Lock()
        self._entries: list[HistoryEntry] = self._load()

    # ── Persistence ────────────────────────────────────────────

    def _load(self) -> list[HistoryEntry]:
        if not self._path.exists():
            return []
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            return [HistoryEntry(**e) for e in raw]
        except Exception as exc:
            logger.warning("Impossible de lire l'historique (%s) — fichier réinitialisé.", exc)
            return []

    def _save(self) -> None:
        try:
            self._path.write_text(
                json.dumps(
                    [e.model_dump() for e in self._entries],
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.error("Impossible d'écrire l'historique : %s", exc)

    # ── Public API ─────────────────────────────────────────────

    def add(self, entry: HistoryEntry) -> None:
        """Ajoute une entrée en tête de liste (la plus récente en premier)."""
        with self._lock:
            self._entries.insert(0, entry)
            if len(self._entries) > MAX_ENTRIES:
                self._entries = self._entries[:MAX_ENTRIES]
            self._save()

    def list_summaries(self) -> list[HistorySummary]:
        """Retourne la liste allégée (sans résultat complet)."""
        return [HistorySummary.from_entry(e) for e in self._entries]

    def get(self, entry_id: str) -> HistoryEntry | None:
        """Retourne l'entrée complète par son id, ou None si introuvable."""
        return next((e for e in self._entries if e.id == entry_id), None)

    def delete(self, entry_id: str) -> bool:
        """Supprime une entrée. Retourne True si elle existait."""
        with self._lock:
            before = len(self._entries)
            self._entries = [e for e in self._entries if e.id != entry_id]
            if len(self._entries) < before:
                self._save()
                return True
            return False

    def clear(self) -> None:
        """Vide tout l'historique."""
        with self._lock:
            self._entries = []
            self._save()

    @property
    def count(self) -> int:
        return len(self._entries)
