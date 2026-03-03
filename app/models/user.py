from pydantic import BaseModel, Field, EmailStr, field_validator

# ── Règles de mot de passe ─────────────────────────────────────────────────────
# Source unique de vérité : ces constantes sont utilisées par le validateur Pydantic
# ET exposées via GET /api/v1/auth/password-rules pour que le frontend se synchronise
# automatiquement. Modifier ici suffit — le frontend s'adapte sans aucune retouche.
PASSWORD_MIN_LENGTH:   int  = 8
PASSWORD_REQUIRE_DIGIT: bool = True
# ──────────────────────────────────────────────────────────────────────────────


class UserCreate(BaseModel):
    nom:      str = Field(..., min_length=1, description="Nom de famille")
    prenom:   str = Field(..., min_length=1, description="Prénom")
    email:    EmailStr = Field(..., description="Adresse e-mail (identifiant unique)")
    password: str = Field(..., description="Mot de passe")

    @field_validator("password")
    @classmethod
    def valider_mot_de_passe(cls, v: str) -> str:
        """
        Valide la force du mot de passe côté backend.

        Cette validation est indispensable côté serveur car le frontend peut être
        contourné : un appel curl direct ignore complètement les contrôles JavaScript.

        Les règles sont lues depuis les constantes PASSWORD_* définies dans ce module,
        qui sont aussi exposées via l'endpoint /auth/password-rules.
        Modifier les constantes suffit pour mettre à jour backend ET frontend.
        """
        if len(v) < PASSWORD_MIN_LENGTH:
            raise ValueError(f"Le mot de passe doit contenir au moins {PASSWORD_MIN_LENGTH} caractères.")
        if PASSWORD_REQUIRE_DIGIT and not any(c.isdigit() for c in v):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
        return v


class UserPublic(BaseModel):
    id:         str
    nom:        str
    prenom:     str
    email:      str
    created_at: str


class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"
