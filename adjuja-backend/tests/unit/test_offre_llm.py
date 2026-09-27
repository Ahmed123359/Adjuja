"""Appels de l'offre technique via les roles IA (spec fournisseurs-ia, lot 2)."""

import asyncio
import time

import pytest

from app.providers import router
from app.services.offre_technique import llm


class _RateLimitError(Exception):
    status_code = 429


class _FauxProvider:
    def __init__(self, echecs_429=0, pause=0.0):
        self.echecs = echecs_429
        self.pause = pause
        self.appels = []

    async def generate_text(self, system, user, max_tokens, temperature, json_mode=False):
        self.appels.append((system, user, max_tokens, temperature, json_mode))
        if self.echecs:
            self.echecs -= 1
            raise _RateLimitError("trop de requetes")
        time.sleep(self.pause)  # SDK synchrone, comme les vrais providers
        return '{"ok": true}', 10


@pytest.fixture
def faux(monkeypatch):
    holder = {}

    def installer(**kw):
        p = _FauxProvider(**kw)
        holder["p"] = p
        monkeypatch.setattr(router, "get_chat", lambda role="analysis", settings=None: p)
        return p

    return installer


def test_relance_sur_429_puis_succes(faux):
    p = faux(echecs_429=2)
    r = llm.appeler_sync("fast", "sys", "u", temperature=0, max_tokens=100, json_mode=True, retry_delays=(0, 0, 0))
    assert r == '{"ok": true}' and len(p.appels) == 3
    assert p.appels[-1][4] is True


def test_erreur_autre_que_429_remonte_sans_relance(faux, monkeypatch):
    class _Boom:
        async def generate_text(self, *a, **k):
            raise ValueError("cle invalide")

    monkeypatch.setattr(router, "get_chat", lambda role="analysis", settings=None: _Boom())
    with pytest.raises(ValueError):
        llm.appeler_sync("fast", "s", "u", temperature=0, max_tokens=10, retry_delays=(0, 0))


def test_sections_restent_paralleles(faux):
    faux(pause=0.4)

    async def trois():
        return await asyncio.gather(*[
            llm.appeler("analysis", "s", f"u{i}", temperature=0.65, max_tokens=100) for i in range(3)
        ])

    t0 = time.time()
    asyncio.run(trois())
    # Sequentiel : >= 1,2 s. En parallele (threads) : ~0,4 s.
    assert time.time() - t0 < 0.9
