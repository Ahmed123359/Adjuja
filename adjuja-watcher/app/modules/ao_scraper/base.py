from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass
class AoData:
    source: str
    external_id: str
    url_source: str
    titre: str
    acheteur: str | None = None
    date_publication: date | None = None
    date_limite: date | None = None
    categorie: str | None = None
    secteur: str | None = None
    region: str | None = None
    ville: str | None = None
    budget_estime: Decimal | None = None
    caution: Decimal | None = None
    description: str | None = None
    zip_url: str | None = None
    mode_passation: str | None = None


class IAOScraper(ABC):
    @abstractmethod
    async def fetch_page(self, page: int = 1) -> list[AoData]:
        """Scrape one page of the listing. Returns empty list when no more results."""

    @abstractmethod
    async def fetch_detail(self, external_id: str, org: str) -> AoData | None:
        """Fetch full AO data from the detail page (server-rendered, no Playwright)."""

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the source portal is reachable."""
