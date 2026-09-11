from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date


@dataclass
class BdcData:
    source: str
    external_id: str
    url_source: str
    titre: str
    acheteur: str | None = None
    date_publication: date | None = None
    date_limite: date | None = None
    categorie: str | None = None
    nature_prestation: str | None = None
    region: str | None = None
    ville: str | None = None
    est_annule: bool = False
    date_annulation: date | None = None
    raison_annulation: str | None = None
    document_url: str | None = None
    document_nom: str | None = None


class IBdcScraper(ABC):
    @abstractmethod
    async def fetch_page(self, page: int = 1) -> list[BdcData]:
        """Scrape one page of the BDC listing. Returns empty list when no more results."""

    @abstractmethod
    async def fetch_detail(self, external_id: str) -> BdcData | None:
        """Fetch full BDC data from the detail page."""

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the source portal is reachable."""
