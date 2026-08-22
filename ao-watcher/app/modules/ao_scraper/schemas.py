from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class AoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    external_id: str
    url_source: str
    acheteur: str | None
    titre: str
    date_publication: date | None
    date_limite: date | None
    categorie: str | None
    mode_passation: str | None
    secteur: str | None
    region: str | None
    ville: str | None
    budget_estime: Decimal | None
    caution: Decimal | None
    status: str
    scraped_at: datetime
    zip_url: str | None
    zip_minio_key: str | None
    zip_downloaded_at: datetime | None
    zip_error: str | None
    classified_docs: dict | None
    secteur_codes: list[str] | None
    analyse_json: dict | None


class AoListOut(BaseModel):
    items: list[AoOut]
    total: int
    page: int
    limit: int


class StatusUpdate(BaseModel):
    status: str


class ImportResult(BaseModel):
    ao_id: str
    message: str


class SecteurOut(BaseModel):
    code: str
    label: str
    activites: list[str]
    categorie: str


class ModePassationOut(BaseModel):
    code: str
    label: str


class VerdictOut(BaseModel):
    analyse_json: dict
    verdict: str
    raisons: list[str]
    details: dict
