from pydantic import BaseModel, Field, EmailStr


class UserCreate(BaseModel):
    nom:      str = Field(..., min_length=1, description="Nom de famille")
    prenom:   str = Field(..., min_length=1, description="Prénom")
    email:    EmailStr = Field(..., description="Adresse e-mail (identifiant unique)")
    password: str = Field(..., min_length=6, description="Mot de passe (min 6 caractères)")


class UserPublic(BaseModel):
    id:         str
    nom:        str
    prenom:     str
    email:      str
    created_at: str


class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"
