from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class BdcOut(BaseModel):
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
    nature_prestation: str | None
    region: str | None
    ville: str | None
    est_annule: bool
    date_annulation: date | None
    raison_annulation: str | None
    document_url: str | None
    document_nom: str | None
    zip_minio_key: str | None
    zip_downloaded_at: datetime | None
    zip_error: str | None
    status: str
    scraped_at: datetime


class BdcListOut(BaseModel):
    items: list[BdcOut]
    total: int
    page: int
    limit: int


class BdcStatusUpdate(BaseModel):
    status: str


class NaturePrestationOut(BaseModel):
    code: str
    label: str
    categorie: str
