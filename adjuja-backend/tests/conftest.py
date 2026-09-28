from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture(autouse=True)
def _isoler_compteurs():
    """Isole chaque test des compteurs partages.

    - Limiteur : stockage en memoire commun a tout le processus. Sans reset,
      les appels a /generate d'un test consommaient le quota des suivants.
    - Compteur d'usage global (table `usage`) : il n'etait pas mocke et
      s'incrementait dans la vraie base a chaque execution. Une fois
      `max_appels` (company_defaults.json) atteint, /generate repondait 429
      et les tests echouaient selon l'etat de la base, pas selon le code.
    """
    from app.api.dependencies import get_usage_service
    from app.limiter import limiter
    from app.main import app

    limiter._storage.reset()

    usage = MagicMock()
    usage.get_totals = AsyncMock(return_value={"total_appels": 0, "total_tokens": 0, "total_tokens_ocr": 0})
    usage.add = AsyncMock()
    usage.add_tokens = AsyncMock()
    usage.add_ocr_tokens = AsyncMock()
    app.dependency_overrides[get_usage_service] = lambda: usage

    yield

    app.dependency_overrides.pop(get_usage_service, None)
