"""
Manifest  suivi des fichiers indexés.

Le manifest est un fichier JSON stocké dans knowledge_base/.rag_manifest.json.
Il persiste entre les redémarrages du service ETL et permet de n'indexer
que les fichiers nouveaux ou modifiés (détection par hash SHA256).
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class FileRecord:
    sha256:     str
    indexed_at: str
    doc_type:   str
    chunk_count: int


class Manifest:
    """
    Suit quels fichiers ont été indexés et avec quel hash.

    Le fichier JSON est lu au démarrage et mis à jour après chaque indexation.
    En cas de corruption du fichier, le manifest repart de zéro.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._data: dict[str, FileRecord] = {}
        self._load()

    # ── Lecture ─────────────────────────────────────────────────────────────

    def file_hash(self, path: Path) -> str:
        """Calcule le SHA256 d'un fichier."""
        h = hashlib.sha256()
        h.update(path.read_bytes())
        return h.hexdigest()

    def is_indexed(self, rel_path: str, current_hash: str) -> bool:
        """True si le fichier est déjà indexé avec le même hash."""
        record = self._data.get(rel_path)
        return record is not None and record.sha256 == current_hash

    def all_entries(self) -> dict[str, FileRecord]:
        """Retourne une copie de toutes les entrées du manifest."""
        return dict(self._data)

    def get_record(self, rel_path: str) -> FileRecord | None:
        return self._data.get(rel_path)

    # ── Écriture ─────────────────────────────────────────────────────────────

    def record(self, rel_path: str, sha256: str, doc_type: str, chunk_count: int) -> None:
        """Enregistre ou met à jour une entrée dans le manifest."""
        self._data[rel_path] = FileRecord(
            sha256=sha256,
            indexed_at=datetime.now(timezone.utc).isoformat(),
            doc_type=doc_type,
            chunk_count=chunk_count,
        )
        self._save()

    def remove(self, rel_path: str) -> None:
        """Supprime une entrée du manifest (fichier supprimé de knowledge_base/)."""
        self._data.pop(rel_path, None)
        self._save()

    def clear(self) -> None:
        """Vide complètement le manifest (utilisé lors d'un reset)."""
        self._data.clear()
        self._save()

    # ── Persistance ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            for k, v in raw.get("files", {}).items():
                self._data[k] = FileRecord(**v)
            logger.info("Manifest chargé : %d fichiers", len(self._data))
        except Exception as exc:
            logger.warning("Manifest corrompu, réinitialisation : %s", exc)
            self._data = {}

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": "1.0",
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "files": {k: asdict(v) for k, v in self._data.items()},
        }
        self._path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
