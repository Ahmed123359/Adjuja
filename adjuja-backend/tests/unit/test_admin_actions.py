"""Panneau d'administration : actions sur la veille, journal, passages de scrape.

Voir context/feature-spec/admin-panel/api.md. La veille est simulée par
httpx.MockTransport, le journal par un faux enregistreur : ni base ni réseau.
"""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.config.settings import get_settings
from app.models.admin import ActionVeilleIn, SourceVeille
from app.models.user import UserPublic
from app.services.admin import actions, comptes, tableau_de_bord, veille

ADMIN = UserPublic(id="u1", nom="N", prenom="P", email="admin@adjuja.ma", created_at="2026-09-30T00:00:00")
TASK = "0f4c2d6e-1a2b-4c3d-8e9f-001122334455"
_Client = httpx.AsyncClient


def _settings(url: str = "http://veille:8001", secret: str = "s3cret"):
    return get_settings().model_copy(update={"watcher_service_url": url, "watcher_admin_secret": secret})


@pytest.fixture
def journal(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    j = AsyncMock(return_value="journal-1")
    monkeypatch.setattr(actions, "journaliser", j)
    return j


def _veille(monkeypatch: pytest.MonkeyPatch, reponse: httpx.Response | Exception) -> list[httpx.Request]:
    recues: list[httpx.Request] = []

    def repondre(requete: httpx.Request) -> httpx.Response:
        recues.append(requete)
        if isinstance(reponse, Exception):
            raise reponse
        return reponse

    monkeypatch.setattr(
        actions.httpx, "AsyncClient",
        lambda **kw: _Client(transport=httpx.MockTransport(repondre), **kw),
    )
    return recues


# ── Corps envoyé à la veille ─────────────────────────────────────────────────

def test_corps_scrape_ignore_les_parametres() -> None:
    p = ActionVeilleIn(reel=True, limite=5, source="achats_cimr")
    assert actions.corps_action("scrape-bdc", p) == {"cible": "bdc"}


def test_corps_rattrapage_garde_la_source() -> None:
    p = ActionVeilleIn(reel=True, limite=5, source="achats_cimr")
    assert actions.corps_action("rattrapage-details", p) == {"reel": True, "limite": 5, "source": "achats_cimr"}
    assert actions.corps_action("enrichir-analyses", p) == {"reel": True, "limite": 5}


def test_simulation_par_defaut() -> None:
    assert actions.corps_action("enrichir-analyses", ActionVeilleIn()) == {"reel": False, "limite": None}


# ── Lancement ────────────────────────────────────────────────────────────────

async def test_lancement_relaie_et_journalise(monkeypatch: pytest.MonkeyPatch, journal: AsyncMock) -> None:
    recues = _veille(monkeypatch, httpx.Response(200, json={"task_id": TASK, "action": "rattrapage-details"}))
    r = await actions.lancer_action_veille(ADMIN, "rattrapage-details", ActionVeilleIn(), _settings())
    assert (r.task_id, r.id) == (TASK, "journal-1")
    assert str(recues[0].url) == "http://veille:8001/admin/rattrapage-details"
    assert recues[0].headers["X-Admin-Secret"] == "s3cret"
    assert journal.await_args.args[3] == "lance"


@pytest.mark.parametrize("reponse,code,statut", [
    (httpx.Response(409, json={"detail": "Déjà en cours (tâche x)."}), 409, "refuse"),
    (httpx.Response(403, json={"detail": "Accès refusé."}), 502, "echec"),
    (httpx.Response(500, text="boom"), 502, "echec"),
    (httpx.ConnectError("refus"), 503, "echec"),
])
async def test_refus_de_la_veille(
    monkeypatch: pytest.MonkeyPatch, journal: AsyncMock, reponse, code: int, statut: str,
) -> None:
    _veille(monkeypatch, reponse)
    with pytest.raises(actions.ActionErreur) as e:
        await actions.lancer_action_veille(ADMIN, "enrichir-analyses", ActionVeilleIn(reel=True), _settings())
    assert e.value.status_code == code
    # Même un refus laisse une trace.
    assert journal.await_args.args[3] == statut


async def test_non_configure_503_sans_appel(monkeypatch: pytest.MonkeyPatch, journal: AsyncMock) -> None:
    recues = _veille(monkeypatch, httpx.Response(200, json={"task_id": TASK}))
    with pytest.raises(actions.ActionErreur) as e:
        await actions.lancer_action_veille(ADMIN, "scrape-ao", ActionVeilleIn(), _settings(secret=""))
    assert e.value.status_code == 503 and not recues


async def test_action_inconnue_404(journal: AsyncMock) -> None:
    with pytest.raises(actions.ActionErreur) as e:
        await actions.lancer_action_veille(ADMIN, "supprimer-tout", ActionVeilleIn(), _settings())
    assert e.value.status_code == 404
    journal.assert_not_awaited()


# ── État et journal ──────────────────────────────────────────────────────────

def _fausse_base(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    db = MagicMock()
    db.execute, db.commit = AsyncMock(), AsyncMock()
    session = MagicMock()
    session.__aenter__, session.__aexit__ = AsyncMock(return_value=db), AsyncMock(return_value=False)
    monkeypatch.setattr(actions, "AsyncSessionLocal", lambda: session)
    return db


async def test_tache_en_cours_ne_touche_pas_au_journal(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _fausse_base(monkeypatch)
    _veille(monkeypatch, httpx.Response(200, json={"etat": "en_cours", "progression": {"fait": 2, "total": 9}}))
    e = await actions.etat_action(TASK, _settings())
    assert e.progression == {"fait": 2, "total": 9}
    db.execute.assert_not_awaited()


async def test_tache_terminee_complete_le_journal(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _fausse_base(monkeypatch)
    _veille(monkeypatch, httpx.Response(200, json={"etat": "termine", "resultat": {"a_completer": 4}}))
    assert (await actions.etat_action(TASK, _settings())).resultat == {"a_completer": 4}
    db.execute.assert_awaited_once()
    db.commit.assert_awaited_once()


# ── Passages de scrape ───────────────────────────────────────────────────────

MAINTENANT = datetime(2026, 9, 30, 12, tzinfo=timezone.utc)


@pytest.mark.parametrize("dernier_ok,deja,attendu", [
    (MAINTENANT - timedelta(hours=11), True, False),
    (MAINTENANT - timedelta(hours=13), True, True),    # plus de 2 x 6 h
    (None, True, True),                                 # a tourné, jamais réussi
    (None, False, False),                               # table neuve : on ne sait rien
])
def test_passage_en_retard(dernier_ok, deja: bool, attendu: bool) -> None:
    assert veille.passage_en_retard(dernier_ok, deja, MAINTENANT, 6) is attendu


def test_source_qui_echoue_depuis_son_dernier_succes() -> None:
    s = SourceVeille(source="safakat_cdg", table="ao", ouverts=1, nouveaux_24h=0, nouveaux_7j=0,
                     remplissage=[], dce_en_echec=0)
    essais = {"safakat_cdg": {
        "debut": MAINTENANT - timedelta(hours=1), "statut": "erreur", "trouves": 0, "enregistres": 0,
        "erreur": "TimeoutError: portail", "declenchement": "planifie",
    }}
    succes = {"safakat_cdg": MAINTENANT - timedelta(hours=30)}
    s = veille.completer_passages(s, essais, succes, MAINTENANT, 6)
    assert s.passage_en_retard
    assert s.dernier_essai is not None and s.dernier_essai.erreur == "TimeoutError: portail"
    assert s.dernier_passage == (MAINTENANT - timedelta(hours=30)).isoformat()


async def test_journal_rafraichit_les_taches_en_cours(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _fausse_base(monkeypatch)
    lignes = MagicMock()
    lignes.scalars.return_value.all.side_effect = [[TASK], []]
    db.execute = AsyncMock(return_value=lignes)
    etat = AsyncMock()
    monkeypatch.setattr(actions, "etat_action", etat)
    await actions.journal(10, _settings())
    etat.assert_awaited_once_with(TASK, _settings())


async def test_journal_sans_veille_configuree_ne_rafraichit_pas(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _fausse_base(monkeypatch)
    lignes = MagicMock()
    lignes.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=lignes)
    etat = AsyncMock()
    monkeypatch.setattr(actions, "etat_action", etat)
    await actions.journal(10, _settings(secret=""))
    etat.assert_not_awaited()


# ── Comptes et tableau de bord (fonctions pures) ─────────────────────────────

def test_filtres_saisie_toujours_liee() -> None:
    where, params = comptes.filtres_organisations("Cabinet' OR 1=1 --", "pro", "actif", "2026-09-01")
    assert "Cabinet" not in where and "1=1" not in where
    assert params == {"recherche": "%cabinet' or 1=1 --%", "offre": "pro", "depuis": "2026-09-01"}


def test_filtres_vides() -> None:
    assert comptes.filtres_organisations("  ", None, None, "x") == ("", {})


def test_echeance_en_periodes_de_30_jours() -> None:
    assert comptes.echeance_apres(MAINTENANT, 2) == (MAINTENANT + timedelta(days=60)).isoformat()


def test_serie_complete_avec_zeros() -> None:
    s = tableau_de_bord.serie_complete(date(2026, 9, 30), 3, {"2026-09-29": 4})
    assert [(p.jour, p.valeur) for p in s] == [("2026-09-28", 0), ("2026-09-29", 4), ("2026-09-30", 0)]


def test_revenu_estime_actifs_payants_seulement() -> None:
    assert tableau_de_bord.revenu_estime([
        ("pro", "active"), ("starter", "active"), ("enterprise", "past_due"), ("free", "active"),
    ]) == 990 + 490
