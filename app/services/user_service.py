import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from passlib.context import CryptContext

from app.models.user import UserCreate, UserPublic

_DB_PATH = Path(__file__).parents[2] / "data" / "offria.db"
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserService:
    def __init__(self, db_path: Path = _DB_PATH):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    # ------------------------------------------------------------------
    # Init
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id          TEXT PRIMARY KEY,
                    nom         TEXT NOT NULL,
                    prenom      TEXT NOT NULL,
                    email       TEXT UNIQUE NOT NULL,
                    hashed_pwd  TEXT NOT NULL,
                    created_at  TEXT NOT NULL
                )
            """)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create(self, data: UserCreate) -> UserPublic:
        user_id    = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        hashed     = _pwd_ctx.hash(data.password)

        with self._lock:
            with self._connect() as conn:
                try:
                    conn.execute(
                        "INSERT INTO users (id, nom, prenom, email, hashed_pwd, created_at) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (user_id, data.nom, data.prenom, data.email, hashed, created_at),
                    )
                except sqlite3.IntegrityError:
                    raise ValueError(f"L'adresse e-mail '{data.email}' est déjà utilisée.")

        return UserPublic(
            id=user_id,
            nom=data.nom,
            prenom=data.prenom,
            email=data.email,
            created_at=created_at,
        )

    def get_by_email(self, email: str) -> UserPublic | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, nom, prenom, email, created_at FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        if row is None:
            return None
        return UserPublic(**dict(row))

    def verify_password(self, email: str, password: str) -> UserPublic | None:
        """Vérifie les credentials. Retourne UserPublic si OK, None sinon."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, nom, prenom, email, hashed_pwd, created_at FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        if row is None:
            return None
        if not _pwd_ctx.verify(password, row["hashed_pwd"]):
            return None
        return UserPublic(
            id=row["id"],
            nom=row["nom"],
            prenom=row["prenom"],
            email=row["email"],
            created_at=row["created_at"],
        )

    def get_or_create_google_user(self, email: str, prenom: str, nom: str) -> UserPublic:
        """Retrouve un utilisateur par email (Google ou classique) ou en crée un nouveau."""
        existing = self.get_by_email(email)
        if existing:
            return existing

        user_id    = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        with self._lock:
            with self._connect() as conn:
                try:
                    conn.execute(
                        "INSERT INTO users (id, nom, prenom, email, hashed_pwd, created_at) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (user_id, nom, prenom, email, "__google_oauth__", created_at),
                    )
                except sqlite3.IntegrityError:
                    # Race condition : un autre thread a créé le compte entre le get et l'insert
                    existing = self.get_by_email(email)
                    if existing:
                        return existing
                    raise
        return UserPublic(id=user_id, nom=nom, prenom=prenom, email=email, created_at=created_at)

    def get_by_id(self, user_id: str) -> UserPublic | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, nom, prenom, email, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return UserPublic(**dict(row))


@lru_cache(maxsize=1)
def get_user_service() -> UserService:
    return UserService()
