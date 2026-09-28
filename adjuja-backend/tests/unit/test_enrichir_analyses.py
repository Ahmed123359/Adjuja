"""Selection des AO a enrichir par app/scripts/enrichir_analyses.py."""

from datetime import date, timedelta
from types import SimpleNamespace

from app.scripts.enrichir_analyses import _date, est_ouvert

DEMAIN = (date.today() + timedelta(days=1)).isoformat()
HIER = (date.today() - timedelta(days=1)).isoformat()


def _ao(statut="en_traitement", date_limite=None, analyse=None):
    return SimpleNamespace(statut=statut, date_limite=date_limite, analyse_json=analyse or {"contexte": {}})


def test_formats_de_date():
    assert _date("2026-10-12") == date(2026, 10, 12)
    assert _date("2026-10-12T09:00:00") == date(2026, 10, 12)
    assert _date("12/10/2026") == date(2026, 10, 12)
    assert _date("12-10-2026") == date(2026, 10, 12)
    assert _date("non_disponible") is None
    assert _date(None) is None


def test_ao_ouvert_ou_ferme():
    assert est_ouvert(_ao(date_limite=DEMAIN)) is True
    assert est_ouvert(_ao(date_limite=HIER)) is False
    assert est_ouvert(_ao(statut="abandonne", date_limite=DEMAIN)) is False


def test_date_de_l_analyse_en_repli():
    assert est_ouvert(_ao(analyse={"contexte": {"date_limite": HIER}})) is False
    assert est_ouvert(_ao(analyse={"contexte": {"date_limite": DEMAIN}})) is True


def test_date_inconnue_compte_comme_ouvert():
    assert est_ouvert(_ao(analyse={"contexte": {"date_limite": "non_disponible"}})) is True
