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
                    id                TEXT PRIMARY KEY,
                    nom               TEXT NOT NULL,
                    prenom            TEXT NOT NULL,
                    email             TEXT UNIQUE NOT NULL,
                    hashed_pwd        TEXT NOT NULL,
                    created_at        TEXT NOT NULL,
                    email_verified    INTEGER NOT NULL DEFAULT 1,
                    verification_token TEXT,
                    generations_used  INTEGER NOT NULL DEFAULT 0,
                    max_generations   INTEGER NOT NULL DEFAULT 0
                )
            """)
            # Migration colonnes pour les bases existantes
            for col_sql in [
                "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1",
                "ALTER TABLE users ADD COLUMN verification_token TEXT",
                "ALTER TABLE users ADD COLUMN generations_used INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE users ADD COLUMN max_generations INTEGER NOT NULL DEFAULT 0",
            ]:
                try:
                    conn.execute(col_sql)
                except Exception:
                    pass  # colonne déjà présente

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create(self, data: UserCreate, unlimited: bool = False) -> tuple["UserPublic", str]:
        """Crée un compte. Retourne (UserPublic, verification_token).
        unlimited=True → email_verified=1, max_generations=0 (admin)."""
        user_id            = str(uuid.uuid4())
        created_at         = datetime.now(timezone.utc).isoformat()
        hashed             = _pwd_ctx.hash(data.password)
        verification_token = str(uuid.uuid4())
        email_verified     = 1 if unlimited else 0
        max_generations    = 0 if unlimited else 1

        with self._lock:
            with self._connect() as conn:
                try:
                    conn.execute(
                        "INSERT INTO users "
                        "(id, nom, prenom, email, hashed_pwd, created_at, "
                        " email_verified, verification_token, max_generations) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (user_id, data.nom, data.prenom, data.email, hashed,
                         created_at, email_verified, verification_token, max_generations),
                    )
                except sqlite3.IntegrityError:
                    raise ValueError(f"L'adresse e-mail '{data.email}' est déjà utilisée.")

        user = UserPublic(
            id=user_id,
            nom=data.nom,
            prenom=data.prenom,
            email=data.email,
            created_at=created_at,
            email_verified=bool(email_verified),
            generations_used=0,
            max_generations=max_generations,
        )
        return user, verification_token

    def get_by_email(self, email: str) -> UserPublic | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, nom, prenom, email, created_at, "
                "email_verified, generations_used, max_generations "
                "FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_public(row)

    def verify_password(self, email: str, password: str) -> UserPublic | None:
        """Vérifie les credentials. Retourne UserPublic si OK, None sinon."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, nom, prenom, email, hashed_pwd, created_at, "
                "email_verified, generations_used, max_generations "
                "FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        if row is None:
            return None
        if not _pwd_ctx.verify(password, row["hashed_pwd"]):
            return None
        return self._row_to_public(row)

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
                        "INSERT INTO users "
                        "(id, nom, prenom, email, hashed_pwd, created_at, "
                        " email_verified, max_generations) "
                        "VALUES (?, ?, ?, ?, ?, ?, 1, 1)",
                        (user_id, nom, prenom, email, "__google_oauth__", created_at),
                    )
                except sqlite3.IntegrityError:
                    existing = self.get_by_email(email)
                    if existing:
                        return existing
                    raise
        return UserPublic(
            id=user_id, nom=nom, prenom=prenom, email=email, created_at=created_at,
            email_verified=True, generations_used=0, max_generations=1,
        )

    def get_by_id(self, user_id: str) -> UserPublic | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, nom, prenom, email, created_at, "
                "email_verified, generations_used, max_generations "
                "FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_public(row)

    def verify_email(self, token: str) -> UserPublic | None:
        """Vérifie le token email. Retourne UserPublic si OK, None si token invalide."""
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT id FROM users WHERE verification_token = ? AND email_verified = 0",
                    (token,),
                ).fetchone()
                if row is None:
                    return None
                conn.execute(
                    "UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?",
                    (row["id"],),
                )
        return self.get_by_id(row["id"])

    def increment_generations(self, user_id: str) -> None:
        """Incrémente le compteur de générations d'un utilisateur."""
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE users SET generations_used = generations_used + 1 WHERE id = ?",
                    (user_id,),
                )

    # ------------------------------------------------------------------
    # Helpers internes
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_public(row: sqlite3.Row) -> "UserPublic":
        d = dict(row)
        return UserPublic(
            id=d["id"],
            nom=d["nom"],
            prenom=d["prenom"],
            email=d["email"],
            created_at=d["created_at"],
            email_verified=bool(d.get("email_verified", 1)),
            generations_used=d.get("generations_used", 0),
            max_generations=d.get("max_generations", 0),
        )


@lru_cache(maxsize=1)
def get_user_service() -> UserService:
    return UserService()
